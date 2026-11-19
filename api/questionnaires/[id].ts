/*
  GET /api/questionnaires/<id>  admin detail: questions, progress, link, history

  The id is the last path segment. There is no POST here: questionnaires are
  created once and then changed only through recipient answers and delegations.
*/

import { z } from "zod";
import { getQuestionnaireDetail, QuestionnaireError } from "../../src/lib/questionnaires";
import { readSessionUser } from "../../src/lib/session";

const idSchema = z.coerce.number().int().positive();

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** The last path segment of /api/questionnaires/<id>. */
function idFrom(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts.at(-1) ?? null;
}

export async function GET(request: Request): Promise<Response> {
  if (readSessionUser(request) === null) return json({ error: "unauthenticated" }, 401);

  const raw = idFrom(request);
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_input" }, 400);

  try {
    const detail = await getQuestionnaireDetail(parsed.data);
    return json(detail, 200);
  } catch (error) {
    if (error instanceof QuestionnaireError) {
      const status = error.code === "questionnaire_not_found" ? 404 : 400;
      return json({ error: error.code }, status);
    }
    console.error("Could not load questionnaire detail", error);
    return json({ error: "database_error" }, 500);
  }
}
