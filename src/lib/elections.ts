/*
 Database access for elections.

 Every function maps a snake_case row to the camelCase shape the frontend
 knows. Only api/ imports this module: it depends on the libSQL client.
*/

import { db } from "./db.js";
import type { Election, ElectionStatus } from "./types.js";
import type { ElectionInputPayload } from "./validation.js";

type ElectionRow = {
  id: number;
  title: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
};

const STATUSES: readonly ElectionStatus[] = ["draft", "open", "closed"];

/** The database stores text; status must still be one of our three values. */
function toStatus(value: string): ElectionStatus {
  return STATUSES.includes(value as ElectionStatus) ? (value as ElectionStatus) : "draft";
}

function toElection(row: ElectionRow): Election {
  return {
    id: row.id,
    title: row.title,
    status: toStatus(row.status),
    opensAt: row.opens_at,
    closesAt: row.closes_at,
  };
}

/** datetime-local has no timezone; store a canonical ISO string in UTC. */
function toIso(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/** Newest first: the panel shows the last election at the top. */
export async function listElections(): Promise<Election[]> {
  const result = await db.execute(
    "SELECT id, title, status, opens_at, closes_at FROM election ORDER BY id DESC",
  );

  return result.rows.map((row) => toElection(row as unknown as ElectionRow));
}

/** Full election data, including status and the voting window. */
export async function findElectionById(id: number): Promise<Election | null> {
  const result = await db.execute({
    sql: "SELECT id, title, status, opens_at, closes_at FROM election WHERE id = ?",
    args: [id],
  });

  const row = result.rows[0];
  if (row === undefined) return null;

  return toElection(row as unknown as ElectionRow);
}

/** Publish or close an election. Both are explicit admin actions. */
export async function updateElectionStatus(
  id: number,
  status: "open" | "closed",
): Promise<Election | null> {
  const result = await db.execute({
    sql: `UPDATE election SET status = ? WHERE id = ?
          RETURNING id, title, status, opens_at, closes_at`,
    args: [status, id],
  });

  const row = result.rows[0];
  return row === undefined ? null : toElection(row as unknown as ElectionRow);
}

/** Creates a draft election. Publishing it is a separate step. */
export async function createElection(input: ElectionInputPayload): Promise<Election> {
  const result = await db.execute({
    sql: `INSERT INTO election (title, status, opens_at, closes_at)
          VALUES (?, 'draft', ?, ?)
          RETURNING id, title, status, opens_at, closes_at`,
    args: [input.title, toIso(input.opensAt), toIso(input.closesAt)],
  });

  const row = result.rows[0];
  if (row === undefined) throw new Error("INSERT did not return the new election");

  return toElection(row as unknown as ElectionRow);
}
