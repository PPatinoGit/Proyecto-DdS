/*
  Rate limiting with a fixed window counter in SQLite.

  An in-memory Map would give every Vercel function its own counter, so a
  caller could bypass the limit by hitting a different instance. The table
  key is (bucket, identifier): e.g. ("login:ip", "203.0.113.4") or
  ("vote:token", "<token>"). The counter is incremented atomically with one
  UPSERT, so concurrent requests cannot both read the same count.

  Denied requests also count: after the limit is reached, every request in the
  same window is rejected until the window resets. That is intentional for a
  fixed-window limiter and keeps the implementation predictable.
*/

import { db } from "./db";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window resets; 0 when the request is allowed. */
  retryAfter: number;
};

/*
  One place for every limit keeps the policy readable and lets the tests import
  the same values instead of duplicating magic numbers.
*/
export const RATE_LIMITS = {
  loginIp: { limit: 20, windowMs: 15 * 60 * 1000 },
  loginEmail: { limit: 8, windowMs: 15 * 60 * 1000 },
  emailSend: { limit: 10, windowMs: 60 * 1000 },
  vote: { limit: 12, windowMs: 60 * 1000 },
  questionnaire: { limit: 20, windowMs: 60 * 1000 },
} as const;

/** Result of a guard: a ready 429 response when denied, otherwise null. */
export type RateLimitGuard = {
  result: RateLimitResult;
  denied: Response | null;
};

/** Removes counters older than a day, occasionally, to keep the table small. */
function maybePrune(now: number): void {
  if (Math.random() >= 0.01) return;
  /* Fire and forget: pruning must never delay or fail a request. */
  void db.execute({
    sql: `DELETE FROM rate_limit WHERE window_start < ?`,
    args: [now - 24 * 60 * 60 * 1000],
  }).catch((error: unknown) => console.error("Could not prune rate limits", error));
}

/**
 * Counts one attempt and reports whether it is inside the limit.
 * `windowMs` is the fixed window length; `limit` is attempts per window.
 */
export async function checkRateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  maybePrune(now);

  await db.execute({
    sql: `INSERT INTO rate_limit (bucket, identifier, window_start, count)
          VALUES (?, ?, ?, 1)
          ON CONFLICT(bucket, identifier) DO UPDATE SET
            window_start = CASE WHEN rate_limit.window_start < ? THEN ? ELSE rate_limit.window_start END,
            count = CASE WHEN rate_limit.window_start < ? THEN 1 ELSE rate_limit.count + 1 END`,
    args: [bucket, identifier.slice(0, 64), windowStart, windowStart, windowStart, windowStart],
  });

  const result = await db.execute({
    sql: `SELECT window_start, count FROM rate_limit WHERE bucket = ? AND identifier = ?`,
    args: [bucket, identifier.slice(0, 64)],
  });
  const row = result.rows[0];
  const count = row === undefined ? 1 : Number(row.count);
  const start = row === undefined ? windowStart : Number(row.window_start);
  const allowed = count <= limit;

  return {
    allowed,
    remaining: Math.max(0, limit - count),
    retryAfter: allowed ? 0 : Math.max(1, Math.ceil((start + windowMs - now) / 1000)),
  };
}

/** Adds `Retry-After` and `X-RateLimit-*` headers to a JSON response. */
export function withRateLimitHeaders(
  response: Response,
  result: RateLimitResult,
  limit: number,
): Response {
  const headers = new Headers(response.headers);
  headers.set("x-ratelimit-limit", String(limit));
  headers.set("x-ratelimit-remaining", String(result.remaining));
  if (!result.allowed) headers.set("retry-after", String(result.retryAfter));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Counts one attempt and prepares the standard 429 response when it is over.
 * Handlers return `guard.denied` early; successful responses pass
 * `guard.result` to `withRateLimitHeaders`.
 */
export async function rateLimitGuard(
  bucket: string,
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitGuard> {
  const result = await checkRateLimit(bucket, identifier, limit, windowMs);
  if (result.allowed) return { result, denied: null };

  const response = new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
  return { result, denied: withRateLimitHeaders(response, result, limit) };
}
