/*
  GET /api/auth/google?from=/admin
  Starts the Google OAuth flow by redirecting the browser to Google's consent
  screen. A signed, short-lived state cookie ties the callback to this browser
  and carries the safe in-app path to return to after sign-in.
*/

import { recordAudit } from "../../../lib/audit";
import {
  buildGoogleAuthUrl,
  clearStateCookie,
  createStateCookie,
  getGoogleConfig,
  googleCallbackUrl,
  safeReturnPath,
} from "../../../lib/google-auth";
import { RATE_LIMITS, rateLimitGuard } from "../../../lib/rate-limit";
import { clientIp } from "../../../lib/request";

function redirect(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 302, headers: { location, ...headers } });
}

export async function GET(request: Request): Promise<Response> {
  const guard = await rateLimitGuard(
    "google:start",
    clientIp(request),
    RATE_LIMITS.loginIp.limit,
    RATE_LIMITS.loginIp.windowMs,
  );
  if (guard.denied !== null) return guard.denied;

  const config = getGoogleConfig();
  if (config === null) {
    return redirect("/login?error=google_not_configured");
  }

  const url = new URL(request.url);
  const from = safeReturnPath(url.searchParams.get("from"));
  const stateCookie = createStateCookie(from);
  /* The cookie value (body.signature) is also the state parameter. */
  const state = stateCookie.split(";")[0]?.split("=").slice(1).join("=") ?? "";
  if (state === "") {
    await recordAudit({
      actorType: "system",
      action: "auth.login_failed",
      metadata: { method: "google", reason: "state_error" },
    });
    return redirect("/login?error=google_failed", { "set-cookie": clearStateCookie() });
  }

  const authUrl = buildGoogleAuthUrl(config, googleCallbackUrl(request), state);
  return redirect(authUrl, { "set-cookie": stateCookie });
}
