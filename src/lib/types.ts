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