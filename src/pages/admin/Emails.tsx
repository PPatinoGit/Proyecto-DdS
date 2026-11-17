/*
 Emails page.

 Picks an election, composes a personalized message (subject and body are
 optional: the server falls back to translated defaults), attaches files and
 sends the unique voting link to every voter in the roster.

 Sending happens in chunks (EMAIL_CHUNK_SIZE) so each request stays short and
 the page can show real progress. A chunk that fails leaves the previous ones
 sent, and the summary keeps the per-recipient result.

 All texts come from the dictionaries; errors are mapped from API codes.
*/

import { useEffect, useState, type ChangeEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../i18n/i18n-context";
import {
  isLanguage,
  LANGUAGES,
  type Language,
  type TranslateValues,
  type TranslationKey,
} from "../../i18n";
import { LANGUAGE_LABELS } from "../../i18n/language-labels";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { fetchElections } from "../../lib/elections-api";
import { fetchVoters } from "../../lib/voters-api";
import { fetchMailConfig, sendEmailsRequest } from "../../lib/emails-api";
import {
  EMAIL_CHUNK_SIZE,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENTS_TOTAL_BYTES,
  MAX_ATTACHMENT_BYTES,
  MAX_EMAIL_MESSAGE,
  MAX_EMAIL_SUBJECT,
} from "../../lib/email-limits";
import type {
  Election,
  MailConfig,
  MailSendSummary,
  Voter,
} from "../../lib/types";
import "./Emails.css";

type PageError = { key: TranslationKey; values?: TranslateValues };

type AttachmentItem = {
  id: string;
  name: string;
  contentType: string;
  data: string;
  size: number;
};

type SendOutcome = { kind: "all" | "test"; data: MailSendSummary };

type SendingMode = "all" | "test" | null;

const FAILURE_KEYS: Record<string, TranslationKey> = {
  rate_limited: "admin.emails.failure.rateLimited",
  provider_error: "admin.emails.failure.providerError",
  network_error: "admin.emails.failure.network",
  timeout: "admin.emails.failure.timeout",
};

/* Keeps the current selection if it still exists, otherwise the URL/first one. */
function pickElectionId(current: string, list: Election[], preferred: string): string {
  if (list.some((election) => String(election.id) === current)) return current;
  if (preferred !== "" && list.some((election) => String(election.id) === preferred)) {
    return preferred;
  }
  return list[0] === undefined ? "" : String(list[0].id);
}

/** "1,5 MB" / "1.5 MB" / "1,5 МБ" depending on the UI language. */
function formatSize(bytes: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 2,
  }).format(bytes / 1_000_000);
}

/** Reads one file as base64 without the "data:...;base64," prefix. */
function readAttachment(file: File): Promise<AttachmentItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("not a data URL"));
        return;
      }
      const comma = result.indexOf(",");
      if (comma === -1) {
        reject(new Error("malformed data URL"));
        return;
      }
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        contentType: file.type === "" ? "application/octet-stream" : file.type,
        data: result.slice(comma + 1),
        size: file.size,
      });
    };

    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/* Maps an API error to a translation key. 401 is handled by the caller. */
function describeError(error: unknown, fallback: TranslationKey): PageError {
  if (!(error instanceof ApiError)) {
    return { key: "admin.emails.errors.unexpected" };
  }

  switch (error.code) {
    case "network_error":
      return { key: "admin.emails.errors.network" };
    case "invalid_input":
      return { key: "admin.emails.errors.invalidInput" };
    case "election_not_found":
      return { key: "admin.emails.errors.notFound" };
    case "invalid_recipients":
      return { key: "admin.emails.errors.invalidRecipients" };
    case "invalid_attachment":
      return { key: "admin.emails.errors.invalidAttachment" };
    case "no_recipients":
      return { key: "admin.emails.errors.noRecipients" };
    case "database_error":
      return { key: "admin.emails.errors.server" };
    default:
      break;
  }

  if (error.status >= 500) return { key: "admin.emails.errors.server" };
  return { key: fallback };
}

export function Emails() {
  const { logout } = useAuth();
  const { language, t } = useI18n();
  const [searchParams] = useSearchParams();
  const [initialElection] = useState(() => searchParams.get("election") ?? "");

  const [elections, setElections] = useState<Election[] | null>(null);
  const [electionsError, setElectionsError] = useState<PageError | null>(null);
  const [electionsReload, setElectionsReload] = useState(0);

  const [selectedId, setSelectedId] = useState(initialElection);
  const [roster, setRoster] = useState<Voter[] | null>(null);
  const [rosterError, setRosterError] = useState<PageError | null>(null);
  const [rosterReload, setRosterReload] = useState(0);

  const [mailConfig, setMailConfig] = useState<MailConfig | null>(null);

  /* null means "follow the language of the interface". */
  const [emailLanguage, setEmailLanguage] = useState<Language | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [fileError, setFileError] = useState<PageError | null>(null);

  const [sending, setSending] = useState<SendingMode>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sendError, setSendError] = useState<PageError | null>(null);
  const [summary, setSummary] = useState<SendOutcome | null>(null);

  const busy = sending !== null;
  const chosenLanguage = emailLanguage ?? language;
  const totalAttachmentSize = attachments.reduce((sum, item) => sum + item.size, 0);
  const recipientCount = roster?.length ?? 0;

  useEffect(() => {
    document.title = t("admin.emails.heading");
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();

    fetchElections(controller.signal)
      .then((data) => {
        setElections(data.elections);
        setElectionsError(null);
        setSelectedId((current) => pickElectionId(current, data.elections, initialElection));
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (error instanceof ApiError && error.status === 401) {
          void logout();
          return;
        }
        setElectionsError(describeError(error, "admin.emails.errors.loadElections"));
      });

    return () => controller.abort();
  }, [electionsReload, logout, initialElection]);

  useEffect(() => {
    if (selectedId === "") return;
    const electionId = Number(selectedId);
    if (!Number.isInteger(electionId) || electionId <= 0) return;

    const controller = new AbortController();

    fetchVoters(electionId, controller.signal)
      .then((data) => {
        setRoster(data.voters);
        setRosterError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (error instanceof ApiError && error.status === 401) {
          void logout();
          return;
        }
        setRoster(null);
        setRosterError(describeError(error, "admin.emails.errors.loadRoster"));
      });

    return () => controller.abort();
  }, [selectedId, rosterReload, logout]);

  useEffect(() => {
    const controller = new AbortController();

    fetchMailConfig(controller.signal)
      .then((data) => setMailConfig(data))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (error instanceof ApiError && error.status === 401) {
          void logout();
        }
      });

    return () => controller.abort();
  }, [logout]);

  function retryElections() {
    setElections(null);
    setElectionsError(null);
    setElectionsReload((value) => value + 1);
  }

  function retryRoster() {
    setRoster(null);
    setRosterError(null);
    setRosterReload((value) => value + 1);
  }

  function changeElection(value: string) {
    setSelectedId(value);
    setRoster(null);
    setRosterError(null);
    setSendError(null);
    setSummary(null);
    setFileError(null);
    setProgress(null);
  }

  function removeAttachment(id: string) {
    setAttachments((list) => list.filter((item) => item.id !== id));
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    /* Reset so choosing the same file again still fires onChange. */
    event.target.value = "";
    setFileError(null);
    setSummary(null);

    if (files.length === 0) return;

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setFileError({
        key: "admin.emails.errors.attachmentCount",
        values: { count: MAX_ATTACHMENTS },
      });
      return;
    }

    let total = totalAttachmentSize;
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setFileError({
          key: "admin.emails.errors.attachmentTooLarge",
          values: { max: formatSize(MAX_ATTACHMENT_BYTES, language) },
        });
        return;
      }
      total += file.size;
      if (total > MAX_ATTACHMENTS_TOTAL_BYTES) {
        setFileError({
          key: "admin.emails.errors.attachmentTotal",
          values: { max: formatSize(MAX_ATTACHMENTS_TOTAL_BYTES, language) },
        });
        return;
      }
    }

    try {
      const loaded = await Promise.all(files.map(readAttachment));
      setAttachments((list) => [...list, ...loaded]);
    } catch {
      setFileError({ key: "admin.emails.errors.fileRead" });
    }
  }

  function payload() {
    return {
      electionId: Number(selectedId),
      language: chosenLanguage,
      subject: subject.trim() === "" ? null : subject.trim(),
      message: message.trim() === "" ? null : message.trim(),
      attachments: attachments.map(({ name, contentType, data }) => ({
        name,
        contentType,
        data,
      })),
    };
  }

  async function handleSendAll() {
    if (busy || selectedId === "" || roster === null || roster.length === 0) return;

    const ids = roster.map((voter) => voter.personId);
    setSending("all");
    setSendError(null);
    setSummary(null);
    setProgress({ done: 0, total: ids.length });

    const aggregate: MailSendSummary = { sent: 0, failed: 0, dryRun: false, results: [] };

    try {
      for (let index = 0; index < ids.length; index += EMAIL_CHUNK_SIZE) {
        const chunk = ids.slice(index, index + EMAIL_CHUNK_SIZE);
        const data = await sendEmailsRequest({
          ...payload(),
          personIds: chunk,
          test: false,
        });

        aggregate.sent += data.sent;
        aggregate.failed += data.failed;
        aggregate.dryRun = data.dryRun;
        aggregate.results.push(...data.results);

        setSummary({ kind: "all", data: { ...aggregate, results: [...aggregate.results] } });
        setProgress({
          done: Math.min(index + chunk.length, ids.length),
          total: ids.length,
        });
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        return;
      }
      if (error instanceof ApiError && error.code === "attachment_too_large") {
        setSendError({
          key: "admin.emails.errors.attachmentTooLarge",
          values: { max: formatSize(MAX_ATTACHMENT_BYTES, language) },
        });
      } else if (error instanceof ApiError && error.code === "attachments_too_large") {
        setSendError({
          key: "admin.emails.errors.attachmentTotal",
          values: { max: formatSize(MAX_ATTACHMENTS_TOTAL_BYTES, language) },
        });
      } else {
        setSendError(describeError(error, "admin.emails.errors.unexpected"));
      }
    } finally {
      setSending(null);
      setProgress(null);
    }
  }

  async function handleSendTest() {
    if (busy || selectedId === "") return;

    setSending("test");
    setSendError(null);
    setSummary(null);

    try {
      const data = await sendEmailsRequest({ ...payload(), personIds: [], test: true });
      setSummary({ kind: "test", data });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        return;
      }
      setSendError(describeError(error, "admin.emails.errors.unexpected"));
    } finally {
      setSending(null);
    }
  }

  function failureReason(code: string | null): string {
    if (code === null) return t("admin.emails.failure.unknown");
    return t(FAILURE_KEYS[code] ?? "admin.emails.failure.unknown");
  }

  const failures =
    summary === null
      ? []
      : summary.data.results.filter((result) => result.status === "failed");
  const canSendAll = !busy && roster !== null && roster.length > 0;
  const canTest = !busy && selectedId !== "";

  return (
    <main className="emails">
      <div className="emails__content">
        <header className="emails__header">
          <div className="emails__topbar">
            <Link className="emails__back" to="/admin">
              <span aria-hidden="true">←</span> {t("admin.backToPanel")}
            </Link>
            <LanguageSwitcher />
          </div>
          <h1 className="emails__title">{t("admin.emails.heading")}</h1>
        </header>

        {mailConfig !== null && mailConfig.dryRun && (
          <div className="emails__banner" role="status">
            <strong>{t("admin.emails.dryRunTitle")}</strong>
            <span>{t("admin.emails.dryRunText")}</span>
          </div>
        )}

        {mailConfig !== null && mailConfig.configured && mailConfig.from !== null && (
          <p className="emails__hint">
            {t("admin.emails.configuredFrom", { from: mailConfig.from })}
          </p>
        )}

        {electionsError !== null && (
          <div className="emails__panel emails__message emails__message--error" role="alert">
            <p>{t(electionsError.key, electionsError.values)}</p>
            <button type="button" className="emails__retry" onClick={retryElections}>
              {t("admin.emails.retry")}
            </button>
          </div>
        )}

        {elections === null && electionsError === null && (
          <p className="emails__hint">{t("common.loading")}</p>
        )}

        {elections !== null && elections.length === 0 && (
          <div className="emails__panel">
            <p className="emails__hint">{t("admin.emails.noElections")}</p>
            <Link className="emails__link-button" to="/admin/elections">
              {t("admin.emails.goToElections")}
            </Link>
          </div>
        )}

        {elections !== null && elections.length > 0 && (
          <>
            <section className="emails__panel">
              <div className="emails__row">
                <label className="emails__field emails__field--grow">
                  <span>{t("admin.emails.electionLabel")}</span>
                  <select
                    value={selectedId}
                    onChange={(event) => changeElection(event.target.value)}
                    disabled={busy}
                  >
                    <option value="">{t("admin.emails.selectElection")}</option>
                    {elections.map((election) => (
                      <option key={election.id} value={String(election.id)}>
                        {election.title}
                      </option>
                    ))}
                  </select>
                </label>

                {roster !== null && (
                  <span className="emails__count">
                    {t("admin.emails.rosterCount", { count: roster.length })}
                  </span>
                )}
              </div>

              {rosterError !== null && (
                <div className="emails__message emails__message--error" role="alert">
                  <p>{t(rosterError.key, rosterError.values)}</p>
                  <button type="button" className="emails__retry" onClick={retryRoster}>
                    {t("admin.emails.retry")}
                  </button>
                </div>
              )}

              {selectedId !== "" && roster === null && rosterError === null && (
                <p className="emails__hint">{t("common.loading")}</p>
              )}

              {roster !== null && roster.length === 0 && (
                <>
                  <p className="emails__hint">{t("admin.emails.noVoters")}</p>
                  <Link
                    className="emails__link-button"
                    to={`/admin/voters?election=${selectedId}`}
                  >
                    {t("admin.emails.goToVoters")}
                  </Link>
                </>
              )}
            </section>

            {roster !== null && roster.length > 0 && (
              <>
                <section className="emails__panel">
                  <h2 className="emails__panel-title">{t("admin.emails.composeTitle")}</h2>

                  <div className="emails__row">
                    <label className="emails__field">
                      <span>{t("admin.emails.languageLabel")}</span>
                      <select
                        value={chosenLanguage}
                        onChange={(event) => {
                          if (isLanguage(event.target.value)) {
                            setEmailLanguage(event.target.value);
                          }
                        }}
                        disabled={busy}
                      >
                        {LANGUAGES.map((code) => (
                          <option key={code} value={code} lang={code}>
                            {LANGUAGE_LABELS[code]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="emails__field emails__field--grow">
                      <span>{t("admin.emails.subjectLabel")}</span>
                      <input
                        type="text"
                        value={subject}
                        onChange={(event) => setSubject(event.target.value)}
                        placeholder={t("admin.emails.subjectHint")}
                        maxLength={MAX_EMAIL_SUBJECT}
                        disabled={busy}
                      />
                    </label>
                  </div>

                  <label className="emails__field">
                    <span>{t("admin.emails.messageLabel")}</span>
                    <textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder={t("admin.emails.messageHint")}
                      rows={5}
                      maxLength={MAX_EMAIL_MESSAGE}
                      disabled={busy}
                    />
                  </label>

                  <p className="emails__hint">{t("admin.emails.greetingNote")}</p>

                  <h3 className="emails__subtitle">{t("admin.emails.attachmentsTitle")}</h3>
                  <p className="emails__hint">
                    {t("admin.emails.attachmentsHint", {
                      count: MAX_ATTACHMENTS,
                      each: formatSize(MAX_ATTACHMENT_BYTES, language),
                      total: formatSize(MAX_ATTACHMENTS_TOTAL_BYTES, language),
                    })}
                  </p>

                  <div className="emails__file-row">
                    <label className="emails__file-button">
                      {t("admin.emails.chooseFiles")}
                      <input
                        className="emails__file-input"
                        type="file"
                        multiple
                        onChange={handleFiles}
                        disabled={busy}
                      />
                    </label>

                    {attachments.length > 0 && (
                      <span className="emails__file-name">
                        {t("admin.emails.attachmentTotal", {
                          size: formatSize(totalAttachmentSize, language),
                        })}
                      </span>
                    )}
                  </div>

                  {fileError !== null && (
                    <p className="emails__message emails__message--error" role="alert">
                      {t(fileError.key, fileError.values)}
                    </p>
                  )}

                  {attachments.length > 0 && (
                    <ul className="emails__attachments">
                      {attachments.map((attachment) => (
                        <li key={attachment.id} className="emails__attachment">
                          <span className="emails__attachment-name">{attachment.name}</span>
                          <span className="emails__attachment-size">
                            {formatSize(attachment.size, language)}
                          </span>
                          <button
                            type="button"
                            className="emails__remove"
                            onClick={() => removeAttachment(attachment.id)}
                            disabled={busy}
                          >
                            {t("admin.emails.removeAttachment")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="emails__panel" aria-busy={busy}>
                  <h2 className="emails__panel-title">{t("admin.emails.sendTitle")}</h2>

                  <div className="emails__actions">
                    <button
                      type="button"
                      className="emails__submit"
                      onClick={handleSendAll}
                      disabled={!canSendAll}
                    >
                      {t("admin.emails.sendAll", { count: recipientCount })}
                    </button>

                    <button
                      type="button"
                      className="emails__secondary"
                      onClick={handleSendTest}
                      disabled={!canTest}
                    >
                      {t("admin.emails.sendTest")}
                    </button>
                  </div>

                  {progress !== null && (
                    <p className="emails__progress" role="status">
                      {t("admin.emails.sending", progress)}
                    </p>
                  )}

                  {sendError !== null && (
                    <p className="emails__message emails__message--error" role="alert">
                      {t(sendError.key, sendError.values)}
                    </p>
                  )}

                  {summary !== null && (
                    <p className="emails__message emails__message--ok" role="status">
                      {summary.kind === "test"
                        ? t("admin.emails.testSent", {
                            email: summary.data.results[0]?.email ?? "",
                          })
                        : t("admin.emails.sentSummary", {
                            sent: summary.data.sent,
                            failed: summary.data.failed,
                          })}
                      {summary.data.dryRun && (
                        <span className="emails__badge">
                          {t("admin.emails.dryRunTitle")}
                        </span>
                      )}
                    </p>
                  )}

                  {failures.length > 0 && (
                    <div className="emails__failures">
                      <h3 className="emails__subtitle">{t("admin.emails.failuresTitle")}</h3>
                      <ul>
                        {failures.slice(0, 20).map((failure) => (
                          <li key={failure.email}>
                            {failure.email}: {failureReason(failure.code)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
