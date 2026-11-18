/*
 Typed calls to the ballot editor endpoints.
*/

import { apiFetch } from "./api";
import type { Election, Motion } from "./types";

export type BallotDefinition = {
  election: Election;
  motions: Motion[];
  locked: boolean;
};

/** GET /api/elections/motions?electionId=… */
export function fetchMotions(electionId: number, signal?: AbortSignal): Promise<BallotDefinition> {
  return apiFetch<BallotDefinition>(`/api/elections/motions?electionId=${electionId}`, { signal });
}

/** POST /api/elections/motions: replaces the whole ballot. */
export function saveMotionsRequest(
  electionId: number,
  motions: Array<{ title: string; options: string[] }>,
): Promise<{ motions: Motion[] }> {
  return apiFetch<{ motions: Motion[] }>("/api/elections/motions", {
    method: "POST",
    body: { electionId, motions },
  });
}

/** POST /api/elections/status: publish or close the election. */
export function setElectionStatusRequest(
  electionId: number,
  status: "open" | "closed",
): Promise<{ election: Election }> {
  return apiFetch<{ election: Election }>("/api/elections/status", {
    method: "POST",
    body: { electionId, status },
  });
}
