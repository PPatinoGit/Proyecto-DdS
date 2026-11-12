/* 
 Session context and the hook that reads it.

 The provider component lives in src/components/auth/AuthProvider.tsx:
 React Fast Refresh requires a module to export components only, and this
 file exports a hook and a context instead.
*/

import { createContext, useContext } from "react";
import type { PublicUser } from "../lib/types";

/** "loading" only while the first /api/auth/me request is in flight. */
export type AuthStatus = "loading" | "authenticated" | "anonymous";

export type AuthContextValue = {
  user: PublicUser | null;
  status: AuthStatus;
  /** Throws ApiError (401, network...) so the form can show the reason. */
  login: (email: string, password: string) => Promise<void>;
  /** Throws ApiError if the request fails; state is kept on failure. */
  logout: () => Promise<void>;
};

/** null means "no provider above": useAuth turns that into a clear error. */
export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Reads the session state from the nearest <AuthProvider>.
 *
 * @throws {Error} when used outside the provider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}