/*
 GET  /api/vote/<token>  read the ballot identified by the link
 POST /api/vote/<token>  cast that ballot, exactly once

 There is no admin session here: the secret token is the credential. All
 texts in the responses are machine-readable codes so the page can translate
 them without calling a translation API.
*/

import { z } from "zod";
import { castVote, getBallot } from "../../src/lib/votes";
import { VotingError } from "../../src/lib/voting";
import { voteInputSchema } from "../../src/lib/validation";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = voteInputSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_input" }, 400);

  try {
    const receipt = await castVote(token.data, parsed.data.votes);
    return json({ receipt }, 201);
  } catch (error) {
    if (error instanceof VotingError) return votingErrorResponse(error.code);
    console.error("Could not cast the vote", error);
    return json({ error: "database_error" }, 500);
  }
}
