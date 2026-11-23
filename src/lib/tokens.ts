/*
 Ballot tokens: the random secret behind each unique voting link.

 A token is created the first time an email is sent to that voter and is never
 replaced, so resending an email sends the same link. `UNIQUE (election_id,
 person_id)` in the schema is what makes the operation idempotent.
*/

import { randomBytes } from "node:crypto";
import { db } from "./db.js";

/** 24 random bytes → 32 URL-safe characters. */
function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 Returns the token of every requested voter, creating the missing ones.
 The map is keyed by person id; the caller already knows the election.
*/
export async function ensureBallotTokens(
  electionId: number,
  personIds: number[],
): Promise<Map<number, string>> {
  if (personIds.length === 0) return new Map();

  /* DO NOTHING keeps the token of a voter who already received an email. */
  const statements = personIds.map((personId) => ({
    sql: `INSERT INTO ballot_token (token, election_id, person_id)
          VALUES (?, ?, ?)
          ON CONFLICT(election_id, person_id) DO NOTHING`,
    args: [newToken(), electionId, personId],
  }));
  await db.batch(statements, "write");

  const placeholders = personIds.map(() => "?").join(", ");
  const result = await db.execute({
    sql: `SELECT person_id, token
          FROM ballot_token
          WHERE election_id = ? AND person_id IN (${placeholders})`,
    args: [electionId, ...personIds],
  });

  return new Map(
    result.rows.map((row) => [Number(row.person_id), String(row.token)]),
  );
}

/**
 * Resolves a link to its election and person, or null when unknown.
 * Used by the audit trail to identify the voter without storing the token.
 */
export async function resolveBallotToken(
  token: string,
): Promise<{ electionId: number; personId: number } | null> {
  const result = await db.execute({
    sql: `SELECT election_id, person_id FROM ballot_token WHERE token = ?`,
    args: [token],
  });

  const row = result.rows[0];
  if (row === undefined) return null;

  return {
    electionId: Number(row.election_id),
    personId: Number(row.person_id),
  };
}
