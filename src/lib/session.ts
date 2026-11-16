/*
 Resolves the user behind the session cookie.

 The cookie only carries { userId, exp }; this module joins it with the admin
 catalog. It is the server-side equivalent of what /api/auth/me does, so API
 handlers do not repeat the same five lines.
*/

import { readSession } from "./auth";
import { findUserById, toPublicUser } from "./users";
import type { PublicUser } from "./types";

/** Returns the signed-in user, or null when the session is missing, expired or orphaned. */
export function readSessionUser(request: Request): PublicUser | null {
  const session = readSession(request);
  if (session === null) return null;

  const user = findUserById(session.userId);
  return user === null ? null : toPublicUser(user);
}
