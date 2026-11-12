// ---------------------------------------------------------------------------
// Holds the session state for the whole app.
//
// It lives in its own file because React Fast Refresh requires a module to
// export components only; the hook and the context are in src/hooks/useAuth.ts.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError } from "../../lib/api";
import { fetchMe, loginRequest, logoutRequest } from "../../lib/auth-api";
import type { PublicUser } from "../../lib/types";
import { AuthContext, type AuthStatus } from "../../hooks/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  // On mount, ask the server whether the HttpOnly cookie is still valid.
  // JavaScript cannot read that cookie, so this request is the only way to
  // restore the session after a page reload.
  useEffect(() => {
    const controller = new AbortController();

    fetchMe(controller.signal)
      .then((session) => {
        setUser(session.user);
        setStatus("authenticated");
      })
      .catch((error: unknown) => {
        // The cleanup aborted the request: ignore it. In development
        // StrictMode mounts the component twice, so a second run is coming.
        if (error instanceof Error && error.name === "AbortError") return;

        // 401 is the normal answer when nobody is logged in.
        if (!(error instanceof ApiError && error.status === 401)) {
          console.error("Could not check the session", error);
        }
        setUser(null);
        setStatus("anonymous");
      });

    return () => controller.abort();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Errors (401, network) propagate to the form, which decides what to show.
    const session = await loginRequest(email, password);
    setUser(session.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    // Only clear the local state after the server cleared the cookie.
    // Clearing it on a failed request would leave a valid session behind
    // while the UI claims the user is logged out.
    await logoutRequest();
    setUser(null);
    setStatus("anonymous");
  }, []);

  // Without memoization every render creates a new object and forces all
  // consumers to re-render, even when nothing changed.
  const value = useMemo(
    () => ({ user, status, login, logout }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}