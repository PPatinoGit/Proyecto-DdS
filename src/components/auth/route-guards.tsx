/*
 Route guards.

 Both guards wrap <Outlet />, the place where the router renders the route
 they protect. Keeping them as layout routes avoids repeating the check in
 every page.
*/

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { FullScreenLoader } from "../ui/FullScreenLoader";

/** Only signed-in users may continue; everyone else goes to /login. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  // The session cookie is HttpOnly, so only the server can tell whether it is
  // still valid. Until /api/auth/me answers we must wait: redirecting now
  // would sign the user out on every page reload.
  if (status === "loading") return <FullScreenLoader />;

  if (status === "anonymous") {
    // `from` lets the login page return here after a successful sign-in.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/** The login page makes no sense once the session is already valid. */
export function RequireGuest() {
  const { status } = useAuth();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "authenticated") return <Navigate to="/admin" replace />;

  return <Outlet />;
}
