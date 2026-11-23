/*
 POST /api/emails/send

 Sends the personalized email to one chunk of voters of an election.

 - Every recipient must belong to the election roster.
 - A ballot token is created on first send and kept on resends.
 - Attachments arrive as base64 inside the JSON body: nothing is stored on disk
   (Vercel has no writable disk) and nothing is kept after the request.
 - The page sends several small chunks, so one request stays short and a single
   bad recipient does not abort the whole roster.
*/

import { Buffer } from "node:buffer";
import { findElectionById } from "../../lib/elections.js";
import { findRosterPeople } from "../../lib/voters.js";
import { ensureBallotTokens } from "../../lib/tokens.js";
import { buildEmail, type EmailRecipient } from "../../lib/email-template.js";
import {
  MailSendError,
  getMailConfig,
  sendMail,
  type OutgoingAttachment,
} from "../../lib/emails.js";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_TOTAL_BYTES,
} from "../../lib/email-limits.js";
import { readSessionUser } from "../../lib/session.js";
import { recordAudit } from "../../lib/audit.js";
import { RATE_LIMITS, rateLimitGuard, withRateLimitHeaders } from "../../lib/rate-limit.js";
import { emailSendSchema } from "../../lib/validation.js";
import type { MailRecipientResult } from "../../lib/types.js";

/* Resend is happier with few parallel requests; a chunk of 6 finishes fast. */
const CONCURRENCY = 3;

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/* File names are metadata: strip anything that looks like a path or control char. */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/]/g, "_")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
}

function appBaseUrl(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured !== undefined && configured !== "") return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  const user = readSessionUser(request);
  if (user === null) return json({ error: "unauthenticated" }, 401);

  /* Sending mail is the most expensive action here, so it is limited per admin. */
  const guard = await rateLimitGuard(
    "email:admin",
    user.id,
    RATE_LIMITS.emailSend.limit,
    RATE_LIMITS.emailSend.windowMs,
  );
  if (guard.denied !== null) return guard.denied;

  function withLimits(response: Response): Response {
    return withRateLimitHeaders(response, guard.result, RATE_LIMITS.emailSend.limit);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withLimits(json({ error: "invalid_json" }, 400));
  }

  const parsed = emailSendSchema.safeParse(body);
  if (!parsed.success) return withLimits(json({ error: "invalid_input" }, 400));

  /* Validate (and decode) attachments before touching the database. */
  const attachments: OutgoingAttachment[] = [];
  let totalBytes = 0;

  for (const attachment of parsed.data.attachments) {
    const data = attachment.data.replace(/\s/g, "");
    if (data === "" || data.length % 4 !== 0 || !BASE64_PATTERN.test(data)) {
      return withLimits(json({ error: "invalid_attachment" }, 400));
    }

    const bytes = Buffer.from(data, "base64");
    if (bytes.length === 0) return withLimits(json({ error: "invalid_attachment" }, 400));
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      return withLimits(json({ error: "attachment_too_large", max: MAX_ATTACHMENT_BYTES }, 400));
    }

    totalBytes += bytes.length;
    if (totalBytes > MAX_ATTACHMENTS_TOTAL_BYTES) {
      return withLimits(
        json({ error: "attachments_too_large", max: MAX_ATTACHMENTS_TOTAL_BYTES }, 400),
      );
    }

    const name = sanitizeFilename(attachment.name);
    if (name === "") return withLimits(json({ error: "invalid_attachment" }, 400));
    attachments.push({ name, data });
  }

  try {
    const election = await findElectionById(parsed.data.electionId);
    if (election === null) return withLimits(json({ error: "election_not_found" }, 404));

    const ids = [...new Set(parsed.data.personIds)];
    const config = getMailConfig();
    const baseUrl = appBaseUrl(request);

    let recipients: Array<EmailRecipient & { personId: number | null; email: string }>;
    let tokens = new Map<number, string>();

    if (parsed.data.test) {
      recipients = [
        { personId: null, email: user.email, name: user.name, gender: null },
      ];
    } else {
      const people = await findRosterPeople(parsed.data.electionId, ids);
      /* A mismatch means an id outside this election: reject the whole chunk. */
      if (people.length !== ids.length) {
        return withLimits(json({ error: "invalid_recipients" }, 400));
      }
      tokens = await ensureBallotTokens(parsed.data.electionId, ids);
      recipients = people;
    }

    const results: MailRecipientResult[] = [];

    for (let index = 0; index < recipients.length; index += CONCURRENCY) {
      const slice = recipients.slice(index, index + CONCURRENCY);

      const settled = await Promise.all(
        slice.map(async (recipient) => {
          const token =
            recipient.personId === null ? null : (tokens.get(recipient.personId) ?? null);
          const voteUrl = token === null ? null : `${baseUrl}/vote/${token}`;

          const content = buildEmail({
            language: parsed.data.language,
            electionTitle: election.title,
            recipient,
            voteUrl,
            subject: parsed.data.subject,
            message: parsed.data.message,
            test: parsed.data.test,
          });

          try {
            await sendMail({ to: recipient.email, ...content, attachments });
            return {
              personId: recipient.personId,
              email: recipient.email,
              status: "sent" as const,
              code: null,
            };
          } catch (error) {
            const code = error instanceof MailSendError ? error.code : "provider_error";
            console.error(`Could not send email to ${recipient.email}: ${code}`);
            return {
              personId: recipient.personId,
              email: recipient.email,
              status: "failed" as const,
              code,
            };
          }
        }),
      );

      results.push(...settled);
    }

    const sent = results.filter((result) => result.status === "sent").length;

    /* Only counts: no addresses, tokens or attachment contents in the log. */
    await recordAudit({
      actorType: "admin",
      actorId: user.id,
      action: "email.send",
      targetType: "election",
      targetId: parsed.data.electionId,
      metadata: {
        sent,
        failed: results.length - sent,
        attachments: attachments.length,
        test: parsed.data.test,
        dryRun: config.dryRun,
      },
    });

    return withLimits(
      json(
        {
          sent,
          failed: results.length - sent,
          dryRun: config.dryRun,
          results,
        },
        200,
      ),
    );
  } catch (error) {
    console.error("Could not send the emails", error);
    return withLimits(json({ error: "database_error" }, 500));
  }
}
