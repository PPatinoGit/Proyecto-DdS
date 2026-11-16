/*
 Typed calls to the election endpoints.

 Like auth-api.ts, this module only describes the HTTP API: no React, no state.
*/

import { apiFetch } from "./api";
import type { Election, ElectionInput } from "./types";

/** GET /api/elections: 401 when there is no valid session. */
export function fetchElections(signal?: AbortSignal): Promise<{ elections: Election[] }> {
  return apiFetch<{ elections: Election[] }>("/api/elections", { signal });
}

/** POST /api/elections: 201 with the created draft, 400 when the body is invalid. */
export function createElectionRequest(input: ElectionInput): Promise<{ election: Election }> {
  return apiFetch<{ election: Election }>("/api/elections", {
    method: "POST",
    body: input,
  });
}
