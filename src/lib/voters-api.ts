/*
 Typed calls to the voter roster endpoints.

 Like the other *-api modules, this only describes the HTTP API: no React.
*/

import { apiFetch } from "./api.js";
import type { Voter, VoterImportSummary } from "./types.js";

export type VotersResponse = {
  election: { id: number; title: string };
  voters: Voter[];
};

/** GET /api/elections/voters?electionId=1: 404 when the election does not exist. */
export function fetchVoters(electionId: number, signal?: AbortSignal): Promise<VotersResponse> {
  return apiFetch<VotersResponse>(`/api/elections/voters?electionId=${electionId}`, { signal });
}

/** POST /api/elections/voters: 400 invalid_csv with the row issues. */
export function importVotersRequest(
  electionId: number,
  csv: string,
): Promise<{ summary: VoterImportSummary }> {
  return apiFetch<{ summary: VoterImportSummary }>("/api/elections/voters", {
    method: "POST",
    body: { electionId, csv },
  });
}
