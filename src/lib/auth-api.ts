/* 
 Typed calls to the authentication endpoints.
 This module only describes the API: no React, no state, no redirects.
 That keeps it reusable and easy to test.
*/

import { apiFetch } from "./api";
import type { PublicUser } from "./types";

/** Shape returned by both /api/auth/login and /api/auth/me. */
export type SessionResponse = { user: PublicUser };

/** GET /api/auth/me: resolves the current session, 401 when there is none. */
export function fetchMe(signal?: AbortSignal): Promise<SessionResponse> {
  return apiFetch<SessionResponse>("/api/auth/me", { signal });
}

/** POST /api/auth/login: 401 with "invalid_credentials" when they do not match. */
export function loginRequest(email: string, password: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

/** POST /api/auth/logout: 204, the server clears the cookie. */
export function logoutRequest(): Promise<void> {
  return apiFetch<void>("/api/auth/logout", { method: "POST" });
}