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
import { findElectionById } from "../../src/lib/elections";
import { findRosterPeople } from "../../src/lib/voters";
import { ensureBallotTokens } from "../../src/lib/tokens";
import { buildEmail, type EmailRecipient } from "../../src/lib/email-template";
import {
  MailSendError,
  getMailConfig,
  sendMail,
  type OutgoingAttachment,
} from "../../src/lib/emails";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_TOTAL_BYTES,
} from "../../src/lib/email-limits";
import { readSessionUser } from "../../src/lib/session";
import { emailSendSchema } from "../../src/lib/validation";
import type { MailRecipientResult } from "../../src/lib/types";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = emailSendSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_input" }, 400);

  /* Validate (and decode) attachments before touching the database. */
  const attachments: OutgoingAttachment[] = [];
  let totalBytes = 0;

  for (const attachment of parsed.data.attachments) {
    const data = attachment.data.replace(/\s/g, "");
    if (data === "" || data.length % 4 !== 0 || !BASE64_PATTERN.test(data)) {
      return json({ error: "invalid_attachment" }, 400);
    }

    const bytes = Buffer.from(data, "base64");
    if (bytes.length === 0) return json({ error: "invalid_attachment" }, 400);
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      return json({ error: "attachment_too_large", max: MAX_ATTACHMENT_BYTES }, 400);
    }

    totalBytes += bytes.length;
    if (totalBytes > MAX_ATTACHMENTS_TOTAL_BYTES) {
      return json({ error: "attachments_too_large", max: MAX_ATTACHMENTS_TOTAL_BYTES }, 400);
    }

    const name = sanitizeFilename(attachment.name);
    if (name === "") return json({ error: "invalid_attachment" }, 400);
    attachments.push({ name, data });
  }

  try {
    const election = await findElectionById(parsed.data.electionId);
    if (election === null) return json({ error: "election_not_found" }, 404);

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
        return json({ error: "invalid_recipients" }, 400);
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

    return json(
      {
        sent,
        failed: results.length - sent,
        dryRun: config.dryRun,
        results,
      },
      200,
    );
  } catch (error) {
    console.error("Could not send the emails", error);
    return json({ error: "database_error" }, 500);
  }
}
