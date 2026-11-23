/*
 POST /api/elections/status  publish or close an election (admin only)

 Votes are only accepted while status is "open" and the optional dates allow
 it. Moving back to draft is not offered: that would hide ballots already cast.
*/

import { updateElectionStatus } from "../../lib/elections";
import { recordAudit } from "../../lib/audit";
import { readSessionUser } from "../../lib/session";
import { electionStatusSchema } from "../../lib/validation";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
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

  const parsed = electionStatusSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_input" }, 400);

  try {
    const election = await updateElectionStatus(parsed.data.electionId, parsed.data.status);
    if (election === null) return json({ error: "election_not_found" }, 404);
    await recordAudit({
      actorType: "admin",
      actorId: user.id,
      action: "election.status",
      targetType: "election",
      targetId: election.id,
      metadata: { status: parsed.data.status },
    });
    return json({ election }, 200);
  } catch (error) {
    console.error("Could not change the election status", error);
    return json({ error: "database_error" }, 500);
  }
}
