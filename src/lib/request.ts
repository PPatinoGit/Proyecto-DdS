/*
  Request helpers shared by API handlers.

  Vercel terminates TLS and puts the real client address in `x-forwarded-for`.
  The first entry is the original client; later ones are proxies. The header is
  attacker-controlled outside Vercel, so it is only used as a rate-limit key,
  never as an identity or authorisation decision.
*/

/** Best-effort client address for rate limiting, truncated for the DB key. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null) {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first !== "") return first.slice(0, 64);
  }

  const real = request.headers.get("x-real-ip")?.trim();
  if (real !== undefined && real !== "") return real.slice(0, 64);

  return "unknown";
}
