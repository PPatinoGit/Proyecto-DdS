/*
  GET /api/audit?limit=50  most recent audit events (admin only)

  The trail is redacted by construction: it contains ids and counts, never
  passwords, tokens or attachment contents.
*/

import { z } from "zod";
import { listAuditEvents } from "../../lib/audit";
import { readSessionUser } from "../../lib/session";

const limitSchema = z.coerce.number().int().min(1).max(200).default(50);

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  if (readSessionUser(request) === null) return json({ error: "unauthenticated" }, 401);

  const raw = new URL(request.url).searchParams.get("limit");
  const limit = limitSchema.safeParse(raw ?? undefined);
  if (!limit.success) return json({ error: "invalid_input" }, 400);

  try {
    const events = await listAuditEvents(limit.data);
    return json({ events }, 200);
  } catch (error) {
    console.error("Could not read the audit log", error);
    return json({ error: "database_error" }, 500);
  }
}
