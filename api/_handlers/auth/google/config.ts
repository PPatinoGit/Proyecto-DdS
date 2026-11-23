/*
  GET /api/auth/google/config
  Tells the login page whether Google SSO is configured. No secrets are exposed.
*/

import { getGoogleConfig } from "../../../../src/lib/google-auth";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function GET(): Response {
  return json({ configured: getGoogleConfig() !== null }, 200);
}
