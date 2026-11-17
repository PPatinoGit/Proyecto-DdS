/*
 Route table.

 The guards are layout routes: their <Outlet /> is where the children render.
 Unknown paths go to /admin, and RequireAuth decides whether that means the
 panel or the login page.
*/

import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireGuest } from "./components/auth/route-guards";
import { AdminHome } from "./pages/admin/AdminHome";
import { Elections } from "./pages/admin/Elections";
import { Emails } from "./pages/admin/Emails";
import { Voters } from "./pages/admin/Voters";
import { Login } from "./pages/Login";

export function App() {
  return (
    <Routes>
      <Route element={<RequireGuest />}>
        <Route path="/login" element={<Login />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/elections" element={<Elections />} />
        <Route path="/admin/voters" element={<Voters />} />
        <Route path="/admin/emails" element={<Emails />} />
      </Route>

      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
