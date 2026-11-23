/*
 GET /api/emails/config

 Tells the admin page whether real emails can be sent. Only the boolean, the
 sender address and the dry-run flag leave the server: never the API key.
*/

import { getMailConfig } from "../../src/lib/emails";
import { readSessionUser } from "../../src/lib/session";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function GET(request: Request): Response {
  const user = readSessionUser(request);
  if (user === null) return json({ error: "unauthenticated" }, 401);

  return json(getMailConfig(), 200);
}
