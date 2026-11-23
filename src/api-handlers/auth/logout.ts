/* POST /api/auth/logout
   Clears the session cookie. No database lookup is needed to close the session:
   it is stateless, so deleting the cookie on the client is enough. The user id
   is read only to write a redacted audit row before the cookie is cleared.
*/

import { clearSessionCookie } from "../../lib/auth.js";
import { recordAudit } from "../../lib/audit.js";
import { readSessionUser } from "../../lib/session.js";

/*
  Exported as POST: Vercel routes by the export name, so a GET (which an
  <img src> on another site could trigger) never reaches the handler.
*/
export async function POST(request: Request): Promise<Response> {
  const user = readSessionUser(request);

  await recordAudit({
    actorType: user === null ? "system" : "admin",
    actorId: user?.id ?? null,
    action: "auth.logout",
    targetType: "admin_session",
  });

  /* 204 No Content: the operation succeeded and there is nothing to return. */
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": clearSessionCookie() },
  });
}
