/*
  GET  /api/questionnaires          list all questionnaires (admin only)
  POST /api/questionnaires          create one with auto categories (admin only)

  A successful POST returns the owner's link token. The token is created inside
  the same transaction as the questionnaire, so a questionnaire that exists
  always has an owner link.
*/

import { readSessionUser } from "../../../src/lib/session";
import { recordAudit } from "../../../src/lib/audit";
import {
  createQuestionnaire,
  listOrganizationPeople,
  listQuestionnaires,
  QuestionnaireError,
} from "../../../src/lib/questionnaires";
import { questionnaireInputSchema } from "../../../src/lib/validation";

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Machine codes to HTTP statuses; unexpected codes are bad requests. */
function questionnaireErrorResponse(error: QuestionnaireError): Response {
  return json({ error: error.code }, 400);
}

export async function GET(request: Request): Promise<Response> {
  if (readSessionUser(request) === null) return json({ error: "unauthenticated" }, 401);

  try {
    const [questionnaires, people] = await Promise.all([
      listQuestionnaires(),
      listOrganizationPeople(),
    ]);
    return json({ questionnaires, people }, 200);
  } catch (error) {
    console.error("Could not list questionnaires", error);
    return json({ error: "database_error" }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const user = readSessionUser(request);
  if (user === null) return json({ error: "unauthenticated" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = questionnaireInputSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_input" }, 400);

  try {
    const result = await createQuestionnaire(parsed.data);
    await recordAudit({
      actorType: "admin",
      actorId: user.id,
      action: "questionnaire.create",
      targetType: "questionnaire",
      targetId: result.questionnaireId,
      metadata: { questionCount: parsed.data.questions.length },
    });
    return json(result, 201);
  } catch (error) {
    if (error instanceof QuestionnaireError) return questionnaireErrorResponse(error);
    console.error("Could not create questionnaire", error);
    return json({ error: "database_error" }, 500);
  }
}
