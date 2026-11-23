/*
 GET /api/elections/results?electionId=1  weighted tallies (admin only)

 Results are aggregate numbers: no endpoint exposes who voted for what. The
 ballot token is only linked to a person on the server.
*/

import { z } from "zod";
import { readSessionUser } from "../../src/lib/session";
import { getResults } from "../../src/lib/votes";

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
    const results = await getResults(electionId.data);
    if (results === null) return json({ error: "election_not_found" }, 404);
    return json(results, 200);
  } catch (error) {
    console.error("Could not calculate results", error);
    return json({ error: "database_error" }, 500);
  }
}
