/*
  Questionnaire links.

  Same idea as ballot tokens: 24 random bytes in base64url (32 characters) and
  one stable token per (questionnaire, person). The UNIQUE pair in the schema
  makes creation idempotent, so a delegate who receives the questionnaire twice
  keeps the same link.
*/

import { randomBytes } from "node:crypto";
import { db } from "./db";

/** 24 random bytes → 32 URL-safe characters. */
function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Returns the token of every requested person, creating the missing ones.
 * The map is keyed by person id.
 */
export async function ensureQuestionnaireTokens(
  questionnaireId: number,
  personIds: number[],
): Promise<Map<number, string>> {
  if (personIds.length === 0) return new Map();

  const statements = personIds.map((personId) => ({
    sql: `INSERT INTO questionnaire_token (token, questionnaire_id, person_id)
          VALUES (?, ?, ?)
          ON CONFLICT(questionnaire_id, person_id) DO NOTHING`,
    args: [newToken(), questionnaireId, personId],
  }));
  await db.batch(statements, "write");

  const placeholders = personIds.map(() => "?").join(", ");
  const result = await db.execute({
    sql: `SELECT person_id, token
          FROM questionnaire_token
          WHERE questionnaire_id = ? AND person_id IN (${placeholders})`,
    args: [questionnaireId, ...personIds],
  });

  return new Map(
    result.rows.map((row) => [Number(row.person_id), String(row.token)]),
  );
}

/** Resolves a link to its questionnaire and person, or null when unknown. */
export async function resolveQuestionnaireToken(
  token: string,
): Promise<{ questionnaireId: number; personId: number } | null> {
  const result = await db.execute({
    sql: `SELECT questionnaire_id, person_id FROM questionnaire_token WHERE token = ?`,
    args: [token],
  });

  const row = result.rows[0];
  if (row === undefined) return null;

  return {
    questionnaireId: Number(row.questionnaire_id),
    personId: Number(row.person_id),
  };
}
