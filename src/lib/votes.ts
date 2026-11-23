/*
 Voting with a unique link: read the ballot, cast it once, tally the results.

 Security model: the token IS the credential. There is no admin session here.
 The token identifies both the election and the voter, and the weight comes
 from voter_roll, never from the request.

 Atomicity: the single-use mark and all vote rows are written in one
 transaction. The UNIQUE (motion_id, person_id) index is the second line of
 defence if two requests arrive at the same time.
*/

import { db } from "./db.js";
import { findElectionById } from "./elections.js";
import { listMotions } from "./motions.js";
import { VotingError, windowFor } from "./voting.js";
import type {
  Ballot,
  Election,
  ElectionResults,
  Motion,
  MotionResult,
  ResultOption,
  VoteChoice,
  VoteReceipt,
} from "./types.js";

export type TokenContext = {
  token: string;
  election: Election;
  personId: number;
  personName: string;
  weight: number;
  usedAt: string | null;
};

type TokenRow = {
  election_id: number;
  person_id: number;
  used_at: string | null;
  title: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  full_name: string;
  weight: number | null;
};

/** Resolves a ballot token, or throws `invalid_token`. */
export async function tokenContext(token: string): Promise<TokenContext> {
  const result = await db.execute({
    sql: `SELECT bt.election_id, bt.person_id, bt.used_at,
                 e.title, e.status, e.opens_at, e.closes_at,
                 p.full_name, vr.weight
          FROM ballot_token bt
          JOIN election e ON e.id = bt.election_id
          JOIN person p ON p.id = bt.person_id
          LEFT JOIN voter_roll vr
            ON vr.election_id = bt.election_id AND vr.person_id = bt.person_id
          WHERE bt.token = ?`,
    args: [token],
  });

  const row = result.rows[0];
  if (row === undefined) throw new VotingError("invalid_token");

  const value = row as unknown as TokenRow;
  if (value.weight === null || !Number.isFinite(Number(value.weight))) {
    /* A token whose voter left the roll must not be able to vote. */
    throw new VotingError("invalid_token");
  }

  /* Reuse the same mapping as the admin API, without a second query. */
  const election = await findElectionById(Number(value.election_id));
  if (election === null) throw new VotingError("invalid_token");

  return {
    token,
    election,
    personId: Number(value.person_id),
    personName: String(value.full_name),
    weight: Number(value.weight),
    usedAt: value.used_at === null ? null : String(value.used_at),
  };
}

type VoteRow = {
  motion_title: string;
  choice: string;
  weight_at_cast: number;
};

/** What this token recorded, used after voting and on a repeated visit. */
async function receiptFor(electionId: number, personId: number, castAt: string): Promise<VoteReceipt> {
  const result = await db.execute({
    sql: `SELECT m.title AS motion_title, v.choice, v.weight_at_cast
          FROM vote v JOIN motion m ON m.id = v.motion_id
          WHERE m.election_id = ? AND v.person_id = ?
          ORDER BY m.position, m.id`,
    args: [electionId, personId],
  });

  const answers = (result.rows as unknown as VoteRow[]).map((row) => ({
    motionTitle: String(row.motion_title),
    optionLabel: String(row.choice),
    weight: Number(row.weight_at_cast),
  }));

  return { castAt, weight: answers[0]?.weight ?? 0, answers };
}

/** Everything the voting page needs. Safe to call any number of times. */
export async function getBallot(token: string): Promise<Ballot> {
  const context = await tokenContext(token);
  const motions = await listMotions(context.election.id);

  return {
    election: {
      id: context.election.id,
      title: context.election.title,
      window: windowFor(context.election),
      opensAt: context.election.opensAt,
      closesAt: context.election.closesAt,
    },
    voterName: context.personName,
    motions,
    receipt:
      context.usedAt === null
        ? null
        : await receiptFor(context.election.id, context.personId, context.usedAt),
  };
}

/** Checks every choice against the current, frozen ballot definition. */
function validateChoices(motions: Motion[], choices: VoteChoice[]): Map<number, string> {
  if (motions.length === 0) throw new VotingError("no_motions");
  if (choices.length !== motions.length) throw new VotingError("incomplete_ballot");

  const labels = new Map<number, string>();
  for (const choice of choices) {
    const motion = motions.find((item) => item.id === choice.motionId);
    if (motion === undefined) throw new VotingError("invalid_choice");

    const option = motion.options.find((item) => item.id === choice.optionId);
    if (option === undefined) throw new VotingError("invalid_choice");

    labels.set(choice.motionId, option.label);
  }

  if (labels.size !== motions.length) throw new VotingError("incomplete_ballot");
  return labels;
}

/** Records a complete ballot. `choice` stores the label as a historical snapshot. */
export async function castVote(token: string, choices: VoteChoice[]): Promise<VoteReceipt> {
  const context = await tokenContext(token);

  if (windowFor(context.election) !== "open") {
    throw new VotingError(windowFor(context.election));
  }
  if (context.usedAt !== null) throw new VotingError("already_voted");

  const motions = await listMotions(context.election.id);
  const labels = validateChoices(motions, choices);

  const tx = await db.transaction("write");
  let castAt: string;

  try {
    /* Re-check inside the transaction: two requests can race here. */
    const current = await tx.execute({
      sql: "SELECT used_at FROM ballot_token WHERE token = ?",
      args: [token],
    });
    const currentRow = current.rows[0];
    if (currentRow === undefined) throw new VotingError("invalid_token");
    if (currentRow.used_at !== null) throw new VotingError("already_voted");

    const now = await tx.execute("SELECT datetime('now') AS now");
    castAt = String(now.rows[0]?.now ?? new Date().toISOString());

    const marked = await tx.execute({
      sql: `UPDATE ballot_token SET used_at = ?
            WHERE token = ? AND used_at IS NULL`,
      args: [castAt, token],
    });
    if (marked.rowsAffected !== 1) throw new VotingError("already_voted");

    for (const choice of choices) {
      await tx.execute({
        sql: `INSERT INTO vote (motion_id, person_id, choice, weight_at_cast, cast_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [choice.motionId, context.personId, labels.get(choice.motionId) ?? "", context.weight, castAt],
      });
    }

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    /* The database may win the race even after our check. */
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      throw new VotingError("already_voted");
    }
    throw error;
  }

  return receiptFor(context.election.id, context.personId, castAt);
}

type TallyRow = { motion_id: number; choice: string; votes: number; weight: number };
type CountRow = { value: number | string | null };

/** Weighted tallies and participation for the admin results page. */
export async function getResults(electionId: number): Promise<ElectionResults | null> {
  const election = await findElectionById(electionId);
  if (election === null) return null;

  const [motions, tallies, roster, voted] = await Promise.all([
    listMotions(electionId),
    db.execute({
      sql: `SELECT v.motion_id, v.choice, COUNT(*) AS votes,
                   COALESCE(SUM(v.weight_at_cast), 0) AS weight
            FROM vote v JOIN motion m ON m.id = v.motion_id
            WHERE m.election_id = ?
            GROUP BY v.motion_id, v.choice`,
      args: [electionId],
    }),
    db.execute({
      sql: `SELECT COUNT(*) AS value, COALESCE(SUM(weight), 0) AS weight
            FROM voter_roll WHERE election_id = ?`,
      args: [electionId],
    }),
    db.execute({
      sql: `SELECT COUNT(*) AS value, COALESCE(SUM(vr.weight), 0) AS weight
            FROM ballot_token bt
            JOIN voter_roll vr
              ON vr.election_id = bt.election_id AND vr.person_id = bt.person_id
            WHERE bt.election_id = ? AND bt.used_at IS NOT NULL`,
      args: [electionId],
    }),
  ]);

  const tallyByMotion = new Map<number, Map<string, { votes: number; weight: number }>>();
  for (const raw of tallies.rows as unknown as TallyRow[]) {
    const motionId = Number(raw.motion_id);
    const options = tallyByMotion.get(motionId) ?? new Map();
    options.set(String(raw.choice), {
      votes: Number(raw.votes),
      weight: Number(raw.weight),
    });
    tallyByMotion.set(motionId, options);
  }

  const results: MotionResult[] = motions.map((motion) => {
    const counts = tallyByMotion.get(motion.id) ?? new Map();

    /* Labels frozen at cast time should match, but keep unexpected ones visible. */
    const labels = [...motion.options.map((option) => option.label), ...counts.keys()];
    const options: ResultOption[] = [...new Set(labels)].map((label) => ({
      label,
      votes: counts.get(label)?.votes ?? 0,
      weight: counts.get(label)?.weight ?? 0,
    }));

    return {
      motionId: motion.id,
      title: motion.title,
      position: motion.position,
      options,
      totalVotes: options.reduce((sum, option) => sum + option.votes, 0),
      totalWeight: options.reduce((sum, option) => sum + option.weight, 0),
    };
  });

  const first = (result: { rows: unknown[] }, field: string): number => {
    const row = result.rows[0] as Record<string, CountRow> | undefined;
    return Number(row?.[field] ?? 0);
  };

  return {
    election: { id: election.id, title: election.title, status: election.status },
    turnout: {
      voters: first(roster, "value"),
      voted: first(voted, "value"),
      weightTotal: first(roster, "weight"),
      weightCast: first(voted, "weight"),
    },
    results,
  };
}
