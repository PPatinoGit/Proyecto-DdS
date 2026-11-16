/*
Types shared by the server (api/) and the browser (src/).
This module must never import Node.js built-ins or server-only files: both tsconfig.server.json and tsconfig.app.json compile it.
*/

/* Role of a logged-in user. Today only admins can log in. */
export type Role = "admin";

/* User shape returned by the API. It never contains the password hash. */
export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

/* Status stored in election.status. */
export type ElectionStatus = "draft" | "open" | "closed";

/* Election as returned by the API. Dates are ISO 8601 strings or null. */
export type Election = {
  id: number;
  title: string;
  status: ElectionStatus;
  opensAt: string | null;
  closesAt: string | null;
};

/* Body accepted by POST /api/elections. Dates are ISO strings or null. */
export type ElectionInput = {
  title: string;
  opensAt: string | null;
  closesAt: string | null;
};