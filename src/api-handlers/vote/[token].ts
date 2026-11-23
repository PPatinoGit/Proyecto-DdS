/*
  GET  /api/vote/<token>  read the ballot identified by the link
  POST /api/vote/<token>  cast that ballot, exactly once

  There is no admin session here: the secret token is the credential. All
  texts in the responses are machine-readable codes so the page can translate
  them without calling a translation API. The token is used as the rate-limit
  key but is never written to the audit log.
*/

import { z } from "zod";
import { castVote, getBallot } from "../../lib/votes.js";
import { resolveBallotToken } from "../../lib/tokens.js";
import { recordAudit } from "../../lib/audit.js";
import { RATE_LIMITS, rateLimitGuard, withRateLimitHeaders } from "../../lib/rate-limit.js";
import { VotingError } from "../../lib/voting.js";
import { voteInputSchema } from "../../lib/validation.js";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/);

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** The last path segment of /api/vote/<token>. */
function tokenFrom(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const raw = parts.at(-1);
  if (raw === undefined) return null;

  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function votingErrorResponse(code: string): Response {
  if (code === "invalid_token") return json({ error: code }, 404);
  if (code === "already_voted") return json({ error: code }, 409);
  if (code === "draft" || code === "upcoming" || code === "closed") {
    return json({ error: code }, 403);
  }
  return json({ error: code }, 400);
}

export async function GET(request: Request): Promise<Response> {
  const token = tokenSchema.safeParse(tokenFrom(request));
  if (!token.success) return json({ error: "invalid_token" }, 404);

  try {
    return json({ ballot: await getBallot(token.data) }, 200);
  } catch (error) {
    if (error instanceof VotingError) return votingErrorResponse(error.code);
    console.error("Could not read the ballot", error);
    return json({ error: "database_error" }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const token = tokenSchema.safeParse(tokenFrom(request));
  if (!token.success) return json({ error: "invalid_token" }, 404);

  const guard = await rateLimitGuard(
    "vote:token",
    token.data,
    RATE_LIMITS.vote.limit,
    RATE_LIMITS.vote.windowMs,
  );
  if (guard.denied !== null) return guard.denied;

  function withLimits(response: Response): Response {
    return withRateLimitHeaders(response, guard.result, RATE_LIMITS.vote.limit);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withLimits(json({ error: "invalid_json" }, 400));
  }

  const parsed = voteInputSchema.safeParse(body);
  if (!parsed.success) return withLimits(json({ error: "invalid_input" }, 400));

  try {
    /* Resolve the holder only to identify the voter in the audit row. */
    const holder = await resolveBallotToken(token.data);
    const receipt = await castVote(token.data, parsed.data.votes);

    await recordAudit({
      actorType: "recipient",
      actorId: holder?.personId ?? null,
      action: "vote.cast",
      targetType: "election",
      targetId: holder?.electionId ?? null,
      metadata: { answers: parsed.data.votes.length },
    });

    return withLimits(json({ receipt }, 201));
  } catch (error) {
    if (error instanceof VotingError) return withLimits(votingErrorResponse(error.code));
    console.error("Could not cast the vote", error);
    return withLimits(json({ error: "database_error" }, 500));
  }
}
