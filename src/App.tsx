/*
 Route table.

 The guards are layout routes: their <Outlet /> is where the children render.
 Unknown paths go to /admin, and RequireAuth decides whether that means the
 panel or the login page.
*/

import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireGuest } from "./components/auth/route-guards";
import { AdminHome } from "./pages/admin/AdminHome";
import { Ballots } from "./pages/admin/Ballots";
import { Elections } from "./pages/admin/Elections";
import { Emails } from "./pages/admin/Emails";
import { Questionnaires } from "./pages/admin/Questionnaires";
import { Results } from "./pages/admin/Results";
import { Audit } from "./pages/admin/Audit";
import { Voters } from "./pages/admin/Voters";
import { Login } from "./pages/Login";
/* Public: the emailed link authenticates the voter, not a session. */
import { VotePage } from "./pages/vote/VotePage";
/* Public: the questionnaire link authenticates the recipient, not a session. */
import { QuestionnairePage } from "./pages/questionnaire/QuestionnairePage";

export function App() {
  return (
    <Routes>
      <Route element={<RequireGuest />}>
        <Route path="/login" element={<Login />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/elections" element={<Elections />} />
        <Route path="/admin/ballots" element={<Ballots />} />
        <Route path="/admin/results" element={<Results />} />
        <Route path="/admin/voters" element={<Voters />} />
        <Route path="/admin/emails" element={<Emails />} />
        <Route path="/admin/questionnaires" element={<Questionnaires />} />
        <Route path="/admin/audit" element={<Audit />} />
      </Route>

      <Route path="/vote/:token" element={<VotePage />} />
      <Route path="/questionnaire/:token" element={<QuestionnairePage />} />

      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
