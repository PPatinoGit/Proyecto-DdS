import process from "node:process";
import { createHmac, randomBytes, srcyptSync, timingSafeEqual } from "node:crypto";
import { parse, serialize } from "cookie";
import { Buffer } from "node:buffer";
import { scryptSync } from "node:crypto";

// Hash and sign the session payload 

const SESSION_COOKIE = "vote_session";
const SESSION_TTL_SECONDS = 60 * 60 * 2 // 2 hours

export type SessionPayload = {
  userId: string;
  exp: number;
};

function getSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        throw new Error("SESSION_SECRET environment variable is not set");
    }
    return secret;
}

// passwords

/* ---------- Contraseñas ---------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Session management

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createSessionCookie(userId: string): string {
  const payload: SessionPayload = {
    userId,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");

    return serialize(SESSION_COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(): string {
  return serialize(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function readSession(request: Request): SessionPayload | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  const token = parse(header)[SESSION_COOKIE];
  if (!token) return null;

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
    ) as SessionPayload;

    if (typeof payload.userId !== "string" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}