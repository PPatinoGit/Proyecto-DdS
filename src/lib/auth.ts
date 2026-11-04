// Hash of passwords and cookie signing
import process from "node:process";
import { createHmac, randomBytes, srcyptSync, timingSafeEqual } from "node:crypto"; // signs cookies, generates salts, derives password hashes, and compares hashes in a timing-safe way.
import { parse, serialize } from "cookie"; // cookies reading and Set-Cookie header generation
import { scryptSync } from "node:crypto";
import { Buffer } from "node:buffer";

// Hash and sign the session payload 

const SESSION_COOKIE = "vote_session";
const SESSION_TTL_SECONDS = 60 * 60 * 2 // 2 hours

// Session payload type (Signed, not encrypted) 
export type SessionPayload = {
  userId: string;
  exp: number; // Expiration timestamp in milliseconds
};

// Get the secret key for signing cookies from environment variables 
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  return secret;
}

/* ---------- Passwords ---------- */

// Hash a password using scrypt with a random salt and return the result in the format: "scrypt$salt$hash"
// The salt is different for each password, so the same password will produce different hashes each time. This makes it more secure against rainbow table attacks.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

// Verify a password against a stored hash, and in any other format, return false. This function is timing-safe to prevent timing attacks.
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ---------- Session management ---------- */

// Sign a value using HMAC with SHA-256 and the secret key, returning the signature in base64url format
function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

// Create a header "Set-Cookie" to start a session.
// token = base64 payload + "." + Hmac signature.
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

// returns the expired cookie, or null if the session is invalid or expired. This function does not throw errors, it just returns null for any invalid session.
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

/* We use Scrypt for password hashing because it is a memory-hard function, which makes it more resistant to brute-force attacks using specialized hardware.
 The random salt ensures that the same password will produce different hashes each time, preventing attackers from using precomputed hash tables (rainbow tables) to crack passwords.
 The timing-safe comparison prevents attackers from inferring information about the password based on the time it takes to compare hashes.
 
 The salt is not a secret, but it adds an extra layer of security by ensuring that even if two users have the same password, their hashes will be different. 
 
 Cookies are not encrypted, so they should NOT CONTAIN SENSITIVE INFORMATION, but the Hmac signature provides integrity and authenticity, which can only be generated with the SESSION_SECRET
 
 With timingSafeEqual we ensure that the comparison is not vulnerable to timing attacks
 
 With sameSite: "lax" we ensure that the cookie is only sent in a first-party context 
 
 All the state is on the signed cookie, we dont consult anything to know who you are but we cannot revocate a session before it expires */