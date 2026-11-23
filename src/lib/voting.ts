/*
 Shared voting rules (server side only).

 Keeping the window logic here means the ballot page, the vote endpoint and
 the admin results all agree on what "open" means.
*/

import type { Election, VoteWindow } from "./types.js";

/** Machine-readable failures returned by the voting API. */
export class VotingError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "VotingError";
    this.code = code;
  }
}

/*
 `draft` is the initial state, `closed` is final and `open` is further limited
 by the optional dates. An expired window is reported as closed even if nobody
 pressed the Close button.
*/
export function windowFor(election: Election, now: Date = new Date()): VoteWindow {
  if (election.status === "draft") return "draft";
  if (election.status === "closed") return "closed";

  const opens = election.opensAt === null ? null : Date.parse(election.opensAt);
  const closes = election.closesAt === null ? null : Date.parse(election.closesAt);

  if (opens !== null && Number.isFinite(opens) && now.getTime() < opens) return "upcoming";
  if (closes !== null && Number.isFinite(closes) && now.getTime() >= closes) return "closed";
  return "open";
}

/** Only a live window accepts new votes. */
export function isVoteWindowOpen(election: Election, now: Date = new Date()): boolean {
  return windowFor(election, now) === "open";
}
