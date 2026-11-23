/*
 Typed calls to the email endpoints.

 Like the other *-api modules, this only describes the HTTP API: no React.
*/

import { apiFetch } from "./api.js";
import type { Language } from "../i18n/index.js";
import type { MailAttachment, MailConfig, MailSendSummary } from "./types.js";

export type SendEmailsInput = {
  electionId: number;
  language: Language;
  subject: string | null;
  message: string | null;
  attachments: MailAttachment[];
  /** Empty for a test email. */
  personIds: number[];
  test: boolean;
};

/** GET /api/emails/config: whether Resend is configured and the sender address. */
export function fetchMailConfig(signal?: AbortSignal): Promise<MailConfig> {
  return apiFetch<MailConfig>("/api/emails/config", { signal });
}

/** POST /api/emails/send: one chunk of recipients (or a single test email). */
export function sendEmailsRequest(input: SendEmailsInput): Promise<MailSendSummary> {
  return apiFetch<MailSendSummary>("/api/emails/send", {
    method: "POST",
    body: input,
  });
}
