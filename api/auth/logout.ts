
/* POST /api/auth/logout
 Clears the session cookie. 
 No database lookup is needed: the session is stateless, so deleting the cookie on the client is enough. */

import { clearSessionCookie } from "../../src/lib/auth";

/*
 Exported as POST: Vercel routes by the export name, so a GET (which an
 <img src> on another site could trigger) never reaches the handler.
*/
export function POST(): Response {
  /* 204 No Content: the operation succeeded and there is nothing to return. */
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": clearSessionCookie() },
  });
}
