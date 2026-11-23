/* GET /api/auth/me

 Returns the currently authenticated user, or 401 when there is no valid session.
 The frontend calls this once on load to restore the session. */


import { readSession } from "../../../src/lib/auth";
import { findUserById, toPublicUser } from "../../../src/lib/users";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    /* Session data must never be cached by a CDN or the browser. */
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/* Exported as GET: Vercel routes by the export name, so only GET reaches it. */
export function GET(request: Request): Response {
  /* Validates the HMAC signature and the expiration date. */
  const session = readSession(request);
  if (!session) return json({ user: null }, 401);

  /* The session may outlive the user: for example, an admin removed from data/users.json and redeployed keeps a valid cookie until it expires. */
  const user = findUserById(session.userId);
  if (!user) return json({ user: null }, 401);

  return json({ user: toPublicUser(user) }, 200);
}
