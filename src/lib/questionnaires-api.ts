/*
  Typed calls to the admin questionnaire endpoints.
*/

import { apiFetch } from "./api";
import type {
  OrganizationPerson,
  Questionnaire,
  QuestionnaireDetail,
  QuestionnaireInput,
} from "./types";

export type QuestionnaireListResponse = {
  questionnaires: Questionnaire[];
  people: OrganizationPerson[];
};
export type QuestionnaireCreateResponse = {
  questionnaireId: number;
  ownerToken: string;
};

/** GET /api/questionnaires */
export function fetchQuestionnaires(signal?: AbortSignal): Promise<QuestionnaireListResponse> {
  return apiFetch<QuestionnaireListResponse>("/api/questionnaires", { signal });
}

/** GET /api/questionnaires/<id> */
export function fetchQuestionnaireDetail(
  questionnaireId: number,
  signal?: AbortSignal,
): Promise<QuestionnaireDetail> {
  return apiFetch<QuestionnaireDetail>(`/api/questionnaires/${questionnaireId}`, { signal });
}

/** POST /api/questionnaires: creates the questionnaire and its owner link. */
export function createQuestionnaireRequest(
  input: QuestionnaireInput,
): Promise<QuestionnaireCreateResponse> {
  return apiFetch<QuestionnaireCreateResponse>("/api/questionnaires", {
    method: "POST",
    body: input,
  });
}
