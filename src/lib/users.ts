/* Admin Catalog 
Administrators are stored on a JSON file versioned on the repo, thats why this module is only for reading */

// The atribute 'with { type: "json" }' is required to import JSON files in TypeScript 
import usersJson from "../../data/users.json" with { type: "json" };

import type { PublicUser } from "./types";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "admin"; // unión literal: hoy solo existe el rol "admin"
  passwordHash: string;
};

const users = usersJson.users as AdminUser[];

/** Search an administrator by email (case-insensitive). */
export function findUserByEmail(email: string): AdminUser | null {
  const normalized = email.trim().toLowerCase();
  return users.find((user) => user.email.toLowerCase() === normalized) ?? null;
}

/** Search an administrator by their identifier (the one that travels in the cookie). */
export function findUserById(id: string): AdminUser | null {
  return users.find((user) => user.id === id) ?? null;
}

/* Re-exported so server code can keep importing it from here. */
export type { PublicUser };

/*
 Converts an AdminUser into something safe to send to the browser.
 The fields are written one by one on purpose: if tomorrow a sensitive data is added to AdminUser, this object will NOT filter it by accident.
 */
export function toPublicUser(user: AdminUser): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}