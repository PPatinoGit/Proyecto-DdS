import usersJson from "../../data/users.json" with { type: "json" };

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "admin";
  passwordHash: string;
};

const users = usersJson.users as AdminUser[];

/** Busca un administrador por correo (sin distinguir mayúsculas). */
export function findUserByEmail(email: string): AdminUser | null {
  const normalized = email.trim().toLowerCase();
  return users.find((user) => user.email.toLowerCase() === normalized) ?? null;
}
