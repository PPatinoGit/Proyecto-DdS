/*
 GET  /api/elections/motions?electionId=1  ballot of one election
 POST /api/elections/motions               replace it (admin only)

 The ballot is frozen as soon as the first vote is cast, so the GET also tells
 the editor whether it is still editable.
*/

import { z } from "zod";
import { findElectionById } from "../../src/lib/elections";
import { hasVotes, listMotions, replaceMotions } from "../../src/lib/motions";
import { recordAudit } from "../../src/lib/audit";
import { readSessionUser } from "../../src/lib/session";
import { VotingError } from "../../src/lib/voting";
import { motionsInputSchema } from "../../src/lib/validation";

const idSchema = z.coerce.number().int().positive();

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  if (readSessionUser(request) === null) return json({ error: "unauthenticated" }, 401);

  const electionId = idSchema.safeParse(new URL(request.url).searchParams.get("electionId"));
  if (!electionId.success) return json({ error: "invalid_input" }, 400);

  try {
    const election = await findElectionById(electionId.data);
    if (election === null) return json({ error: "election_not_found" }, 404);

    const [motions, locked] = await Promise.all([
      listMotions(electionId.data),
      hasVotes(electionId.data),
    ]);
    return json({ election, motions, locked }, 200);
  } catch (error) {
    console.error("Could not list motions", error);
    return json({ error: "database_error" }, 500);
  }
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

  const parsed = motionsInputSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_input" }, 400);

  try {
    const motions = await replaceMotions(parsed.data.electionId, parsed.data.motions);
    await recordAudit({
      actorType: "admin",
      actorId: user.id,
      action: "election.motions",
      targetType: "election",
      targetId: parsed.data.electionId,
      metadata: { motions: motions.length },
    });
    return json({ motions }, 200);
  } catch (error) {
    if (error instanceof VotingError) {
      const status = error.code === "election_not_found" ? 404 : 409;
      return json({ error: error.code }, status);
    }
    console.error("Could not save motions", error);
    return json({ error: "database_error" }, 500);
  }
}
