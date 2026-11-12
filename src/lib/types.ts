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