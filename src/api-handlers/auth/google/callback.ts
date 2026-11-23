/*
  GET /api/auth/google/callback
  Handles Google's redirect: validates state, exchanges the code, checks that
  the verified email belongs to an existing administrator, creates the session
  cookie and redirects back into the app.
*/

import { createSessionCookie } from "../../../lib/auth.js";
import { recordAudit } from "../../../lib/audit.js";
import {
  clearStateCookie,
  exchangeCodeForAccessToken,
  fetchGoogleIdentity,
  getGoogleConfig,
  googleCallbackUrl,
  readState,
} from "../../../lib/google-auth.js";
import { RATE_LIMITS, rateLimitGuard } from "../../../lib/rate-limit.js";
import { clientIp } from "../../../lib/request.js";
import { findUserByEmail } from "../../../lib/users.js";

function redirect(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 302, headers: { location, ...headers } });
}

function fail(error: string): Response {
  return redirect(`/login?error=${encodeURIComponent(error)}`, {
    "set-cookie": clearStateCookie(),
  });
}

export async function GET(request: Request): Promise<Response> {
  const guard = await rateLimitGuard(
    "google:callback",
    clientIp(request),
    RATE_LIMITS.loginIp.limit,
    RATE_LIMITS.loginIp.windowMs,
  );
  if (guard.denied !== null) return guard.denied;

  const config = getGoogleConfig();
  if (config === null) return fail("google_not_configured");

  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  if (oauthError === "access_denied") return fail("google_cancelled");
  if (oauthError) return fail("google_failed");

  const stateParam = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!stateParam || !code) return fail("google_failed");

  const state = readState(request, stateParam);
  if (state === null) return fail("google_state");

  try {
    const accessToken = await exchangeCodeForAccessToken(
      config,
      code,
      googleCallbackUrl(request),
    );
    const identity = await fetchGoogleIdentity(accessToken);

    if (!identity.emailVerified) {
      await recordAudit({
        actorType: "system",
        action: "auth.login_failed",
        metadata: { method: "google", reason: "email_unverified" },
      });
      return fail("google_unauthorized");
    }

    const user = findUserByEmail(identity.email);
    if (user === null) {
      await recordAudit({
        actorType: "system",
        action: "auth.login_failed",
        metadata: { method: "google", reason: "unauthorized_email" },
      });
      return fail("google_unauthorized");
    }

    await recordAudit({
      actorType: "admin",
      actorId: user.id,
      action: "auth.login",
      targetType: "admin_session",
      metadata: { method: "google" },
    });

    const headers = new Headers({ location: state.from });
    /* First cookie sets the session, second clears the one-time state. */
    headers.append("set-cookie", createSessionCookie(user.id));
    headers.append("set-cookie", clearStateCookie());
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("Google sign-in failed", error);
    await recordAudit({
      actorType: "system",
      action: "auth.login_failed",
      metadata: { method: "google", reason: "exchange_failed" },
    });
    return fail("google_failed");
  }
}
