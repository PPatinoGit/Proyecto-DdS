/* POST /api/auth/login
  receives { email, password }, verifies credentials on data/users.json
  and responds with a signed session cookie.

  Two fixed-window counters protect this endpoint: one per client IP (stops a
  single host spraying passwords) and one per email (stops a distributed attack
  against one account). Failed logins are audited without storing the email or
  the password.
*/

import { z } from "zod";
import { findUserByEmail, toPublicUser } from "../../../src/lib/users";
import { createSessionCookie, verifyPassword } from "../../../src/lib/auth";
import { recordAudit } from "../../../src/lib/audit";
import { RATE_LIMITS, rateLimitGuard, withRateLimitHeaders } from "../../../src/lib/rate-limit";
import { clientIp } from "../../../src/lib/request";

/* Anything that does not match this schema is rejected before touching the user list. */
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

export async function POST(request: Request): Promise<Response> {
  /* Count before parsing: malformed floods must be limited too. */
  const ipGuard = await rateLimitGuard(
    "login:ip",
    clientIp(request),
    RATE_LIMITS.loginIp.limit,
    RATE_LIMITS.loginIp.windowMs,
  );
  if (ipGuard.denied !== null) return ipGuard.denied;

  /* body must be valid JSON */
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withRateLimitHeaders(
      json({ error: "invalid_json" }, 400),
      ipGuard.result,
      RATE_LIMITS.loginIp.limit,
    );
  }

  /* Type validation, after this line `body` has a known type */
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return withRateLimitHeaders(
      json({ error: "invalid_input" }, 400),
      ipGuard.result,
      RATE_LIMITS.loginIp.limit,
    );
  }

  const emailGuard = await rateLimitGuard(
    "login:email",
    parsed.data.email.trim().toLowerCase(),
    RATE_LIMITS.loginEmail.limit,
    RATE_LIMITS.loginEmail.windowMs,
  );
  if (emailGuard.denied !== null) return emailGuard.denied;

  /* Both counters are attached to every credential response, including errors. */
  function withLimits(response: Response): Response {
    const withIp = withRateLimitHeaders(response, ipGuard.result, RATE_LIMITS.loginIp.limit);
    return withRateLimitHeaders(withIp, emailGuard.result, RATE_LIMITS.loginEmail.limit);
  }

  /* Find the user by email */
  const user = findUserByEmail(parsed.data.email);

  /* Verify the password and email, hiding the distinction between both errors */
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    await recordAudit({
      actorType: "system",
      action: "auth.login_failed",
      targetType: "admin_session",
      metadata: { reason: "invalid_credentials" },
    });
    return withLimits(json({ error: "invalid_credentials" }, 401));
  }

  /* Correct credentials: audit and emit the session cookie */
  await recordAudit({
    actorType: "admin",
    actorId: user.id,
    action: "auth.login",
    targetType: "admin_session",
  });
  return withLimits(
    json({ user: toPublicUser(user) }, 200, {
      "set-cookie": createSessionCookie(user.id),
    }),
  );
}
