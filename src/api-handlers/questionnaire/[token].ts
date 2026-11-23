/*
  GET  /api/questionnaire/<token>  read the questionnaire identified by the link
  POST /api/questionnaire/<token>  answer one question (by its current owner)

  There is no admin session here: the secret token is the credential. All texts
  in the responses are machine-readable codes so the page can translate them
  without calling a translation API. The token is the rate-limit key, while the
  audit row stores the resolved person id instead of the secret.
*/

import { z } from "zod";
import {
  answerQuestion,
  getQuestionnaireView,
  QuestionnaireError,
} from "../../lib/questionnaires";
import { resolveQuestionnaireToken } from "../../lib/questionnaire-tokens";
import { recordAudit } from "../../lib/audit";
import { RATE_LIMITS, rateLimitGuard, withRateLimitHeaders } from "../../lib/rate-limit";
import { questionnaireAnswerSchema } from "../../lib/validation";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/);

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** The last path segment of /api/questionnaire/<token>. */
function tokenFrom(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const raw = parts.at(-1);
  if (raw === undefined) return null;

  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function questionnaireErrorResponse(error: QuestionnaireError): Response {
  if (error.code === "invalid_token" || error.code === "questionnaire_not_found") {
    return json({ error: error.code }, 404);
  }
  if (error.code === "not_responsible") return json({ error: error.code }, 403);
  return json({ error: error.code }, 400);
}

export async function GET(request: Request): Promise<Response> {
  const token = tokenSchema.safeParse(tokenFrom(request));
  if (!token.success) return json({ error: "invalid_token" }, 404);

  try {
    return json({ view: await getQuestionnaireView(token.data) }, 200);
  } catch (error) {
    if (error instanceof QuestionnaireError) return questionnaireErrorResponse(error);
    console.error("Could not read the questionnaire", error);
    return json({ error: "database_error" }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const token = tokenSchema.safeParse(tokenFrom(request));
  if (!token.success) return json({ error: "invalid_token" }, 404);

  const guard = await rateLimitGuard(
    "questionnaire:answer",
    token.data,
    RATE_LIMITS.questionnaire.limit,
    RATE_LIMITS.questionnaire.windowMs,
  );
  if (guard.denied !== null) return guard.denied;

  function withLimits(response: Response): Response {
    return withRateLimitHeaders(response, guard.result, RATE_LIMITS.questionnaire.limit);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withLimits(json({ error: "invalid_json" }, 400));
  }

  const parsed = questionnaireAnswerSchema.safeParse(body);
  if (!parsed.success) return withLimits(json({ error: "invalid_input" }, 400));

  try {
    const holder = await resolveQuestionnaireToken(token.data);
    await answerQuestion(token.data, parsed.data);

    await recordAudit({
      actorType: "recipient",
      actorId: holder?.personId ?? null,
      action: "questionnaire.answer",
      targetType: "questionnaire",
      targetId: holder?.questionnaireId ?? null,
      metadata: { questionId: parsed.data.questionId },
    });

    return withLimits(json({ ok: true }, 200));
  } catch (error) {
    if (error instanceof QuestionnaireError) return withLimits(questionnaireErrorResponse(error));
    console.error("Could not save the answer", error);
    return withLimits(json({ error: "database_error" }, 500));
  }
}
