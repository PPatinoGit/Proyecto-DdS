
/* POST /api/auth/logout
 Clears the session cookie. 
 No database lookup is needed: the session is stateless, so deleting the cookie on the client is enough. */

import { clearSessionCookie } from "../../src/lib/auth";

export default function handler(request: Request): Response {
  /* POST only: a GET could be triggered by an <img src> tag on another site and would log the user out without consent. */
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json", allow: "POST" },
    });
  }

  /* 204 No Content: the operation succeeded and there is nothing to return. */
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": clearSessionCookie() },
  });
}