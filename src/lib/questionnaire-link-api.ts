/*
  Typed calls to the recipient questionnaire endpoints. The token in the URL is
  the only credential; no admin session cookie is involved.
*/

import { apiFetch } from "./api";
import type {
  QuestionnaireAnswerInput,
  QuestionnaireDelegationInput,
  QuestionnaireView,
} from "./types";

export type QuestionnaireViewResponse = { view: QuestionnaireView };

/** GET /api/questionnaire/<token> */
export function fetchQuestionnaireView(
  token: string,
  signal?: AbortSignal,
): Promise<QuestionnaireViewResponse> {
  return apiFetch<QuestionnaireViewResponse>(
    `/api/questionnaire/${encodeURIComponent(token)}`,
    { signal },
  );
}

/** POST /api/questionnaire/<token>: answer one of my questions. */
export function answerQuestionRequest(
  token: string,
  input: QuestionnaireAnswerInput,
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/questionnaire/${encodeURIComponent(token)}`, {
    method: "POST",
    body: input,
  });
}

/** POST /api/questionnaire/<token>/delegate: move questions to another person. */
export function delegateQuestionsRequest(
  token: string,
  input: QuestionnaireDelegationInput,
): Promise<{ delegateToken: string }> {
  return apiFetch<{ delegateToken: string }>(
    `/api/questionnaire/${encodeURIComponent(token)}/delegate`,
    { method: "POST", body: input },
  );
}
