/*
  Questionnaire domain logic.

  A questionnaire owns free-text questions. Each question is categorized
  automatically, has exactly one responsible (assignment.question_id is the
  primary key) and at most one answer. Delegating moves the responsibility and
  writes a history row in the same transaction, so the single-owner invariant
  can never be observed broken.

  Recipients authenticate with their questionnaire link, not with an admin
  session. The token only proves who they are; permissions are checked per
  question against the current assignment.
*/

import { randomBytes } from "node:crypto";
import { db } from "./db";
import { CATEGORY_KEYS, categorizeQuestion } from "./categories";
import { resolveQuestionnaireToken } from "./questionnaire-tokens";
import type {
  QuestionnaireAnswerPayload,
  QuestionnaireDelegationPayload,
  QuestionnaireInputPayload,
} from "./validation";
import type {
  CategoryKey,
  DelegationEvent,
  OrganizationPerson,
  Questionnaire,
  QuestionnaireDetail,
  QuestionnaireProgress,
  QuestionnaireQuestion,
  QuestionnaireView,
} from "./types";

/** Machine-readable failures; the API maps each code to an HTTP status. */
export class QuestionnaireError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "QuestionnaireError";
    this.code = code;
  }
}

type PersonRow = {
  id: number | string;
  full_name: string;
  email: string;
};

type QuestionnaireRow = {
  id: number | string;
  title: string;
  owner_id: number | string;
  status: string;
  created_at: string;
  owner_name: string;
  owner_email: string;
  question_count: number | string;
  answer_count: number | string;
  delegation_count: number | string;
};

type QuestionRow = {
  id: number | string;
  body: string;
  position: number | string;
  category_name: string | null;
  answer_body: string | null;
  answered_at: string | null;
  assignee_id: number | string | null;
  assignee_name: string | null;
  assignee_email: string | null;
};

function toPerson(row: PersonRow): OrganizationPerson {
  return {
    personId: Number(row.id),
    name: String(row.full_name),
    email: String(row.email),
  };
}

function toCategoryKey(value: string | null): CategoryKey {
  return CATEGORY_KEYS.includes(value as CategoryKey)
    ? (value as CategoryKey)
    : "general";
}

/* Shared SELECT: one row per question with its category, owner and answer. */
const QUESTION_SELECT = `
  SELECT qu.id, qu.body, qu.position, c.name AS category_name,
         a.body AS answer_body, a.created_at AS answered_at,
         p.id AS assignee_id, p.full_name AS assignee_name, p.email AS assignee_email
  FROM question qu
  LEFT JOIN category c ON c.id = qu.category_id
  LEFT JOIN assignment ass ON ass.question_id = qu.id
  LEFT JOIN person p ON p.id = ass.assignee_id
  LEFT JOIN answer a ON a.question_id = qu.id
  WHERE qu.questionnaire_id = ?
  ORDER BY qu.position, qu.id`;

/* Shared SELECT: questionnaire summary with three correlated counters. */
const QUESTIONNAIRE_SELECT = `
  SELECT q.id, q.title, q.owner_id, q.status, q.created_at,
         p.full_name AS owner_name, p.email AS owner_email,
         (SELECT COUNT(*) FROM question qu WHERE qu.questionnaire_id = q.id) AS question_count,
         (SELECT COUNT(*) FROM answer a
            JOIN question qu ON qu.id = a.question_id
           WHERE qu.questionnaire_id = q.id) AS answer_count,
         (SELECT COUNT(*) FROM delegation_log dl
            JOIN question qu ON qu.id = dl.question_id
           WHERE qu.questionnaire_id = q.id) AS delegation_count
  FROM questionnaire q
  JOIN person p ON p.id = q.owner_id`;

const HISTORY_SELECT = `
  SELECT dl.id, qu.body AS question_body,
         pf.full_name AS from_name, pt.full_name AS to_name, dl.created_at
  FROM delegation_log dl
  JOIN question qu ON qu.id = dl.question_id
  JOIN person pf ON pf.id = dl.from_id
  JOIN person pt ON pt.id = dl.to_id
  WHERE qu.questionnaire_id = ?
  ORDER BY dl.id DESC
  LIMIT 20`;

function toQuestionnaire(row: QuestionnaireRow): Questionnaire {
  return {
    id: Number(row.id),
    title: String(row.title),
    owner: {
      personId: Number(row.owner_id),
      name: String(row.owner_name),
      email: String(row.owner_email),
    },
    status: row.status === "closed" ? "closed" : "open",
    createdAt: String(row.created_at),
    questionCount: Number(row.question_count),
    answerCount: Number(row.answer_count),
    delegationCount: Number(row.delegation_count),
  };
}

function toQuestion(row: QuestionRow): QuestionnaireQuestion {
  const assignee =
    row.assignee_id === null
      ? null
      : {
          personId: Number(row.assignee_id),
          name: String(row.assignee_name),
          email: String(row.assignee_email),
        };

  return {
    id: Number(row.id),
    body: String(row.body),
    position: Number(row.position),
    category: toCategoryKey(row.category_name),
    assignee,
    answer: row.answer_body === null ? null : String(row.answer_body),
    answeredAt: row.answered_at === null ? null : String(row.answered_at),
  };
}

/** Progress is always aggregate: totals and per-category counts, no identities. */
function buildProgress(
  questions: QuestionnaireQuestion[],
  ownerId: number,
): QuestionnaireProgress {
  const grouped = new Map<CategoryKey, { total: number; answered: number }>();
  let answered = 0;
  let delegated = 0;

  for (const question of questions) {
    if (question.answer !== null) answered += 1;
    if (question.assignee !== null && question.assignee.personId !== ownerId) {
      delegated += 1;
    }

    const current = grouped.get(question.category) ?? { total: 0, answered: 0 };
    current.total += 1;
    if (question.answer !== null) current.answered += 1;
    grouped.set(question.category, current);
  }

  return {
    total: questions.length,
    answered,
    delegated,
    byCategory: CATEGORY_KEYS.filter((key) => grouped.has(key)).map((key) => ({
      category: key,
      ...(grouped.get(key) as { total: number; answered: number }),
    })),
  };
}

async function readQuestions(questionnaireId: number): Promise<QuestionnaireQuestion[]> {
  const result = await db.execute({
    sql: QUESTION_SELECT,
    args: [questionnaireId],
  });
  return result.rows.map((row) => toQuestion(row as unknown as QuestionRow));
}

async function readHistory(questionnaireId: number): Promise<DelegationEvent[]> {
  const result = await db.execute({
    sql: HISTORY_SELECT,
    args: [questionnaireId],
  });
  return result.rows.map((row) => ({
    id: Number(row.id),
    questionBody: String(row.question_body),
    fromName: String(row.from_name),
    toName: String(row.to_name),
    createdAt: String(row.created_at),
  }));
}

/** Creates a questionnaire, categorizes its questions and returns owner link. */
export async function createQuestionnaire(
  input: QuestionnaireInputPayload,
): Promise<{ questionnaireId: number; ownerToken: string }> {
  const tx = await db.transaction("write");

  try {
    const owner = await tx.execute({
      sql: `SELECT id, full_name, email FROM person WHERE id = ?`,
      args: [input.ownerId],
    });
    if (owner.rows[0] === undefined) throw new QuestionnaireError("person_not_found");

    const inserted = await tx.execute({
      sql: `INSERT INTO questionnaire (title, owner_id, status)
            VALUES (?, ?, 'open') RETURNING id`,
      args: [input.title, input.ownerId],
    });
    const questionnaireId = Number(inserted.rows[0]?.id);

    for (const [index, body] of input.questions.entries()) {
      const category = categorizeQuestion(body);
      await tx.execute({
        sql: `INSERT OR IGNORE INTO category (name) VALUES (?)`,
        args: [category],
      });
      const categoryRow = await tx.execute({
        sql: `SELECT id FROM category WHERE name = ?`,
        args: [category],
      });
      const categoryId = Number(categoryRow.rows[0]?.id);

      const question = await tx.execute({
        sql: `INSERT INTO question (questionnaire_id, category_id, body, position)
              VALUES (?, ?, ?, ?) RETURNING id`,
        args: [questionnaireId, categoryId, body, index],
      });
      await tx.execute({
        sql: `INSERT INTO assignment (question_id, assignee_id)
              VALUES (?, ?)`,
        args: [Number(question.rows[0]?.id), input.ownerId],
      });
    }

    /* The owner link is created here so a successful create always has one. */
    const ownerToken = randomBytes(24).toString("base64url");
    await tx.execute({
      sql: `INSERT INTO questionnaire_token (token, questionnaire_id, person_id)
            VALUES (?, ?, ?)`,
      args: [ownerToken, questionnaireId, input.ownerId],
    });

    await tx.commit();
    return { questionnaireId, ownerToken };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/** All questionnaires with totals, newest first. */
export async function listQuestionnaires(): Promise<Questionnaire[]> {
  const result = await db.execute(`${QUESTIONNAIRE_SELECT} ORDER BY q.id DESC`);
  return result.rows.map((row) => toQuestionnaire(row as unknown as QuestionnaireRow));
}

/** Directory of people, used to pick the initial responsible. */
export async function listOrganizationPeople(): Promise<OrganizationPerson[]> {
  const result = await db.execute({
    sql: `SELECT id, full_name, email FROM person ORDER BY full_name, id LIMIT 500`,
  });
  return result.rows.map((row) => toPerson(row as unknown as PersonRow));
}

/** Admin view of one questionnaire, including the owner link and history. */
export async function getQuestionnaireDetail(
  questionnaireId: number,
): Promise<QuestionnaireDetail> {
  const result = await db.execute({
    sql: `${QUESTIONNAIRE_SELECT} WHERE q.id = ?`,
    args: [questionnaireId],
  });
  const row = result.rows[0];
  if (row === undefined) throw new QuestionnaireError("questionnaire_not_found");

  const questionnaire = toQuestionnaire(row as unknown as QuestionnaireRow);
  const questions = await readQuestions(questionnaireId);
  const tokenRow = await db.execute({
    sql: `SELECT token FROM questionnaire_token
          WHERE questionnaire_id = ? AND person_id = ?`,
    args: [questionnaireId, questionnaire.owner.personId],
  });

  return {
    questionnaire,
    progress: buildProgress(questions, questionnaire.owner.personId),
    questions,
    ownerLink:
      tokenRow.rows[0] === undefined ? null : String(tokenRow.rows[0].token),
    history: await readHistory(questionnaireId),
  };
}

/** Recipient view through /questionnaire/<token>. The token is the credential. */
export async function getQuestionnaireView(token: string): Promise<QuestionnaireView> {
  const context = await resolveQuestionnaireToken(token);
  if (context === null) throw new QuestionnaireError("invalid_token");

  const result = await db.execute({
    sql: `SELECT id, title FROM questionnaire WHERE id = ?`,
    args: [context.questionnaireId],
  });
  const qRow = result.rows[0];
  if (qRow === undefined) throw new QuestionnaireError("questionnaire_not_found");

  const personResult = await db.execute({
    sql: `SELECT id, full_name, email FROM person WHERE id = ?`,
    args: [context.personId],
  });
  const pRow = personResult.rows[0];
  if (pRow === undefined) throw new QuestionnaireError("invalid_token");

  const questions = await readQuestions(context.questionnaireId);
  const owner = await db.execute({
    sql: `SELECT owner_id FROM questionnaire WHERE id = ?`,
    args: [context.questionnaireId],
  });
  const ownerId = Number(owner.rows[0]?.owner_id ?? context.personId);

  /* Directory of people who may receive a delegation. */
  const peopleResult = await db.execute({
    sql: `SELECT id, full_name, email FROM person
          WHERE id != ? ORDER BY full_name, id LIMIT 200`,
    args: [context.personId],
  });

  return {
    questionnaire: {
      id: Number(qRow.id),
      title: String(qRow.title),
    },
    person: toPerson(pRow as unknown as PersonRow),
    progress: buildProgress(questions, ownerId),
    mine: questions.filter((q) => q.assignee?.personId === context.personId),
    others: questions.filter((q) => q.assignee?.personId !== context.personId),
    people: peopleResult.rows.map((row) => toPerson(row as unknown as PersonRow)),
    history: await readHistory(context.questionnaireId),
  };
}

/** Loads one question and checks it belongs to this questionnaire and person. */
async function assertResponsible(
  tx: { execute: typeof db.execute },
  questionnaireId: number,
  personId: number,
  questionId: number,
): Promise<void> {
  const result = await tx.execute({
    sql: `SELECT ass.assignee_id
          FROM question qu
          LEFT JOIN assignment ass ON ass.question_id = qu.id
          WHERE qu.id = ? AND qu.questionnaire_id = ?`,
    args: [questionId, questionnaireId],
  });

  const row = result.rows[0];
  if (row === undefined) throw new QuestionnaireError("different_questionnaire");
  if (Number(row.assignee_id) !== personId) {
    throw new QuestionnaireError("not_responsible");
  }
}

/** Writes the answer of a question assigned to the token holder. */
export async function answerQuestion(
  token: string,
  input: QuestionnaireAnswerPayload,
): Promise<void> {
  const context = await resolveQuestionnaireToken(token);
  if (context === null) throw new QuestionnaireError("invalid_token");

  const tx = await db.transaction("write");
  try {
    await assertResponsible(
      tx,
      context.questionnaireId,
      context.personId,
      input.questionId,
    );

    /* One answer per question: replace the previous one in the same tx. */
    await tx.execute({
      sql: `DELETE FROM answer WHERE question_id = ?`,
      args: [input.questionId],
    });
    await tx.execute({
      sql: `INSERT INTO answer (question_id, author_id, body)
            VALUES (?, ?, ?)`,
      args: [input.questionId, context.personId, input.body],
    });

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * Delegates one or more questions to another person. The whole batch either
 * moves or nothing moves; the delegate's link is returned so the UI can show it.
 */
export async function delegateQuestions(
  token: string,
  input: QuestionnaireDelegationPayload,
): Promise<string> {
  const context = await resolveQuestionnaireToken(token);
  if (context === null) throw new QuestionnaireError("invalid_token");
  if (input.toPersonId === context.personId) {
    throw new QuestionnaireError("same_person");
  }

  const tx = await db.transaction("write");
  try {
    const target = await tx.execute({
      sql: `SELECT id FROM person WHERE id = ?`,
      args: [input.toPersonId],
    });
    if (target.rows[0] === undefined) throw new QuestionnaireError("person_not_found");

    /* Validate every question before writing any of them. */
    for (const questionId of input.questionIds) {
      await assertResponsible(
        tx,
        context.questionnaireId,
        context.personId,
        questionId,
      );
    }

    for (const questionId of input.questionIds) {
      await tx.execute({
        sql: `UPDATE assignment
              SET assignee_id = ?, assigned_at = datetime('now')
              WHERE question_id = ?`,
        args: [input.toPersonId, questionId],
      });
      await tx.execute({
        sql: `INSERT INTO delegation_log (question_id, from_id, to_id)
              VALUES (?, ?, ?)`,
        args: [questionId, context.personId, input.toPersonId],
      });
    }

    await tx.execute({
      sql: `INSERT INTO questionnaire_token (token, questionnaire_id, person_id)
            VALUES (?, ?, ?)
            ON CONFLICT(questionnaire_id, person_id) DO NOTHING`,
      args: [randomBytes(24).toString("base64url"), context.questionnaireId, input.toPersonId],
    });
    const delegateToken = await tx.execute({
      sql: `SELECT token FROM questionnaire_token
            WHERE questionnaire_id = ? AND person_id = ?`,
      args: [context.questionnaireId, input.toPersonId],
    });

    await tx.commit();
    return String(delegateToken.rows[0]?.token ?? "");
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
