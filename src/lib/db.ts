import process from "node:process";
import { createClient } from "@libsql/client";

/**
 * Cliente libSQL.
 *
 * En local usa un archivo (`file:./data/dev.db`); en producción apunta a Turso
 * (`libsql://...`) sin cambiar el código. Solo debe importarse desde `api/`,
 * nunca desde componentes de React.
 */
const url = process.env.DATABASE_URL ?? "file:./data/dev.db";

export const db = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
