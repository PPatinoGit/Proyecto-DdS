/*
 Weighted results page.

 Shows participation and, per motion, the number of votes and the sum of the
 weights recorded at cast time. Individual choices are never exposed here:
 results are aggregate numbers only.
*/

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../i18n/i18n-context";
import type { TranslateValues, TranslationKey } from "../../i18n";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { fetchElections } from "../../lib/elections-api";
import { fetchResults } from "../../lib/results-api";
import type { Election, ElectionResults } from "../../lib/types";
import "./Results.css";

type PageError = { key: TranslationKey; values?: TranslateValues };

function describeError(error: unknown, fallback: TranslationKey): PageError {
  if (!(error instanceof ApiError)) return { key: "admin.results.errors.unexpected" };

  switch (error.code) {
    case "network_error":
      return { key: "admin.results.errors.network" };
    case "election_not_found":
      return { key: "admin.results.errors.notFound" };
    case "database_error":
      return { key: "admin.results.errors.server" };
    default:
      break;
  }

  if (error.status >= 500) return { key: "admin.results.errors.server" };
  return { key: fallback };
}

function pickElectionId(current: string, list: Election[], preferred: string): string {
  if (list.some((election) => String(election.id) === current)) return current;
  if (preferred !== "" && list.some((election) => String(election.id) === preferred)) {
    return preferred;
  }
  return list[0] === undefined ? "" : String(list[0].id);
}

export function Results() {
  const { logout } = useAuth();
  const { language, t } = useI18n();
  const [searchParams] = useSearchParams();
  const [initialElection] = useState(() => searchParams.get("election") ?? "");

  const [elections, setElections] = useState<Election[] | null>(null);
  const [electionsError, setElectionsError] = useState<PageError | null>(null);
  const [reload, setReload] = useState(0);

  const [selectedId, setSelectedId] = useState(initialElection);
  const [results, setResults] = useState<ElectionResults | null>(null);
  const [resultsError, setResultsError] = useState<PageError | null>(null);

  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });

  useEffect(() => {
    document.title = t("admin.results.heading");
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
        setElectionsError(describeError(error, "admin.results.errors.load"));
      });

    return () => controller.abort();
  }, [initialElection, logout, reload]);

  useEffect(() => {
    if (selectedId === "") return;
    const electionId = Number(selectedId);
    if (!Number.isInteger(electionId) || electionId <= 0) return;

    const controller = new AbortController();

    fetchResults(electionId, controller.signal)
      .then((data) => {
        setResults(data);
        setResultsError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (error instanceof ApiError && error.status === 401) {
          void logout();
          return;
        }
        setResultsError(describeError(error, "admin.results.errors.load"));
      });

    return () => controller.abort();
  }, [selectedId, logout, reload]);

  function retry() {
    setElections(null);
    setElectionsError(null);
    setResults(null);
    setResultsError(null);
    setReload((value) => value + 1);
  }

  /** Clears the old tallies as soon as another election is chosen. */
  function changeElection(value: string) {
    setSelectedId(value);
    setResults(null);
    setResultsError(null);
  }

  const stats = (results === null ? [] : [
    { key: "admin.results.voters", value: results.turnout.voters },
    { key: "admin.results.voted", value: results.turnout.voted },
    { key: "admin.results.weightTotal", value: results.turnout.weightTotal },
    { key: "admin.results.weightCast", value: results.turnout.weightCast },
  ]) as Array<{ key: TranslationKey; value: number }>;

  return (
    <main className="results">
      <div className="results__content">
        <header className="results__header">
          <div className="results__topbar">
            <Link className="results__back" to="/admin">
              <span aria-hidden="true">←</span> {t("admin.backToPanel")}
            </Link>
            <LanguageSwitcher />
          </div>
          <h1 className="results__title">{t("admin.results.heading")}</h1>
        </header>

        {electionsError !== null && (
          <div className="results__panel results__error" role="alert">
            <p>{t(electionsError.key, electionsError.values)}</p>
            <button type="button" className="results__retry" onClick={retry}>
              {t("admin.emails.retry")}
            </button>
          </div>
        )}

        {elections === null && electionsError === null && (
          <p className="results__hint">{t("common.loading")}</p>
        )}

        {elections !== null && elections.length === 0 && (
          <div className="results__panel">
            <p className="results__hint">{t("admin.results.noElections")}</p>
            <Link className="results__link-button" to="/admin/elections">
              {t("admin.results.goToElections")}
            </Link>
          </div>
        )}

        {elections !== null && elections.length > 0 && (
          <>
            <section className="results__panel">
              <label className="results__field results__field--grow">
                <span>{t("admin.results.electionLabel")}</span>
                <select
                  value={selectedId}
                  onChange={(event) => changeElection(event.target.value)}
                >
                  <option value="">{t("admin.results.selectElection")}</option>
                  {elections.map((election) => (
                    <option key={election.id} value={String(election.id)}>
                      {election.title}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            {resultsError !== null && (
              <div className="results__panel results__error" role="alert">
                <p>{t(resultsError.key, resultsError.values)}</p>
                <button type="button" className="results__retry" onClick={retry}>
                  {t("admin.emails.retry")}
                </button>
              </div>
            )}

            {results === null && resultsError === null && selectedId !== "" && (
              <p className="results__hint">{t("common.loading")}</p>
            )}

            {results !== null && (
              <>
                <section className="results__panel">
                  <h2 className="results__panel-title">{t("admin.results.turnout")}</h2>
                  <div className="results__stats">
                    {stats.map((stat) => (
                      <div key={stat.key} className="results__stat">
                        <span>{t(stat.key)}</span>
                        <strong>{number.format(stat.value)}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                {results.turnout.voted === 0 && (
                  <p className="results__hint">{t("admin.results.noVotes")}</p>
                )}

                {results.results.length === 0 && (
                  <p className="results__hint">{t("admin.results.emptyMotions")}</p>
                )}

                {results.results.map((motion) => (
                  <section key={motion.motionId} className="results__panel">
                    <h2 className="results__panel-title">{motion.title}</h2>
                    <div className="results__table-head">
                      <span>{t("admin.ballots.optionsLabel")}</span>
                      <span>{t("admin.results.votes")}</span>
                      <span>{t("admin.results.weighted")}</span>
                      <span>{t("admin.results.share")}</span>
                    </div>
                    <ul className="results__options">
                      {motion.options.map((option) => {
                        const share =
                          motion.totalWeight > 0 ? (option.weight / motion.totalWeight) * 100 : 0;
                        return (
                          <li key={option.label} className="results__option">
                            <span className="results__option-name">{option.label}</span>
                            <span>{number.format(option.votes)}</span>
                            <span>{number.format(option.weight)}</span>
                            <span>{number.format(share)} %</span>
                            <span
                              className="results__bar"
                              aria-hidden="true"
                              style={{ width: `${Math.max(0, Math.min(100, share))}%` }}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
