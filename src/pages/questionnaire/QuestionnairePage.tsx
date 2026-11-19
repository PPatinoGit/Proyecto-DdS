/*
  Questionnaire page reached from the emailed link: /questionnaire/<token>.

  The token is the credential; there is no login here. A recipient answers the
  questions they are currently responsible for and can delegate any of them to
  another person. Delegation moves the single owner in one transaction and the
  new responsible gets their own link. Progress is shown as aggregate counts.

  All texts come from the dictionaries; API codes become translation keys.
*/

import { useEffect, useState, type SubmitEvent } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { useI18n } from "../../i18n/i18n-context";
import type { TranslateValues, TranslationKey } from "../../i18n";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import {
  answerQuestionRequest,
  delegateQuestionsRequest,
  fetchQuestionnaireView,
} from "../../lib/questionnaire-link-api";
import { categoryLabelKey } from "../../lib/categories";
import type { QuestionnaireQuestion, QuestionnaireView } from "../../lib/types";
import "./QuestionnairePage.css";

type PageError = { key: TranslationKey; values?: TranslateValues };

const ERROR_KEYS: Record<string, TranslationKey> = {
  invalid_token: "questionnaire.errors.invalidToken",
  questionnaire_not_found: "questionnaire.errors.invalidToken",
  network_error: "questionnaire.errors.network",
  database_error: "questionnaire.errors.server",
  not_responsible: "questionnaire.errors.notResponsible",
  invalid_input: "questionnaire.errors.invalidInput",
  same_person: "questionnaire.errors.samePerson",
  person_not_found: "questionnaire.errors.personNotFound",
  duplicate_question: "questionnaire.errors.duplicateQuestion",
};

function describeError(error: unknown): PageError {
  if (!(error instanceof ApiError)) return { key: "questionnaire.errors.unexpected" };
  if (error.status >= 500) return { key: "questionnaire.errors.server" };
  return { key: ERROR_KEYS[error.code] ?? "questionnaire.errors.unexpected" };
}

export function QuestionnairePage() {
  const { token = "" } = useParams();
  const { t } = useI18n();

  const [view, setView] = useState<QuestionnaireView | null>(null);
  const [error, setError] = useState<PageError | null>(null);
  const [reload, setReload] = useState(0);

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [delegateTo, setDelegateTo] = useState("");
  const [delegating, setDelegating] = useState(false);
  const [delegateLink, setDelegateLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<TranslationKey | null>(null);

  useEffect(() => {
    document.title = t("questionnaire.heading");
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();

    fetchQuestionnaireView(token, controller.signal)
      .then(({ view: data }) => {
        setView(data);
        setError(null);
        setCopied(false);

        /* Existing answers become drafts; unsaved drafts stay on top. */
        const fromServer: Record<number, string> = {};
        for (const question of data.mine) {
          if (question.answer !== null) fromServer[question.id] = question.answer;
        }
        setAnswers((current) => ({ ...fromServer, ...current }));
        setSelected((current) => current.filter((id) => data.mine.some((q) => q.id === id)));
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(describeError(cause));
      });

    return () => controller.abort();
  }, [token, reload]);

  function retry() {
    setView(null);
    setError(null);
    setNotice(null);
    setReload((value) => value + 1);
  }

  function changeAnswer(questionId: number, value: string) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  async function saveAnswer(question: QuestionnaireQuestion) {
    const body = (answers[question.id] ?? "").trim();
    if (body === "" || savingId !== null) return;

    setSavingId(question.id);
    setNotice(null);
    try {
      await answerQuestionRequest(token, { questionId: question.id, body });
      setNotice("questionnaire.saved");
      setReload((value) => value + 1);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSavingId(null);
    }
  }

  function toggleSelection(questionId: number) {
    setSelected((current) =>
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId],
    );
  }

  async function submitDelegation(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (delegating || selected.length === 0 || delegateTo === "") return;

    setDelegating(true);
    setNotice(null);
    setError(null);
    try {
      const { delegateToken } = await delegateQuestionsRequest(token, {
        questionIds: selected,
        toPersonId: Number(delegateTo),
      });
      setDelegateLink(`${window.location.origin}/questionnaire/${delegateToken}`);
      setSelected([]);
      setNotice("questionnaire.delegated");
      setReload((value) => value + 1);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setDelegating(false);
    }
  }

  async function copyLink() {
    if (delegateLink === null) return;
    try {
      await navigator.clipboard.writeText(delegateLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="questionnaire">
      <div className="questionnaire__card">
        <header className="questionnaire__header">
          <LanguageSwitcher />
          <h1 className="questionnaire__title">{t("questionnaire.heading")}</h1>
        </header>

        {error !== null && (
          <div className="questionnaire__error" role="alert">
            <p>{t(error.key, error.values)}</p>
            <button type="button" className="questionnaire__retry" onClick={retry}>
              {t("questionnaire.retry")}
            </button>
          </div>
        )}

        {view === null && error === null && (
          <p className="questionnaire__hint">{t("common.loading")}</p>
        )}

        {view !== null && (
          <>
            <p className="questionnaire__greeting">
              {t("questionnaire.greeting", { name: view.person.name })}
            </p>
            <h2 className="questionnaire__subtitle">{view.questionnaire.title}</h2>
            <p className="questionnaire__hint">{t("questionnaire.instructions")}</p>

            {notice !== null && (
              <p className="questionnaire__success" role="status">
                {t(notice)}
              </p>
            )}

            <section className="questionnaire__panel">
              <h2 className="questionnaire__panel-title">{t("questionnaire.progress")}</h2>
              <p className="questionnaire__summary">
                {t("questionnaire.progressValue", {
                  answered: view.progress.answered,
                  total: view.progress.total,
                })}
              </p>
              <ul className="questionnaire__categories">
                {view.progress.byCategory.map((entry) => (
                  <li key={entry.category} className="questionnaire__category">
                    {t("questionnaire.categoryValue", {
                      category: t(categoryLabelKey(entry.category)),
                      answered: entry.answered,
                      total: entry.total,
                    })}
                  </li>
                ))}
              </ul>
            </section>

            <section className="questionnaire__panel">
              <h2 className="questionnaire__panel-title">{t("questionnaire.mineTitle")}</h2>
              {view.mine.length === 0 && (
                <p className="questionnaire__hint">{t("questionnaire.noMine")}</p>
              )}
              {view.mine.map((question) => (
                <div key={question.id} className="questionnaire__question">
                  <strong>{question.body}</strong>
                  <span className="questionnaire__tag">
                    {t("questionnaire.categoryTag", { category: t(categoryLabelKey(question.category)) })}
                  </span>
                  <label className="questionnaire__field">
                    <span>{t("questionnaire.answerLabel")}</span>
                    <textarea
                      value={answers[question.id] ?? ""}
                      maxLength={5000}
                      rows={4}
                      placeholder={t("questionnaire.answerPlaceholder")}
                      onChange={(event) => changeAnswer(question.id, event.target.value)}
                    />
                  </label>
                  <div className="questionnaire__question-actions">
                    <button
                      type="button"
                      className="questionnaire__primary"
                      disabled={savingId !== null || (answers[question.id] ?? "").trim() === ""}
                      onClick={() => void saveAnswer(question)}
                    >
                      {savingId === question.id
                        ? t("questionnaire.saving")
                        : t("questionnaire.saveAnswer")}
                    </button>
                    <span
                      className={`questionnaire__tag${question.answer !== null ? " questionnaire__tag--ok" : ""}`}
                    >
                      {t(question.answer !== null
                        ? "questionnaire.answeredTag"
                        : "questionnaire.pendingTag")}
                    </span>
                  </div>
                </div>
              ))}
            </section>

            {view.mine.length > 0 && view.people.length > 0 && (
              <section className="questionnaire__panel">
                <h2 className="questionnaire__panel-title">{t("questionnaire.delegateTitle")}</h2>
                <p className="questionnaire__hint">{t("questionnaire.delegateHint")}</p>
                <form className="questionnaire__form" onSubmit={(event) => void submitDelegation(event)}>
                  <fieldset className="questionnaire__selection">
                    <legend>{t("questionnaire.mineTitle")}</legend>
                    {view.mine.map((question) => (
                      <label key={question.id} className="questionnaire__check">
                        <input
                          type="checkbox"
                          checked={selected.includes(question.id)}
                          onChange={() => toggleSelection(question.id)}
                        />
                        <span>{question.body}</span>
                      </label>
                    ))}
                  </fieldset>
                  <label className="questionnaire__field">
                    <span>{t("questionnaire.delegateToLabel")}</span>
                    <select value={delegateTo} onChange={(event) => setDelegateTo(event.target.value)}>
                      <option value="">{t("questionnaire.selectDelegate")}</option>
                      {view.people.map((person) => (
                        <option key={person.personId} value={String(person.personId)}>
                          {person.name} — {person.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="questionnaire__secondary"
                    disabled={delegating || selected.length === 0 || delegateTo === ""}
                  >
                    {delegating ? t("questionnaire.delegating") : t("questionnaire.delegate")}
                  </button>
                </form>

                {delegateLink !== null && (
                  <div className="questionnaire__link-box" role="status">
                    <p className="questionnaire__hint">{t("questionnaire.delegateLink")}</p>
                    <code className="questionnaire__link">{delegateLink}</code>
                    <button type="button" className="questionnaire__secondary" onClick={() => void copyLink()}>
                      {t("questionnaire.copyLink")}
                    </button>
                    {copied && <p className="questionnaire__copied">{t("admin.questionnaires.copied")}</p>}
                  </div>
                )}
              </section>
            )}

            <section className="questionnaire__panel">
              <h2 className="questionnaire__panel-title">{t("questionnaire.historyTitle")}</h2>
              {view.history.length === 0 && (
                <p className="questionnaire__hint">{t("questionnaire.noHistory")}</p>
              )}
              {view.history.length > 0 && (
                <ul className="questionnaire__history">
                  {view.history.map((event) => (
                    <li key={event.id} className="questionnaire__hint">
                      {t("questionnaire.historyEvent", {
                        from: event.fromName,
                        to: event.toName,
                        question: event.questionBody,
                      })}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="questionnaire__panel">
              <h2 className="questionnaire__panel-title">{t("questionnaire.othersTitle")}</h2>
              {view.others.length === 0 && (
                <p className="questionnaire__hint">{t("questionnaire.noOthers")}</p>
              )}
              {view.others.map((question) => (
                <div key={question.id} className="questionnaire__question questionnaire__question--muted">
                  <strong>{question.body}</strong>
                  <span className="questionnaire__tag">
                    {t("questionnaire.categoryTag", { category: t(categoryLabelKey(question.category)) })}
                  </span>
                  <span className="questionnaire__hint">
                    {question.assignee === null
                      ? "—"
                      : t("questionnaire.personTag", { name: question.assignee.name })}
                  </span>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
