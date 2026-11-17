/*
 Email delivery through Resend (HTTP API).

 No SDK: one POST is all we need, and it keeps the serverless bundle small.
 When RESEND_API_KEY or MAIL_FROM is missing the module enters dry-run mode:
 it logs the recipient and reports success, so the whole flow can be tested
 (and demoed) without an account. The response tells the UI it was simulated.
*/

import type { MailConfig } from "./types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 15_000;

export type OutgoingAttachment = {
  name: string;
  /** Standard base64, without the data: prefix. */
  data: string;
};

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments: OutgoingAttachment[];
};

/** Failure raised by sendMail; `code` is what the API returns per recipient. */
export class MailSendError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "MailSendError";
    this.code = code;
  }
}

/** True only when both Resend credentials and a sender address exist. */
export function getMailConfig(): MailConfig {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const from = process.env.MAIL_FROM?.trim() ?? "";
  const configured = apiKey !== "" && from !== "";

  return {
    configured,
    from: from === "" ? null : from,
    dryRun: !configured,
  };
}

/**
 Sends one email. Throws MailSendError with a stable code on failure.
 In dry-run mode nothing leaves the process.
*/
export async function sendMail(mail: OutgoingMail): Promise<void> {
  const config = getMailConfig();

  if (!config.configured) {
    /* Never log the body: it contains the voter's secret link. */
    console.info(`[mail] dry run → ${mail.to} · ${mail.subject}`);
    return;
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY?.trim()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachments: mail.attachments.map((attachment) => ({
          filename: attachment.name,
          content: attachment.data,
        })),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new MailSendError("timeout");
    }
    throw new MailSendError("network_error");
  }

  if (response.status === 429) throw new MailSendError("rate_limited");

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`Resend rejected the email (${response.status}): ${detail.slice(0, 300)}`);
    throw new MailSendError("provider_error");
  }
}
