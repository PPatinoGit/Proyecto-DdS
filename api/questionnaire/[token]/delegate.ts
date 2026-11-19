/*
  POST /api/questionnaire/<token>/delegate

  Moves one or more questions from the token holder to another person, with a
  single owner per question guaranteed by the assignment primary key. Returns
  the delegate's link token so the UI can display it.

  The caller's token is the rate-limit key; it is never stored. The new
  delegate's token also stays out of the audit metadata.
*/

import { z } from "zod";
import {
  delegateQuestions,
  QuestionnaireError,
} from "../../../src/lib/questionnaires";
import { resolveQuestionnaireToken } from "../../../src/lib/questionnaire-tokens";
import { recordAudit } from "../../../src/lib/audit";
import {
  RATE_LIMITS,
  rateLimitGuard,
  withRateLimitHeaders,
} from "../../../src/lib/rate-limit";
import { questionnaireDelegationSchema } from "../../../src/lib/validation";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/);

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** The questionnaire token is the second-to-last path segment. */
function tokenFrom(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const raw = parts.at(-2);
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

export async function POST(request: Request): Promise<Response> {
  const token = tokenSchema.safeParse(tokenFrom(request));
  if (!token.success) return json({ error: "invalid_token" }, 404);

  const guard = await rateLimitGuard(
    "questionnaire:delegate",
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

  const parsed = questionnaireDelegationSchema.safeParse(body);
  if (!parsed.success) return withLimits(json({ error: "invalid_input" }, 400));

  try {
    const holder = await resolveQuestionnaireToken(token.data);
    const delegateToken = await delegateQuestions(token.data, parsed.data);

    await recordAudit({
      actorType: "recipient",
      actorId: holder?.personId ?? null,
      action: "questionnaire.delegate",
      targetType: "questionnaire",
      targetId: holder?.questionnaireId ?? null,
      metadata: { questionCount: parsed.data.questionIds.length },
    });

    return withLimits(json({ delegateToken }, 200));
  } catch (error) {
    if (error instanceof QuestionnaireError) return withLimits(questionnaireErrorResponse(error));
    console.error("Could not delegate questions", error);
    return withLimits(json({ error: "database_error" }, 500));
  }
}
