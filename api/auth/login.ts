/* POST /api/auth/login
 recieves { email: string, password: string }, verifies credentials on data/users.json
 and responds with signed session cookie */

import { z } from "zod";
import { findUserByEmail, toPublicUser } from "../../src/lib/users";
import { createSessionCookie, verifyPassword } from "../../src/lib/auth";

/* Anything that does not match this schema will be rejected before touching the user list. */
const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

/* Helper function to create a JSON response with the correct content type. */
function json(data: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export default async function handler(request: Request): Promise<Response> {
  /* POST only, anything else gets 405 */
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
  }

  /* body must be valid JSON */
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  /* Type validation, after this line `body` has a known type */
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid_input" }, 400);
  }

  /* Find the user by email */
  const user = findUserByEmail(parsed.data.email);

  /* Verify the password and email, hiding the distinction between both errors */
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return json({ error: "invalid_credentials" }, 401);
  }

  /* Correct credentials: emit the session cookie */
  return json({ user: toPublicUser(user) }, 200, {
    "set-cookie": createSessionCookie(user.id),
  });
}