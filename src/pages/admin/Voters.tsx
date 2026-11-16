/*
 Voters page.

 Lets the admin pick an election, preview a voter CSV with the same parser the
 API uses, and import it into that election's roster. All texts come from the
 dictionaries; the router query (?election=1) preselects an election.
*/

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../i18n/i18n-context";
import type { TranslateValues, TranslationKey } from "../../i18n";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { fetchElections } from "../../lib/elections-api";
import { fetchVoters, importVotersRequest } from "../../lib/voters-api";
import {
  CSV_TEMPLATE,
  MAX_CSV_CHARS,
  parseVoterCsv,
  type CsvColumn,
  type CsvFatal,
  type CsvIssue,
  type VoterCsvResult,
} from "../../lib/csv";
import type { Election, Voter, VoterImportSummary } from "../../lib/types";
import "./Voters.css";

type PageError = { key: TranslationKey; values?: TranslateValues };

const PREVIEW_ROWS = 20;
const LISTED_ISSUES = 50;

const COLUMN_KEYS: Record<CsvColumn, TranslationKey> = {
  email: "admin.voters.column.email",
  name: "admin.voters.column.name",
  birthdate: "admin.voters.column.birthdate",
  gender: "admin.voters.column.gender",
  weight: "admin.voters.column.weight",
};

const FATAL_KEYS: Record<CsvFatal["code"], TranslationKey> = {
  empty_file: "admin.voters.csv.errors.emptyFile",
  no_rows: "admin.voters.csv.errors.noRows",
  missing_header: "admin.voters.csv.errors.missingHeader",
  unclosed_quote: "admin.voters.csv.errors.unclosedQuote",
  too_many_rows: "admin.voters.csv.errors.tooManyRows",
  file_too_large: "admin.voters.csv.errors.fileTooLarge",
};

const ISSUE_KEYS: Record<CsvIssue["code"], TranslationKey> = {
  required: "admin.voters.csv.errors.required",
  too_long: "admin.voters.csv.errors.tooLong",
  invalid_email: "admin.voters.csv.errors.invalidEmail",
  duplicate_email: "admin.voters.csv.errors.duplicateEmail",
  invalid_birthdate: "admin.voters.csv.errors.invalidBirthdate",
  birthdate_future: "admin.voters.csv.errors.birthdateFuture",
  invalid_weight: "admin.voters.csv.errors.invalidWeight",
  weight_range: "admin.voters.csv.errors.weightRange",
};

/* Keeps the current selection if it still exists, otherwise the URL/first one. */
function pickElectionId(current: string, list: Election[], preferred: string): string {
  if (list.some((election) => String(election.id) === current)) return current;
  if (preferred !== "" && list.some((election) => String(election.id) === preferred)) {
    return preferred;
  }
  return list[0] === undefined ? "" : String(list[0].id);
}

export function Voters() {
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

  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [parsed, setParsed] = useState<VoterCsvResult | null>(null);
  const [fileError, setFileError] = useState<PageError | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<PageError | null>(null);
  const [summary, setSummary] = useState<VoterImportSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const weightFormatter = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const birthdateFormatter = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  useEffect(() => {
    document.title = t("admin.voters.heading");
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
        setElectionsError(describeError(error, "admin.voters.errors.loadElections"));
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
        setRosterError(describeError(error, "admin.voters.errors.loadRoster"));
      });

    return () => controller.abort();
  }, [selectedId, rosterReload, logout]);

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
    setSummary(null);
    clearFile();
  }

  function clearFile() {
    setFileName(null);
    setCsvText(null);
    setParsed(null);
    setFileError(null);
    setImportError(null);
    if (fileInput.current !== null) fileInput.current.value = "";
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setSummary(null);
    setFileName(null);
    setCsvText(null);
    setParsed(null);
    setFileError(null);
    setImportError(null);
    if (file === undefined) return;

    setFileName(file.name);

    if (file.size > MAX_CSV_CHARS) {
      setFileError(fatalError({ code: "file_too_large", max: MAX_CSV_CHARS }));
      return;
    }

    try {
      const text = await file.text();
      const result = parseVoterCsv(text);
      setParsed(result);
      setCsvText(result.fatal === null ? text : null);
    } catch {
      setFileError({ key: "admin.voters.errors.fileRead" });
    }
  }

  async function handleImport() {
    if (importing || selectedId === "" || csvText === null || parsed === null) return;
    if (parsed.fatal !== null || parsed.issues.length > 0) return;

    setImporting(true);
    setImportError(null);
    setSummary(null);

    try {
      const data = await importVotersRequest(Number(selectedId), csvText);
      setSummary(data.summary);
      clearFile();
      setRoster(null);
      setRosterError(null);
      setRosterReload((value) => value + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        return;
      }
      setImportError(describeError(error, "admin.voters.errors.invalidCsv"));
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "voters-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function fatalError(fatal: CsvFatal): PageError {
    const values: TranslateValues = {};
    if (fatal.column !== undefined) values.column = t(COLUMN_KEYS[fatal.column]);
    if (fatal.max !== undefined) values.max = fatal.max;
    return { key: FATAL_KEYS[fatal.code], values };
  }

  function issueError(issue: CsvIssue): PageError {
    const values: TranslateValues = { field: t(COLUMN_KEYS[issue.field]) };
    if (issue.max !== undefined) values.max = issue.max;
    if (issue.min !== undefined) values.min = issue.min;
    return { key: ISSUE_KEYS[issue.code], values };
  }

  const canImport =
    !importing &&
    selectedId !== "" &&
    csvText !== null &&
    parsed !== null &&
    parsed.fatal === null &&
    parsed.issues.length === 0;
  const issueLines = new Set(parsed?.issues.map((issue) => issue.line) ?? []);
  const previewRows = parsed?.rows.slice(0, PREVIEW_ROWS) ?? [];

  function formatBirthdate(value: string | null): string {
    if (value === null) return "—";
    return birthdateFormatter.format(new Date(`${value}T00:00:00Z`));
  }

  return (
    <main className="voters">
      <div className="voters__content">
        <header className="voters__header">
          <div className="voters__topbar">
            <Link className="voters__back" to="/admin">
              <span aria-hidden="true">←</span> {t("admin.backToPanel")}
            </Link>
            <LanguageSwitcher />
          </div>
          <h1 className="voters__title">{t("admin.voters.heading")}</h1>
        </header>

        {electionsError !== null && (
          <div className="voters__panel voters__error" role="alert">
            <p>{t(electionsError.key, electionsError.values)}</p>
            <button type="button" className="voters__retry" onClick={retryElections}>
              {t("admin.voters.retry")}
            </button>
          </div>
        )}

        {elections === null && electionsError === null && (
          <p className="voters__hint">{t("common.loading")}</p>
        )}

        {elections !== null && elections.length === 0 && (
          <div className="voters__panel">
            <p className="voters__hint">{t("admin.voters.noElections")}</p>
            <Link className="voters__link-button" to="/admin/elections">
              {t("admin.voters.goToElections")}
            </Link>
          </div>
        )}

        {elections !== null && elections.length > 0 && (
          <>
            <section className="voters__panel">
              <label className="voters__field">
                <span>{t("admin.voters.electionLabel")}</span>
                <select
                  value={selectedId}
                  onChange={(event) => changeElection(event.target.value)}
                  disabled={importing}
                >
                  <option value="">{t("admin.voters.selectElection")}</option>
                  {elections.map((election) => (
                    <option key={election.id} value={String(election.id)}>
                      {election.title}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="voters__panel" aria-busy={importing}>
              <h2 className="voters__panel-title">{t("admin.voters.importTitle")}</h2>
              <p className="voters__hint">{t("admin.voters.csvHint")}</p>

              <div className="voters__file-row">
                <label className="voters__file-button">
                  {t("admin.voters.chooseFile")}
                  <input
                    ref={fileInput}
                    className="voters__file-input"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFile}
                    disabled={importing}
                  />
                </label>

                <button type="button" className="voters__secondary" onClick={downloadTemplate}>
                  {t("admin.voters.template")}
                </button>

                {fileName !== null && (
                  <span className="voters__file-name">
                    {t("admin.voters.selectedFile", { name: fileName })}
                  </span>
                )}
              </div>

              {fileError !== null && (
                <p className="voters__message voters__message--error" role="alert">
                  {t(fileError.key, fileError.values)}
                </p>
              )}

              {importError !== null && (
                <p className="voters__message voters__message--error" role="alert">
                  {t(importError.key, importError.values)}
                </p>
              )}

              {summary !== null && (
                <p className="voters__message voters__message--ok" role="status">
                  {t("admin.voters.imported", { count: summary.imported, total: summary.total })}
                </p>
              )}

              {parsed !== null && parsed.fatal !== null && (
                <p className="voters__message voters__message--error" role="alert">
                  {t(fatalError(parsed.fatal).key, fatalError(parsed.fatal).values)}
                </p>
              )}

              {parsed !== null && parsed.fatal === null && (
                <div className="voters__preview">
                  <h3 className="voters__subtitle">{t("admin.voters.previewTitle")}</h3>
                  <p className="voters__hint">
                    {t("admin.voters.previewSummary", {
                      rows: parsed.totalRows,
                      errors: parsed.issues.length,
                    })}
                  </p>

                  {previewRows.length > 0 && (
                    <div className="voters__table-wrap">
                      <table className="voters__table">
                        <thead>
                          <tr>
                            <th scope="col">#</th>
                            <th scope="col">{t("admin.voters.column.email")}</th>
                            <th scope="col">{t("admin.voters.column.name")}</th>
                            <th scope="col">{t("admin.voters.column.birthdate")}</th>
                            <th scope="col">{t("admin.voters.column.gender")}</th>
                            <th scope="col">{t("admin.voters.column.weight")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row) => (
                            <tr
                              key={row.line}
                              className={issueLines.has(row.line) ? "voters__row--invalid" : undefined}
                            >
                              <td>{row.line}</td>
                              <td>{row.email === "" ? "—" : row.email}</td>
                              <td>{row.name === "" ? "—" : row.name}</td>
                              <td>{row.birthdate ?? "—"}</td>
                              <td>{row.gender ?? "—"}</td>
                              <td>{weightFormatter.format(row.weight)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {parsed.totalRows > PREVIEW_ROWS && (
                    <p className="voters__hint">
                      {t("admin.voters.previewMore", {
                        shown: PREVIEW_ROWS,
                        total: parsed.totalRows,
                      })}
                    </p>
                  )}

                  {parsed.issues.length === 0 ? (
                    <p className="voters__message voters__message--ok">
                      {t("admin.voters.previewValid")}
                    </p>
                  ) : (
                    <>
                      <ul className="voters__issues">
                        {parsed.issues.slice(0, LISTED_ISSUES).map((issue, index) => (
                          <li key={`${issue.line}-${issue.field}-${index}`}>
                            <strong>{t("admin.voters.line", { line: issue.line })}</strong>{" "}
                            {t(issueError(issue).key, issueError(issue).values)}
                          </li>
                        ))}
                      </ul>
                      {parsed.issues.length > LISTED_ISSUES && (
                        <p className="voters__hint">
                          {t("admin.voters.issueMore", {
                            count: parsed.issues.length - LISTED_ISSUES,
                          })}
                        </p>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    className="voters__submit"
                    onClick={handleImport}
                    disabled={!canImport}
                  >
                    {importing ? t("admin.voters.importing") : t("admin.voters.import")}
                  </button>
                </div>
              )}
            </section>

            <section className="voters__panel">
              <h2 className="voters__panel-title">
                {t("admin.voters.rosterTitle")}
                {roster !== null && (
                  <span className="voters__count">
                    {t("admin.voters.rosterCount", { count: roster.length })}
                  </span>
                )}
              </h2>

              {rosterError !== null && (
                <div className="voters__message voters__message--error" role="alert">
                  <p>{t(rosterError.key, rosterError.values)}</p>
                  <button type="button" className="voters__retry" onClick={retryRoster}>
                    {t("admin.voters.retry")}
                  </button>
                </div>
              )}

              {selectedId === "" && <p className="voters__hint">{t("admin.voters.notSelected")}</p>}

              {selectedId !== "" && roster === null && rosterError === null && (
                <p className="voters__hint">{t("common.loading")}</p>
              )}

              {roster !== null && roster.length === 0 && (
                <p className="voters__hint">{t("admin.voters.rosterEmpty")}</p>
              )}

              {roster !== null && roster.length > 0 && (
                <div className="voters__table-wrap">
                  <table className="voters__table">
                    <thead>
                      <tr>
                        <th scope="col">{t("admin.voters.column.name")}</th>
                        <th scope="col">{t("admin.voters.column.email")}</th>
                        <th scope="col">{t("admin.voters.column.birthdate")}</th>
                        <th scope="col">{t("admin.voters.column.gender")}</th>
                        <th scope="col">{t("admin.voters.column.weight")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((voter) => (
                        <tr key={voter.personId}>
                          <td>{voter.name}</td>
                          <td>{voter.email}</td>
                          <td>{formatBirthdate(voter.birthdate)}</td>
                          <td>{voter.gender ?? "—"}</td>
                          <td>{weightFormatter.format(voter.weight)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/* Maps an API error to a translation key. 401 is handled by the caller. */
function describeError(error: unknown, fallback: TranslationKey): PageError {
  if (!(error instanceof ApiError)) {
    return { key: "admin.voters.errors.unexpected" };
  }

  switch (error.code) {
    case "network_error":
      return { key: "admin.voters.errors.network" };
    case "invalid_input":
      return { key: "admin.voters.errors.invalidInput" };
    case "election_not_found":
      return { key: "admin.voters.errors.notFound" };
    case "invalid_csv":
      return { key: "admin.voters.errors.invalidCsv" };
    case "database_error":
      return { key: "admin.voters.errors.server" };
    default:
      break;
  }

  if (error.status >= 500) return { key: "admin.voters.errors.server" };
  return { key: fallback };
}
