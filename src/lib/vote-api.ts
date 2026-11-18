/*
 Typed calls to the public (token-authenticated) voting endpoints.

 No session cookie is needed: the token in the URL is the credential.
*/

import { apiFetch } from "./api";
import type { Ballot, VoteChoice, VoteReceipt } from "./types";

export function fetchBallot(token: string, signal?: AbortSignal): Promise<{ ballot: Ballot }> {
  return apiFetch<{ ballot: Ballot }>(`/api/vote/${encodeURIComponent(token)}`, { signal });
}

export function submitVoteRequest(
  token: string,
  votes: VoteChoice[],
): Promise<{ receipt: VoteReceipt }> {
  return apiFetch<{ receipt: VoteReceipt }>(`/api/vote/${encodeURIComponent(token)}`, {
    method: "POST",
    body: { votes },
  });
}
