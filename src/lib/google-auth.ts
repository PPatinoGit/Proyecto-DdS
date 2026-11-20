/*
  Google OAuth 2.0 (Authorization Code) helpers.

  The server owns the client secret and the code exchange; the browser only
  follows redirects. Admins still come from data/users.json: a Google account is
  accepted only when its verified email matches an existing administrator.
*/

import process from "node:process";
import { Buffer } from "node:buffer";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { parseCookie, stringifySetCookie } from "cookie";

export const GOOGLE_STATE_COOKIE = "google_oauth_state";
const STATE_TTL_SECONDS = 10 * 60;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
};

export type GoogleIdentity = {
  email: string;
  emailVerified: boolean;
  name: string | null;
};

type StatePayload = {
  csrf: string;
  from: string;
  exp: number;
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET environment variable is not set");
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

/** Reads Google credentials when both are configured; null means "disabled". */
export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Public origin of this app, used to build the callback URL Google redirects to. */
export function appBaseUrl(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

export function googleCallbackUrl(request: Request): string {
  return `${appBaseUrl(request)}/api/auth/google/callback`;
}

/** Internal app paths only, so the state cannot redirect outside this site. */
export function safeReturnPath(value: unknown): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/admin";
}

/** Signed, short-lived state cookie that ties the callback to this browser. */
export function createStateCookie(from: string): string {
  const payload: StatePayload = {
    csrf: randomBytes(16).toString("base64url"),
    from: safeReturnPath(from),
    exp: Date.now() + STATE_TTL_SECONDS * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return stringifySetCookie({
    name: GOOGLE_STATE_COOKIE,
    value: `${body}.${sign(body)}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: STATE_TTL_SECONDS,
  });
}

export function clearStateCookie(): string {
  return stringifySetCookie({
    name: GOOGLE_STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 0,
  });
}

/** Verifies the state value against the cookie and returns the intended path. */
export function readState(request: Request, stateParam: string): { from: string } | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const token = parseCookie(header)[GOOGLE_STATE_COOKIE];
  if (!token || token !== stateParam) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as StatePayload;
    if (payload.exp < Date.now() || typeof payload.from !== "string") return null;
    return { from: safeReturnPath(payload.from) };
  } catch {
    return null;
  }
}

export function buildGoogleAuthUrl(
  config: GoogleConfig,
  redirectUri: string,
  state: string,
): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  /* Lets the user pick an account instead of silently reusing one. */
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

type TokenResponse = {
  access_token?: string;
  error?: string;
};

export async function exchangeCodeForAccessToken(
  config: GoogleConfig,
  code: string,
  redirectUri: string,
): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || typeof data.access_token !== "string" || data.access_token === "") {
    throw new Error(data.error ?? "token_exchange_failed");
  }
  return data.access_token;
}

type UserInfoResponse = {
  email?: string;
  email_verified?: boolean | string;
  name?: string;
};

export async function fetchGoogleIdentity(accessToken: string): Promise<GoogleIdentity> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("userinfo_failed");

  const data = (await response.json()) as UserInfoResponse;
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const verified = data.email_verified === true || data.email_verified === "true";
  if (email === "") throw new Error("missing_email");

  return {
    email,
    emailVerified: verified,
    name: typeof data.name === "string" && data.name.trim() !== "" ? data.name : null,
  };
}
