/*
  Shared test setup.

  Every test file gets its own temporary SQLite database, so tests never touch
  data/dev.db and can run in parallel. Environment variables are set BEFORE the
  dynamic imports because src/lib/db.ts and src/lib/auth.ts read them at load
  time. Static imports would be hoisted and break that ordering.
*/

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createClient } from "@libsql/client";

const directory = mkdtempSync(join(tmpdir(), "voting-tests-"));
process.env.DATABASE_URL = `file:${join(directory, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;
process.env.SESSION_SECRET = "test-only-secret-not-for-production";
process.env.NODE_ENV = "test";

const setup = createClient({ url: process.env.DATABASE_URL });
await setup.executeMultiple(readFileSync("db/schema.sql", "utf8"));
setup.close();

/* Server modules now see the temporary database and the test secret. */
export const { db } = await import("../src/lib/db.ts");
export const { createSessionCookie } = await import("../src/lib/auth.ts");
export const { categorizeQuestion } = await import("../src/lib/categories.ts");
export const { recordAudit, listAuditEvents } = await import("../src/lib/audit.ts");
export const {
  checkRateLimit,
  rateLimitGuard,
  withRateLimitHeaders,
  RATE_LIMITS,
} = await import("../src/lib/rate-limit.ts");
export const { ensureBallotTokens } = await import("../src/lib/tokens.ts");
export const { createElection, updateElectionStatus } = await import("../src/lib/elections.ts");
export const { replaceMotions } = await import("../src/lib/motions.ts");
export const { createQuestionnaire } = await import("../src/lib/questionnaires.ts");
export const { ensureQuestionnaireTokens, resolveQuestionnaireToken } = await import(
  "../src/lib/questionnaire-tokens.ts"
);

/** Request with a valid admin session cookie for the demo administrator. */
export function adminRequest(url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("cookie", createSessionCookie("admin-1"));
  return new Request(url, { ...init, headers });
}

/** JSON POST helper; handlers see a normal Web Request. */
export function postJson(url, body, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Minimal person row; email is unique so callers pass a distinct identifier. */
export async function seedPerson(identifier, name = "Test Person") {
  const result = await db.execute({
    sql: `INSERT INTO person (email, full_name, gender) VALUES (?, ?, ?)`,
    args: [`${identifier}@example.test`, name, "female"],
  });
  return Number(result.lastInsertRowid);
}

/** Open election with one motion, one voter and a stable ballot token. */
export async function seedBallot(identifier) {
  const election = await createElection({ title: `Election ${identifier}`, opensAt: null, closesAt: null });
  const personId = await seedPerson(`${identifier}-voter`, "Voter");
  const weight = 2;

  await db.execute({
    sql: `INSERT INTO voter_roll (election_id, person_id, weight) VALUES (?, ?, ?)`,
    args: [election.id, personId, weight],
  });
  await replaceMotions(election.id, [{ title: "Approve", options: ["Yes", "No"] }]);
  await updateElectionStatus(election.id, "open");

  const motions = await db.execute({
    sql: `SELECT id FROM motion WHERE election_id = ?`,
    args: [election.id],
  });
  const options = await db.execute({
    sql: `SELECT id FROM motion_option WHERE motion_id = ? ORDER BY position`,
    args: [Number(motions.rows[0].id)],
  });

  const tokens = await ensureBallotTokens(election.id, [personId]);
  return {
    electionId: election.id,
    personId,
    token: tokens.get(personId),
    motionId: Number(motions.rows[0].id),
    optionId: Number(options.rows[0].id),
  };
}

/** Questionnaire with one question and a valid owner link. */
export async function seedQuestionnaire(identifier) {
  const ownerId = await seedPerson(`${identifier}-owner`, "Owner");
  const created = await createQuestionnaire({
    title: `Questionnaire ${identifier}`,
    ownerId,
    questions: ["¿Cómo evaluamos el presupuesto?"],
  });
  const holder = await resolveQuestionnaireToken(created.ownerToken);
  const questions = await db.execute({
    sql: `SELECT id FROM question WHERE questionnaire_id = ?`,
    args: [created.questionnaireId],
  });

  return {
    questionnaireId: created.questionnaireId,
    ownerId,
    token: created.ownerToken,
    questionId: Number(questions.rows[0].id),
    holder,
  };
}
