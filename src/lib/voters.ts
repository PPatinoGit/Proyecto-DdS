/*
 Database access for voter rosters.

 A person exists once and can be part of many elections with a different weight,
 so importing writes to both `person` and `voter_roll`. Only api/ imports this
 module: it depends on the libSQL client.
*/

import { db } from "./db";
import type { Voter, VoterImportSummary } from "./types";
import type { VoterCsvRow } from "./csv";

type VoterRow = {
  person_id: number;
  email: string;
  full_name: string;
  birthdate: string | null;
  gender: string | null;
  weight: number;
};

function toVoter(row: VoterRow): Voter {
  return {
    personId: Number(row.person_id),
    email: row.email,
    name: row.full_name,
    birthdate: row.birthdate,
    gender: row.gender,
    weight: Number(row.weight),
  };
}

/** Roster of one election, alphabetical by name. */
export async function listVoters(electionId: number): Promise<Voter[]> {
  const result = await db.execute({
    sql: `SELECT p.id AS person_id, p.email, p.full_name, p.birthdate, p.gender,
                 vr.weight
          FROM voter_roll vr
          JOIN person p ON p.id = vr.person_id
          WHERE vr.election_id = ?
          ORDER BY p.full_name COLLATE NOCASE, p.email`,
    args: [electionId],
  });

  return result.rows.map((row) => toVoter(row as unknown as VoterRow));
}

/**
 Imports a validated CSV in a single write batch.

 Re-importing the same email updates the person data and the weight instead of
 creating duplicates, so the operation is idempotent. The batch runs inside a
 transaction: either every row lands or none does.
*/
export async function importVoters(
  electionId: number,
  rows: VoterCsvRow[],
): Promise<VoterImportSummary> {
  const statements = rows.flatMap((row) => [
    {
      sql: `INSERT INTO person (email, full_name, birthdate, gender)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
              full_name = excluded.full_name,
              birthdate = excluded.birthdate,
              gender = excluded.gender`,
      args: [row.email, row.name, row.birthdate, row.gender],
    },
    {
      sql: `INSERT INTO voter_roll (election_id, person_id, weight)
            VALUES (?, (SELECT id FROM person WHERE email = ?), ?)
            ON CONFLICT(election_id, person_id) DO UPDATE SET
              weight = excluded.weight`,
      args: [electionId, row.email, row.weight],
    },
  ]);

  await db.batch(statements, "write");

  const count = await db.execute({
    sql: "SELECT COUNT(*) AS total FROM voter_roll WHERE election_id = ?",
    args: [electionId],
  });

  return {
    imported: rows.length,
    total: Number(count.rows[0]?.total ?? 0),
  };
}
