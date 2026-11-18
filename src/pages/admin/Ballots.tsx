/*
 Ballot editor.

 Defines the motions and their free-text options for one election, and
 publishes (or closes) the vote. The editor becomes read-only as soon as the
 first vote is recorded: changing an option would change what a vote means.

 All texts come from the dictionaries; API codes become translation keys.
*/

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../i18n/i18n-context";
import type { TranslateValues, TranslationKey } from "../../i18n";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { fetchElections } from "../../lib/elections-api";
import {
  fetchMotions,
  saveMotionsRequest,
  setElectionStatusRequest,
  type BallotDefinition,
} from "../../lib/motions-api";
import type { Election, Motion } from "../../lib/types";
import "./Ballots.css";

type PageError = { key: TranslationKey; values?: TranslateValues };

type DraftOption = { key: string; label: string };
type DraftMotion = { key: string; title: string; options: DraftOption[] };

const MAX_OPTIONS = 8;

const STATUS_KEYS: Record<Election["status"], TranslationKey> = {
  draft: "admin.elections.status.draft",
  open: "admin.elections.status.open",
  closed: "admin.elections.status.closed",
};

function newOption(label = ""): DraftOption {
  return { key: crypto.randomUUID(), label };
}

function newMotion(): DraftMotion {
  return { key: crypto.randomUUID(), title: "", options: [newOption(), newOption()] };
}

/** Server rows need local keys so React can reorder/edit them safely. */
function toDraft(motions: Motion[]): DraftMotion[] {
  return motions.map((motion) => ({
    key: String(motion.id),
    title: motion.title,
    options: motion.options.map((option) => ({
      key: String(option.id),
      label: option.label,
    })),
  }));
}

function describeError(error: unknown, fallback: TranslationKey): PageError {
  if (!(error instanceof ApiError)) return { key: "admin.ballots.errors.unexpected" };

  switch (error.code) {
    case "network_error":
      return { key: "admin.ballots.errors.network" };
    case "invalid_input":
      return { key: "admin.ballots.errors.invalidInput" };
    case "election_not_found":
      return { key: "admin.ballots.errors.notFound" };
    case "votes_exist":
      return { key: "admin.ballots.errors.votesExist" };
    case "database_error":
      return { key: "admin.ballots.errors.server" };
    default:
      break;
  }

  if (error.status >= 500) return { key: "admin.ballots.errors.server" };
  return { key: fallback };
}

/** Keeps the current selection if possible, otherwise the URL/first election. */
function pickElectionId(current: string, list: Election[], preferred: string): string {
  if (list.some((election) => String(election.id) === current)) return current;
  if (preferred !== "" && list.some((election) => String(election.id) === preferred)) {
    return preferred;
  }
  return list[0] === undefined ? "" : String(list[0].id);
}

export function Ballots() {
  const { logout } = useAuth();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [initialElection] = useState(() => searchParams.get("election") ?? "");

  const [elections, setElections] = useState<Election[] | null>(null);
  const [electionsError, setElectionsError] = useState<PageError | null>(null);
  const [reload, setReload] = useState(0);

  const [selectedId, setSelectedId] = useState(initialElection);
  const [definition, setDefinition] = useState<BallotDefinition | null>(null);
  const [ballotError, setBallotError] = useState<PageError | null>(null);

  const [draft, setDraft] = useState<DraftMotion[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [actionError, setActionError] = useState<PageError | null>(null);
  const [notice, setNotice] = useState<TranslationKey | null>(null);

  const selected = elections?.find((election) => String(election.id) === selectedId) ?? null;
  const locked = definition?.locked ?? false;
  const busy = saving || changingStatus;

  /** Clears the previous ballot before another election is loaded. */
  function resetBallotState() {
    setDefinition(null);
    setBallotError(null);
    setDraft([]);
    setDirty(false);
    setNotice(null);
    setActionError(null);
  }

  useEffect(() => {
    document.title = t("admin.ballots.heading");
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
        setElectionsError(describeError(error, "admin.ballots.errors.load"));
      });

    return () => controller.abort();
  }, [initialElection, logout, reload]);

  useEffect(() => {
    if (selectedId === "") return;
    const electionId = Number(selectedId);
    if (!Number.isInteger(electionId) || electionId <= 0) return;

    const controller = new AbortController();

    fetchMotions(electionId, controller.signal)
      .then((data) => {
        setDefinition(data);
        setDraft(toDraft(data.motions));
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (error instanceof ApiError && error.status === 401) {
          void logout();
          return;
        }
        setBallotError(describeError(error, "admin.ballots.errors.load"));
      });

    return () => controller.abort();
  }, [selectedId, logout, reload]);

  function retryLoad() {
    setElections(null);
    setElectionsError(null);
    resetBallotState();
    setReload((value) => value + 1);
  }

  function changeElection(value: string) {
    setSelectedId(value);
    resetBallotState();
  }

  function updateMotion(key: string, change: (motion: DraftMotion) => DraftMotion) {
    setDraft((list) => list.map((motion) => (motion.key === key ? change(motion) : motion)));
    setDirty(true);
    setNotice(null);
  }

  function addMotion() {
    setDraft((list) => [...list, newMotion()]);
    setDirty(true);
    setNotice(null);
  }

  function removeMotion(key: string) {
    setDraft((list) => list.filter((motion) => motion.key !== key));
    setDirty(true);
    setNotice(null);
  }

  function addOption(motionKey: string) {
    updateMotion(motionKey, (motion) => ({
      ...motion,
      options: motion.options.length >= MAX_OPTIONS ? motion.options : [...motion.options, newOption()],
    }));
  }

  function removeOption(motionKey: string, optionKey: string) {
    updateMotion(motionKey, (motion) => ({
      ...motion,
      options: motion.options.filter((option) => option.key !== optionKey),
    }));
  }

  function updateOption(motionKey: string, optionKey: string, label: string) {
    updateMotion(motionKey, (motion) => ({
      ...motion,
      options: motion.options.map((option) =>
        option.key === optionKey ? { ...option, label } : option,
      ),
    }));
  }

  /** Client-side check with the same rules as the API. */
  function validate(): PageError | null {
    if (draft.length === 0) return { key: "admin.ballots.noMotions" };

    for (const motion of draft) {
      if (motion.title.trim() === "") return { key: "admin.ballots.errors.invalidInput" };
      if (motion.options.length < 2 || motion.options.length > MAX_OPTIONS) {
        return { key: "admin.ballots.errors.invalidInput" };
      }
      if (motion.options.some((option) => option.label.trim() === "")) {
        return { key: "admin.ballots.errors.invalidInput" };
      }
      const labels = motion.options.map((option) => option.label.trim().toLocaleLowerCase());
      if (new Set(labels).size !== labels.length) {
        return { key: "admin.ballots.errors.invalidInput" };
      }
    }

    return null;
  }

  async function save() {
    if (busy || locked || selectedId === "") return;

    const invalid = validate();
    if (invalid !== null) {
      setActionError(invalid);
      return;
    }

    setSaving(true);
    setActionError(null);
    setNotice(null);

    try {
      const result = await saveMotionsRequest(
        Number(selectedId),
        draft.map((motion) => ({
          title: motion.title.trim(),
          options: motion.options.map((option) => option.label.trim()),
        })),
      );
      setDefinition((current) =>
        current === null ? null : { ...current, motions: result.motions },
      );
      setDraft(toDraft(result.motions));
      setDirty(false);
      setNotice("admin.ballots.saved");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        return;
      }
      setActionError(describeError(error, "admin.ballots.errors.unexpected"));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: "open" | "closed") {
    if (busy || selectedId === "") return;

    if (status === "open" && draft.length === 0) {
      setActionError({ key: "admin.ballots.noMotions" });
      return;
    }
    if (status === "open" && dirty) {
      setActionError({ key: "admin.ballots.errors.invalidInput" });
      return;
    }

    setChangingStatus(true);
    setActionError(null);
    setNotice(null);

    try {
      const result = await setElectionStatusRequest(Number(selectedId), status);
      setElections((list) =>
        list === null
          ? null
          : list.map((election) =>
              election.id === result.election.id ? result.election : election,
            ),
      );
      setDefinition((current) => (current === null ? null : { ...current, election: result.election }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        return;
      }
      setActionError(describeError(error, "admin.elections.statusError" as TranslationKey));
    } finally {
      setChangingStatus(false);
    }
  }

  return (
    <main className="ballots">
      <div className="ballots__content">
        <header className="ballots__header">
          <div className="ballots__topbar">
            <Link className="ballots__back" to="/admin">
              <span aria-hidden="true">←</span> {t("admin.backToPanel")}
            </Link>
            <LanguageSwitcher />
          </div>
          <h1 className="ballots__title">{t("admin.ballots.heading")}</h1>
        </header>

        {electionsError !== null && (
          <div className="ballots__panel ballots__error" role="alert">
            <p>{t(electionsError.key, electionsError.values)}</p>
            <button type="button" className="ballots__retry" onClick={retryLoad}>
              {t("admin.emails.retry")}
            </button>
          </div>
        )}

        {elections === null && electionsError === null && (
          <p className="ballots__hint">{t("common.loading")}</p>
        )}

        {elections !== null && elections.length === 0 && (
          <div className="ballots__panel">
            <p className="ballots__hint">{t("admin.ballots.noElections")}</p>
            <Link className="ballots__link-button" to="/admin/elections">
              {t("admin.ballots.goToElections")}
            </Link>
          </div>
        )}

        {elections !== null && elections.length > 0 && (
          <>
            <section className="ballots__panel">
              <div className="ballots__row">
                <label className="ballots__field ballots__field--grow">
                  <span>{t("admin.ballots.electionLabel")}</span>
                  <select
                    value={selectedId}
                    onChange={(event) => changeElection(event.target.value)}
                    disabled={busy}
                  >
                    <option value="">{t("admin.ballots.selectElection")}</option>
                    {elections.map((election) => (
                      <option key={election.id} value={String(election.id)}>
                        {election.title}
                      </option>
                    ))}
                  </select>
                </label>

                {selected !== null && (
                  <div className="ballots__status">
                    <span>{t("admin.ballots.status")}</span>
                    <strong>{t(STATUS_KEYS[selected.status])}</strong>
                  </div>
                )}
              </div>

              {selected !== null && (
                <div className="ballots__actions">
                  {selected.status === "open" ? (
                    <button
                      type="button"
                      className="ballots__button ballots__button--secondary"
                      onClick={() => void changeStatus("closed")}
                      disabled={busy}
                    >
                      {t("admin.ballots.close")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ballots__button ballots__button--primary"
                      onClick={() => void changeStatus("open")}
                      disabled={busy || selected.status === "closed"}
                    >
                      {t("admin.ballots.open")}
                    </button>
                  )}
                  {selected.status === "open" && (
                    <span className="ballots__note">{t("admin.ballots.opened")}</span>
                  )}
                  {selected.status === "closed" && (
                    <span className="ballots__note">{t("admin.ballots.closed")}</span>
                  )}
                </div>
              )}
            </section>

            {ballotError !== null && (
              <div className="ballots__panel ballots__error" role="alert">
                <p>{t(ballotError.key, ballotError.values)}</p>
                <button type="button" className="ballots__retry" onClick={retryLoad}>
                  {t("admin.emails.retry")}
                </button>
              </div>
            )}

            {definition === null && ballotError === null && selectedId !== "" && (
              <p className="ballots__hint">{t("common.loading")}</p>
            )}

            {definition !== null && (
              <section className="ballots__panel" aria-busy={saving}>
                <h2 className="ballots__panel-title">{t("admin.ballots.motionsTitle")}</h2>
                <p className="ballots__hint">{t("admin.ballots.hint")}</p>

                {locked && <p className="ballots__locked">{t("admin.ballots.locked")}</p>}

                {draft.length === 0 && <p className="ballots__hint">{t("admin.ballots.noMotions")}</p>}

                <ol className="ballots__motions">
                  {draft.map((motion, motionIndex) => (
                    <li key={motion.key} className="ballots__motion">
                      <div className="ballots__motion-head">
                        <span className="ballots__motion-index">
                          {t("admin.ballots.motionLabel", { number: motionIndex + 1 })}
                        </span>
                        <button
                          type="button"
                          className="ballots__remove"
                          onClick={() => removeMotion(motion.key)}
                          disabled={busy || locked}
                        >
                          {t("admin.ballots.removeMotion")}
                        </button>
                      </div>

                      <label className="ballots__field">
                        <span>{t("admin.ballots.motionTitleLabel")}</span>
                        <input
                          type="text"
                          value={motion.title}
                          maxLength={200}
                          onChange={(event) =>
                            updateMotion(motion.key, (item) => ({ ...item, title: event.target.value }))
                          }
                          disabled={busy || locked}
                        />
                      </label>

                      <fieldset className="ballots__options" disabled={busy || locked}>
                        <legend>{t("admin.ballots.optionsLabel")}</legend>
                        {motion.options.map((option, optionIndex) => (
                          <div key={option.key} className="ballots__option">
                            <input
                              type="text"
                              value={option.label}
                              maxLength={120}
                              placeholder={t("admin.ballots.optionPlaceholder", {
                                number: optionIndex + 1,
                              })}
                              onChange={(event) =>
                                updateOption(motion.key, option.key, event.target.value)
                              }
                            />
                            <button
                              type="button"
                              className="ballots__remove"
                              onClick={() => removeOption(motion.key, option.key)}
                              disabled={busy || locked || motion.options.length <= 2}
                            >
                              {t("admin.ballots.removeOption")}
                            </button>
                          </div>
                        ))}
                        {motion.options.length < MAX_OPTIONS && (
                          <button
                            type="button"
                            className="ballots__add-option"
                            onClick={() => addOption(motion.key)}
                            disabled={busy || locked}
                          >
                            + {t("admin.ballots.addOption")}
                          </button>
                        )}
                      </fieldset>
                    </li>
                  ))}
                </ol>

                <button
                  type="button"
                  className="ballots__add-motion"
                  onClick={addMotion}
                  disabled={busy || locked}
                >
                  + {t("admin.ballots.addMotion")}
                </button>

                {actionError !== null && (
                  <p className="ballots__error" role="alert">
                    {t(actionError.key, actionError.values)}
                  </p>
                )}

                {notice !== null && (
                  <p className="ballots__ok" role="status">
                    {t(notice)}
                  </p>
                )}

                <div className="ballots__actions">
                  <button
                    type="button"
                    className="ballots__button ballots__button--primary"
                    onClick={() => void save()}
                    disabled={busy || locked || draft.length === 0 || !dirty}
                  >
                    {saving ? t("admin.ballots.saving") : t("admin.ballots.save")}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
