/*
  Admin questionnaires page.

  The admin creates a questionnaire by typing free-text questions; the server
  assigns a category to each one and creates a link for the initial responsible.
  The detail panel shows aggregate progress, current owners and the delegation
  history. Individual answers are visible only here, never in the public link.
*/

import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../i18n/i18n-context";
import type { TranslateValues, TranslationKey } from "../../i18n";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import {
  createQuestionnaireRequest,
  fetchQuestionnaireDetail,
  fetchQuestionnaires,
} from "../../lib/questionnaires-api";
import { categoryLabelKey } from "../../lib/categories";
import type {
  OrganizationPerson,
  Questionnaire,
  QuestionnaireDetail,
} from "../../lib/types";
import "./Questionnaires.css";

type PageError = { key: TranslationKey; values?: TranslateValues };

function describeError(error: unknown, fallback: TranslationKey): PageError {
  if (!(error instanceof ApiError)) return { key: "admin.questionnaires.errors.unexpected" };

  switch (error.code) {
    case "network_error":
      return { key: "admin.questionnaires.errors.network" };
    case "questionnaire_not_found":
      return { key: "admin.questionnaires.errors.notFound" };
    case "person_not_found":
      return { key: "admin.questionnaires.errors.personNotFound" };
    case "invalid_input":
      return { key: "admin.questionnaires.errors.invalidInput" };
    case "database_error":
      return { key: "admin.questionnaires.errors.server" };
    default:
      break;
  }

  if (error.status >= 500) return { key: "admin.questionnaires.errors.server" };
  return { key: fallback };
}

export function Questionnaires() {
  const { logout } = useAuth();
  const { language, t } = useI18n();
  const [searchParams] = useSearchParams();
  const [initialId] = useState(() => searchParams.get("id") ?? "");

  const [list, setList] = useState<Questionnaire[] | null>(null);
  const [people, setPeople] = useState<OrganizationPerson[]>([]);
  const [listError, setListError] = useState<PageError | null>(null);
  const [reload, setReload] = useState(0);

  const [selectedId, setSelectedId] = useState(initialId);
  const [detail, setDetail] = useState<QuestionnaireDetail | null>(null);
  const [detailError, setDetailError] = useState<PageError | null>(null);

  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [questions, setQuestions] = useState<string[]>(["", ""]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<PageError | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = t("admin.questionnaires.heading");
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();

    fetchQuestionnaires(controller.signal)
      .then((data) => {
        setList(data.questionnaires);
        setPeople(data.people);
        setListError(null);
        setSelectedId((current) => {
          if (data.questionnaires.some((item) => String(item.id) === current)) return current;
          const first = data.questionnaires[0];
          return first === undefined ? "" : String(first.id);
        });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (error instanceof ApiError && error.status === 401) {
          void logout();
          return;
        }
        setListError(describeError(error, "admin.questionnaires.errors.load"));
      });

    return () => controller.abort();
  }, [logout, reload]);

  useEffect(() => {
    if (selectedId === "") return;
    const questionnaireId = Number(selectedId);
    if (!Number.isInteger(questionnaireId) || questionnaireId <= 0) return;

    const controller = new AbortController();

    fetchQuestionnaireDetail(questionnaireId, controller.signal)
      .then((data) => {
        setDetail(data);
        setDetailError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (error instanceof ApiError && error.status === 401) {
          void logout();
          return;
        }
        setDetailError(describeError(error, "admin.questionnaires.errors.loadDetail"));
      });

    return () => controller.abort();
  }, [selectedId, logout, reload]);

  /** Reloads both panels after a successful create or an error. */
  function retry() {
    setList(null);
    setListError(null);
    setDetail(null);
    setDetailError(null);
    setCreateError(null);
    setReload((value) => value + 1);
  }

  /** Clears the detail panel so the list and the create form stay visible. */
  function backToList() {
    setSelectedId("");
    setDetail(null);
    setDetailError(null);
  }

  function changeQuestion(index: number, value: string) {
    setQuestions((current) => current.map((item, i) => (i === index ? value : item)));
  }

  function addQuestion() {
    setQuestions((current) => [...current, ""]);
  }

  function removeQuestion(index: number) {
    setQuestions((current) => current.filter((_, i) => i !== index));
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCopied(false);

    const cleaned = questions.map((value) => value.trim()).filter((value) => value !== "");
    const parsedOwner = Number(ownerId);
    if (title.trim() === "" || !Number.isInteger(parsedOwner) || parsedOwner <= 0 || cleaned.length === 0) {
      setCreateError({ key: "admin.questionnaires.errors.invalidInput" });
      return;
    }

    setCreating(true);
    try {
      const result = await createQuestionnaireRequest({
        title: title.trim(),
        ownerId: parsedOwner,
        questions: cleaned,
      });
      setCreatedToken(result.ownerToken);
      setTitle("");
      setOwnerId("");
      setQuestions(["", ""]);
      setSelectedId(String(result.questionnaireId));
      setReload((value) => value + 1);
    } catch (error) {
      setCreateError(describeError(error, "admin.questionnaires.errors.invalidInput"));
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(token: string) {
    const link = `${window.location.origin}/questionnaire/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const date = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <main className="questionnaires">
      <div className="questionnaires__content">
        <header className="questionnaires__header">
          <div className="questionnaires__topbar">
            <Link className="questionnaires__back" to="/admin">
              <span aria-hidden="true">←</span> {t("admin.backToPanel")}
            </Link>
            <LanguageSwitcher />
          </div>
          <h1 className="questionnaires__title">{t("admin.questionnaires.heading")}</h1>
        </header>

        {listError !== null && (
          <div className="questionnaires__panel questionnaires__error" role="alert">
            <p>{t(listError.key, listError.values)}</p>
            <button type="button" className="questionnaires__retry" onClick={retry}>
              {t("admin.questionnaires.retry")}
            </button>
          </div>
        )}

        {list === null && listError === null && (
          <p className="questionnaires__hint">{t("common.loading")}</p>
        )}

        {list !== null && (
          <>
            <section className="questionnaires__panel">
              <h2 className="questionnaires__panel-title">{t("admin.questionnaires.newTitle")}</h2>
              {people.length === 0 && (
                <>
                  <p className="questionnaires__hint">{t("admin.questionnaires.noPeople")}</p>
                  <Link className="questionnaires__link-button" to="/admin/voters">
                    {t("admin.questionnaires.goToVoters")}
                  </Link>
                </>
              )}
              {people.length > 0 && (
                <form className="questionnaires__form" onSubmit={(event) => void submit(event)}>
                  <label className="questionnaires__field">
                    <span>{t("admin.questionnaires.titleLabel")}</span>
                    <input
                      type="text"
                      value={title}
                      maxLength={200}
                      placeholder={t("admin.questionnaires.titlePlaceholder")}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>

                  <label className="questionnaires__field">
                    <span>{t("admin.questionnaires.ownerLabel")}</span>
                    <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                      <option value="">{t("admin.questionnaires.selectOwner")}</option>
                      {people.map((person) => (
                        <option key={person.personId} value={String(person.personId)}>
                          {person.name} — {person.email}
                        </option>
                      ))}
                    </select>
                  </label>

                  <fieldset className="questionnaires__questions">
                    <legend>{t("admin.questionnaires.questionsLabel")}</legend>
                    {questions.map((question, index) => (
                      <div key={index} className="questionnaires__question-row">
                        <input
                          type="text"
                          value={question}
                          maxLength={1000}
                          placeholder={t("admin.questionnaires.questionPlaceholder", { number: index + 1 })}
                          onChange={(event) => changeQuestion(index, event.target.value)}
                        />
                        <button
                          type="button"
                          className="questionnaires__secondary"
                          onClick={() => removeQuestion(index)}
                        >
                          {t("admin.questionnaires.removeQuestion")}
                        </button>
                      </div>
                    ))}
                    <button type="button" className="questionnaires__secondary" onClick={addQuestion}>
                      {t("admin.questionnaires.addQuestion")}
                    </button>
                  </fieldset>

                  {createError !== null && (
                    <p className="questionnaires__inline-error" role="alert">
                      {t(createError.key, createError.values)}
                    </p>
                  )}

                  <button type="submit" className="questionnaires__primary" disabled={creating}>
                    {creating
                      ? t("admin.questionnaires.creating")
                      : t("admin.questionnaires.create")}
                  </button>

                  {createdToken !== null && (
                    <div className="questionnaires__success" role="status">
                      <p>{t("admin.questionnaires.created")}</p>
                      <div className="questionnaires__link-row">
                        <code className="questionnaires__link">
                          {window.location.origin}/questionnaire/{createdToken}
                        </code>
                        <button
                          type="button"
                          className="questionnaires__secondary"
                          onClick={() => void copyLink(createdToken)}
                        >
                          {t("admin.questionnaires.copyLink")}
                        </button>
                      </div>
                      {copied && <p className="questionnaires__copied">{t("admin.questionnaires.copied")}</p>}
                    </div>
                  )}
                </form>
              )}
            </section>

            <section className="questionnaires__panel">
              <h2 className="questionnaires__panel-title">{t("admin.questionnaires.listTitle")}</h2>
              {list.length === 0 && (
                <p className="questionnaires__hint">{t("admin.questionnaires.empty")}</p>
              )}
              {list.length > 0 && (
                <ul className="questionnaires__list">
                  {list.map((item) => (
                    <li key={item.id} className="questionnaires__list-item">
                      <button
                        type="button"
                        className={`questionnaires__list-button${selectedId === String(item.id) ? " questionnaires__list-button--active" : ""}`}
                        onClick={() => {
                          setSelectedId(String(item.id));
                          setDetail(null);
                          setDetailError(null);
                        }}
                      >
                        <strong>{item.title}</strong>
                        <span>{item.owner.name}</span>
                        <span>{t("admin.questionnaires.progressValue", { answered: item.answerCount, total: item.questionCount })}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {detailError !== null && (
          <div className="questionnaires__panel questionnaires__error" role="alert">
            <p>{t(detailError.key, detailError.values)}</p>
            <button type="button" className="questionnaires__retry" onClick={retry}>
              {t("admin.questionnaires.retry")}
            </button>
          </div>
        )}

        {detail === null && detailError === null && selectedId !== "" && (
          <p className="questionnaires__hint">{t("common.loading")}</p>
        )}

        {detail !== null && (
          <>
            <section className="questionnaires__panel">
              <div className="questionnaires__topbar">
                <h2 className="questionnaires__panel-title">{detail.questionnaire.title}</h2>
                <button type="button" className="questionnaires__secondary" onClick={backToList}>
                  {t("admin.questionnaires.backToList")}
                </button>
              </div>
              <p className="questionnaires__hint">
                {t("admin.questionnaires.createdAt", {
                  date: date.format(new Date(detail.questionnaire.createdAt)),
                })}
              </p>
              <div className="questionnaires__link-row">
                <code className="questionnaires__link">
                  {window.location.origin}/questionnaire/{detail.ownerLink ?? ""}
                </code>
                {detail.ownerLink !== null && (
                  <button
                    type="button"
                    className="questionnaires__secondary"
                    onClick={() => void copyLink(detail.ownerLink as string)}
                  >
                    {t("admin.questionnaires.copyLink")}
                  </button>
                )}
              </div>
              {copied && <p className="questionnaires__copied">{t("admin.questionnaires.copied")}</p>}
            </section>

            <section className="questionnaires__panel">
              <h2 className="questionnaires__panel-title">{t("admin.questionnaires.progress")}</h2>
              <p className="questionnaires__summary">
                {t("admin.questionnaires.progressValue", {
                  answered: detail.progress.answered,
                  total: detail.progress.total,
                })}
                {" · "}
                {t("admin.questionnaires.delegated", { count: detail.progress.delegated })}
              </p>
              <h3 className="questionnaires__subtitle">{t("admin.questionnaires.byCategory")}</h3>
              <ul className="questionnaires__categories">
                {detail.progress.byCategory.map((entry) => (
                  <li key={entry.category} className="questionnaires__category">
                    {t("admin.questionnaires.categoryValue", {
                      category: t(categoryLabelKey(entry.category)),
                      answered: entry.answered,
                      total: entry.total,
                    })}
                  </li>
                ))}
              </ul>
            </section>

            <section className="questionnaires__panel">
              <h2 className="questionnaires__panel-title">{t("admin.questionnaires.questionsTitle")}</h2>
              {detail.questions.length === 0 && (
                <p className="questionnaires__hint">{t("admin.questionnaires.noQuestions")}</p>
              )}
              <ul className="questionnaires__detail-list">
                {detail.questions.map((question) => (
                  <li key={question.id} className="questionnaires__detail-item">
                    <strong>{question.body}</strong>
                    <div className="questionnaires__tags">
                      <span className="questionnaires__tag">
                        {t("admin.questionnaires.categoryTag", { category: t(categoryLabelKey(question.category)) })}
                      </span>
                      <span className="questionnaires__tag">
                        {question.assignee === null
                          ? "—"
                          : t("questionnaire.personTag", { name: question.assignee.name })}
                      </span>
                      <span
                        className={`questionnaires__tag${question.answer !== null ? " questionnaires__tag--ok" : ""}`}
                      >
                        {t(question.answer !== null
                          ? "admin.questionnaires.answered"
                          : "admin.questionnaires.pending")}
                      </span>
                    </div>
                    {question.answer !== null && (
                      <p className="questionnaires__answer">{question.answer}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="questionnaires__panel">
              <h2 className="questionnaires__panel-title">{t("admin.questionnaires.historyTitle")}</h2>
              {detail.history.length === 0 && (
                <p className="questionnaires__hint">{t("admin.questionnaires.noHistory")}</p>
              )}
              {detail.history.length > 0 && (
                <ul className="questionnaires__detail-list">
                  {detail.history.map((event) => (
                    <li key={event.id} className="questionnaires__hint">
                      {t("admin.questionnaires.historyEvent", {
                        from: event.fromName,
                        to: event.toName,
                        question: event.questionBody,
                      })}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
