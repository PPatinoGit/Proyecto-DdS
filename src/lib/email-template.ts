/*
 Builds the subject, plain text and HTML of one personalized email.

 Pure TypeScript on purpose: it only depends on the dictionaries and on the
 gender helper, so it is easy to test without a database or a mail provider.
 The caller injects the vote URL because the token lives on the server.
*/

import { translate, type Language, type TranslationKey } from "../i18n";
import { salutationFor, type Salutation } from "./gender";

export type EmailRecipient = {
  name: string;
  gender: string | null;
};

export type EmailBuildInput = {
  language: Language;
  electionTitle: string;
  recipient: EmailRecipient;
  /** Absolute URL built from the ballot token. Null for a test email. */
  voteUrl: string | null;
  /** Admin override; null or blank falls back to the translated default. */
  subject: string | null;
  message: string | null;
  /** Test emails get a translated prefix in the subject. */
  test: boolean;
};

export type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

const SALUTATION_KEYS: Record<Salutation, TranslationKey> = {
  female: "email.greeting.female",
  male: "email.greeting.male",
  neutral: "email.greeting.neutral",
};

/* Replaces {name} / {title} in admin-written text, leaving unknown keys visible. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    key in values ? values[key] : placeholder,
  );
}

/* Escapes everything inserted into the HTML: names and messages are user data. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Newlines in the admin message become real paragraphs in the HTML version. */
function toHtmlParagraphs(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

export function buildEmail(input: EmailBuildInput): EmailContent {
  const { language, electionTitle: title, recipient } = input;
  const name = recipient.name;

  const salutation = translate(language, SALUTATION_KEYS[salutationFor(recipient.gender)], {
    name,
  });

  const rawSubject = input.subject?.trim() ?? "";
  const subjectBase =
    rawSubject === ""
      ? translate(language, "email.subject", { title })
      : fill(rawSubject, { name, title });

  const rawMessage = input.message?.trim() ?? "";
  const message =
    rawMessage === ""
      ? translate(language, "email.body", { title })
      : fill(rawMessage, { name, title });

  const cta = translate(language, "email.cta");
  const linkFallback = translate(language, "email.linkFallback");
  const footer = translate(language, "email.footer");
  const testPrefix = input.test ? translate(language, "email.testPrefix") : "";
  const testNote = input.test ? translate(language, "email.testNote") : "";

  const subject = `${testPrefix}${subjectBase}`;
  const voteUrl = input.voteUrl;
  const safeUrl = voteUrl === null ? null : escapeHtml(voteUrl);

  const textParts = [salutation, "", message, ""];
  if (voteUrl === null) {
    textParts.push(testNote, "");
  } else {
    textParts.push(`${cta}: ${voteUrl}`, "");
  }
  textParts.push(footer, "");
  const text = textParts.join("\n");

  const actionHtml =
    safeUrl === null
      ? `<p style="margin:0 0 20px;padding:12px 16px;border-radius:8px;background:#f7ece8;color:#9b2c12;font-size:14px;">${escapeHtml(testNote)}</p>`
      : `<p style="margin:0 0 20px;">
        <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#c43c1e;color:#fffdf8;font-size:16px;font-weight:bold;text-decoration:none;">${escapeHtml(cta)}</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b6560;">${escapeHtml(linkFallback)}</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${safeUrl}" style="color:#c43c1e;">${safeUrl}</a></p>`;

  const html = `<!doctype html>
<html lang="${language}">
  <body style="margin:0;padding:24px;background:#f3efe6;font-family:Arial,Helvetica,sans-serif;color:#2a2622;">
    <div style="max-width:560px;margin:0 auto;padding:28px;background:#fffdf8;border-radius:12px;">
      <p style="margin:0 0 16px;font-size:16px;">${escapeHtml(salutation)}</p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.55;">${toHtmlParagraphs(message)}</p>
      ${actionHtml}
      <p style="margin:0;padding-top:16px;border-top:1px solid #d6d0c4;font-size:12px;color:#6b6560;">${escapeHtml(footer)}</p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}
