import { createClient } from "@libsql/client";
import { readFileSync, mkdirSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "file:./data/dev.db";
if (url.startsWith("file:")) mkdirSync("data", { recursive: true });

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
await client.executeMultiple(readFileSync("db/schema.sql", "utf8"));

console.log(`Esquema aplicado en ${url}`);
