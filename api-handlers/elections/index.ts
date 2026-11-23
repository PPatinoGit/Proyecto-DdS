/* GET  /api/elections  list every election (newest first)
   POST /api/elections  create a draft election

   Both require a valid admin session: elections are not public data. */

import { createElection, listElections } from "../../src/lib/elections";
import { recordAudit } from "../../src/lib/audit";
import { readSessionUser } from "../../src/lib/session";
import { electionInputSchema } from "../../src/lib/validation";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  /* Today the only role is "admin", so a valid session is enough. */
  const user = readSessionUser(request);
  if (user === null) return json({ error: "unauthenticated" }, 401);

  try {
    const elections = await listElections();
    return json({ elections }, 200);
  } catch (error) {
    console.error("Could not list elections", error);
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

  const parsed = electionInputSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_input" }, 400);

  try {
    const election = await createElection(parsed.data);
    await recordAudit({
      actorType: "admin",
      actorId: user.id,
      action: "election.create",
      targetType: "election",
      targetId: election.id,
    });
    return json({ election }, 201);
  } catch (error) {
    console.error("Could not create election", error);
    return json({ error: "database_error" }, 500);
  }
}
