/*
Types shared by the server (api/) and the browser (src/).
This module must never import Node.js built-ins or server-only files: both tsconfig.server.json and tsconfig.app.json compile it.
*/

/* Role of a logged-in user. Today only admins can log in. */
export type Role = "admin";

/* User shape returned by the API. It never contains the password hash. */
export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

/* Status stored in election.status. */
export type ElectionStatus = "draft" | "open" | "closed";

/* Election as returned by the API. Dates are ISO 8601 strings or null. */
export type Election = {
  id: number;
  title: string;
  status: ElectionStatus;
  opensAt: string | null;
  closesAt: string | null;
};

/* Body accepted by POST /api/elections. Dates are ISO strings or null. */
export type ElectionInput = {
  title: string;
  opensAt: string | null;
  closesAt: string | null;
};

/* Person inside an election roster, with the weight used in that election. */
export type Voter = {
  personId: number;
  email: string;
  name: string;
  birthdate: string | null;
  gender: string | null;
  weight: number;
};

/* Result of a CSV import. */
export type VoterImportSummary = {
  imported: number;
  total: number;
};

/* One file attached to an email; `data` is standard base64 without the prefix. */
export type MailAttachment = {
  name: string;
  contentType: string;
  data: string;
};

/* Whether the server can really send emails with the current environment. */
export type MailConfig = {
  configured: boolean;
  from: string | null;
  dryRun: boolean;
};

/* Per-recipient result of a send. `personId` is null for the test email. */
export type MailRecipientResult = {
  personId: number | null;
  email: string;
  status: "sent" | "failed";
  /** Machine-readable failure code, null when the email was sent. */
  code: string | null;
};

/* Aggregate returned by the send endpoint for one chunk of recipients. */
export type MailSendSummary = {
  sent: number;
  failed: number;
  dryRun: boolean;
  results: MailRecipientResult[];
};

/* One selectable answer of a motion (free text defined by the admin). */
export type MotionOption = {
  id: number;
  label: string;
  position: number;
};

/* A question to vote on, with its own list of options. */
export type Motion = {
  id: number;
  title: string;
  position: number;
  options: MotionOption[];
};

/* Status of a voting window, enforced by the API on every vote. */
export type VoteWindow = "draft" | "upcoming" | "open" | "closed";

/* Everything a voter needs to fill in the ballot; no admin session required. */
export type Ballot = {
  election: {
    id: number;
    title: string;
    window: VoteWindow;
    opensAt: string | null;
    closesAt: string | null;
  };
  voterName: string;
  motions: Motion[];
  /** Only present after voting: what this token recorded. */
  receipt: VoteReceipt | null;
};

/* A single choice in the ballot submitted by the voter. */
export type VoteChoice = {
  motionId: number;
  optionId: number;
};

/* Confirmation returned after a successful vote. */
export type VoteReceipt = {
  castAt: string;
  weight: number;
  answers: Array<{
    motionTitle: string;
    optionLabel: string;
    weight: number;
  }>;
};

/* Weighted totals of one option. `weight` uses the weight at cast time. */
export type ResultOption = {
  label: string;
  votes: number;
  weight: number;
};

/* Weighted totals of one motion. */
export type MotionResult = {
  motionId: number;
  title: string;
  position: number;
  options: ResultOption[];
  totalVotes: number;
  totalWeight: number;
};

/* Participation and per-motion tallies shown in the admin portal. */
export type ElectionResults = {
  election: {
    id: number;
    title: string;
    status: Election["status"];
  };
  turnout: {
    voters: number;
    voted: number;
    weightTotal: number;
    weightCast: number;
  };
  results: MotionResult[];
};