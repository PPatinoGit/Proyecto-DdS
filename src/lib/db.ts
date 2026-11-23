import process from "node:process";
import { createClient } from "@libsql/client";

/**
 * libSQL client.
 *
 * Locally it uses a file (`file:./data/dev.db`); in production it points to Turso
 * (`libsql://...`) without changing the code. It must only be imported from `api/`,
 * never from React components.
 */
const url = process.env.DATABASE_URL ?? "file:./data/dev.db";

export const db = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
