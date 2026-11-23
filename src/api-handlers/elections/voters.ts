/*
 GET  /api/elections/voters?electionId=1  roster of one election
 POST /api/elections/voters               import a validated voter CSV

 A CSV is sent as JSON ({ electionId, csv }) instead of multipart so the same
 parser runs on both sides and the body limit is easy to reason about.
*/

import { z } from "zod";
import { findElectionById } from "../../lib/elections.js";
import { importVoters, listVoters } from "../../lib/voters.js";
import { recordAudit } from "../../lib/audit.js";
import { readSessionUser } from "../../lib/session.js";
import { parseVoterCsv } from "../../lib/csv.js";

const idSchema = z.coerce.number().int().positive();

const importSchema = z.object({
  electionId: z.number().int().positive(),
  csv: z.string().min(1),
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const user = readSessionUser(request);
  if (user === null) return json({ error: "unauthenticated" }, 401);

  const electionId = idSchema.safeParse(new URL(request.url).searchParams.get("electionId"));
  if (!electionId.success) return json({ error: "invalid_input" }, 400);

  try {
    const election = await findElectionById(electionId.data);
    if (election === null) return json({ error: "election_not_found" }, 404);

    const voters = await listVoters(electionId.data);
    return json({ election, voters }, 200);
  } catch (error) {
    console.error("Could not list voters", error);
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

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_input" }, 400);

  try {
    const election = await findElectionById(parsed.data.electionId);
    if (election === null) return json({ error: "election_not_found" }, 404);

    const result = parseVoterCsv(parsed.data.csv);
    if (result.fatal !== null) return json({ error: "invalid_csv", fatal: result.fatal }, 400);
    if (result.issues.length > 0) {
      return json(
        {
          error: "invalid_csv",
          issues: result.issues.slice(0, 50),
          totalIssues: result.issues.length,
        },
        400,
      );
    }

    const summary = await importVoters(parsed.data.electionId, result.rows);
    await recordAudit({
      actorType: "admin",
      actorId: user.id,
      action: "election.voters_import",
      targetType: "election",
      targetId: parsed.data.electionId,
      metadata: { imported: summary.imported, total: summary.total },
    });
    return json({ summary }, 200);
  } catch (error) {
    console.error("Could not import voters", error);
    return json({ error: "database_error" }, 500);
  }
}
