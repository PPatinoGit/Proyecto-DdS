/*
 Ballot definition stored in the database.

 A ballot is replaced as a whole from the admin editor and written in one
 transaction. Once any vote has been cast, the definition is frozen: changing
 an option would change the meaning of votes already recorded.
*/

import { db } from "./db.js";
import { findElectionById } from "./elections.js";
import { VotingError } from "./voting.js";
import type { Motion, MotionOption } from "./types.js";
import type { MotionsInputPayload } from "./validation.js";

type MotionRow = { id: number; title: string; position: number };
type OptionRow = { id: number; motion_id: number; label: string; position: number };

/** Motions with their options, in the order the admin defined. */
export async function listMotions(electionId: number): Promise<Motion[]> {
  const [motionResult, optionResult] = await Promise.all([
    db.execute({
      sql: `SELECT id, title, position FROM motion
            WHERE election_id = ? ORDER BY position, id`,
      args: [electionId],
    }),
    db.execute({
      sql: `SELECT o.id, o.motion_id, o.label, o.position
            FROM motion_option o
            JOIN motion m ON m.id = o.motion_id
            WHERE m.election_id = ? ORDER BY o.position, o.id`,
      args: [electionId],
    }),
  ]);

  const optionsByMotion = new Map<number, MotionOption[]>();
  for (const row of optionResult.rows as unknown as OptionRow[]) {
    const list = optionsByMotion.get(row.motion_id) ?? [];
    list.push({ id: Number(row.id), label: String(row.label), position: Number(row.position) });
    optionsByMotion.set(row.motion_id, list);
  }

  return (motionResult.rows as unknown as MotionRow[]).map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    position: Number(row.position),
    options: optionsByMotion.get(Number(row.id)) ?? [],
  }));
}

/** True once at least one vote belongs to an election. */
export async function hasVotes(electionId: number): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT 1 FROM vote v
          JOIN motion m ON m.id = v.motion_id
          WHERE m.election_id = ? LIMIT 1`,
    args: [electionId],
  });
  return result.rows.length > 0;
}

/** Replaces every motion and option of an election atomically. */
export async function replaceMotions(
  electionId: number,
  motions: MotionsInputPayload["motions"],
): Promise<Motion[]> {
  if ((await findElectionById(electionId)) === null) {
    throw new VotingError("election_not_found");
  }
  if (await hasVotes(electionId)) throw new VotingError("votes_exist");

  const tx = await db.transaction("write");

  try {
    await tx.execute({
      sql: `DELETE FROM motion_option
            WHERE motion_id IN (SELECT id FROM motion WHERE election_id = ?)`,
      args: [electionId],
    });
    await tx.execute({ sql: "DELETE FROM motion WHERE election_id = ?", args: [electionId] });

    for (const [index, motion] of motions.entries()) {
      const inserted = await tx.execute({
        sql: `INSERT INTO motion (election_id, title, position)
              VALUES (?, ?, ?) RETURNING id`,
        args: [electionId, motion.title, index],
      });
      const row = inserted.rows[0];
      if (row === undefined) throw new Error("INSERT INTO motion did not return an id");
      const motionId = Number(row.id);

      for (const [optionIndex, label] of motion.options.entries()) {
        await tx.execute({
          sql: `INSERT INTO motion_option (motion_id, label, position)
                VALUES (?, ?, ?)`,
          args: [motionId, label, optionIndex],
        });
      }
    }

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  return listMotions(electionId);
}
