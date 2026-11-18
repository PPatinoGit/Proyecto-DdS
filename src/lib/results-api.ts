/*
 Typed call to the (admin-only) weighted results endpoint.
*/

import { apiFetch } from "./api";
import type { ElectionResults } from "./types";

/** GET /api/elections/results?electionId=… */
export function fetchResults(electionId: number, signal?: AbortSignal): Promise<ElectionResults> {
  return apiFetch<ElectionResults>(`/api/elections/results?electionId=${electionId}`, { signal });
}
