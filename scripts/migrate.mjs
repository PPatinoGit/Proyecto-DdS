/*
 Applies the versioned SQL migrations in db/migrations/ once each.

 init-db.mjs creates a fresh schema; this script upgrades databases that
 already exist (the local dev file and, after a deploy, Turso). A tiny table
 records which migrations have already run, so running it twice is harmless.
*/

import { createClient } from "@libsql/client";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export async function applyMigrations(client) {
  await client.execute(
    `CREATE TABLE IF NOT EXISTS _migration (
       name       TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  );

  const applied = new Set(
    (await client.execute("SELECT name FROM _migration")).rows.map((row) => String(row.name)),
  );

  const files = readdirSync("db/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join("db/migrations", file), "utf8");
    await client.executeMultiple(sql);
    await client.execute({
      sql: "INSERT INTO _migration (name) VALUES (?)",
      args: [file],
    });
    console.log(`  migración aplicada: ${file}`);
  }

  return files.length - applied.size;
}

/* Direct execution: node scripts/migrate.mjs */
if (process.argv[1]?.endsWith("migrate.mjs")) {
  const url = process.env.DATABASE_URL ?? "file:./data/dev.db";
  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  const count = await applyMigrations(client);
  console.log(`Migraciones al día en ${url} (${count} nuevas)`);
  client.close();
}
