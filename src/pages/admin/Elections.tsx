/*
 Elections page.

 Lists the elections and creates new ones as drafts. Every text comes from the
 dictionaries; errors are mapped from API codes to translation keys.
*/

import { useEffect, useState, type SubmitEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../i18n/i18n-context";
import type { TranslateValues, TranslationKey } from "../../i18n";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { createElectionRequest, fetchElections } from "../../lib/elections-api";
import type { Election, ElectionStatus } from "../../lib/types";
import "./Elections.css";

type Context = "load" | "create";

type PageError = {
  key: TranslationKey;
  values?: TranslateValues;
};

const STATUS_KEYS: Record<ElectionStatus, TranslationKey> = {
  draft: "admin.elections.status.draft",
  open: "admin.elections.status.open",
  closed: "admin.elections.status.closed",
};

/* Maps an API error to a translation key. 401 is handled by the caller. */
function describeError(error: unknown, context: Context): PageError {
  if (!(error instanceof ApiError)) {
    return { key: "admin.elections.errors.unexpected" };
  }

  switch (error.code) {
    case "invalid_input":
      return { key: "admin.elections.errors.invalidInput" };
    case "network_error":
      return { key: "admin.elections.errors.network" };
    case "database_error":
      return { key: "admin.elections.errors.server" };
    default:
      break;
  }

  if (error.status >= 500) {
    return { key: "admin.elections.errors.server" };
  }
  if (context === "load") {
    return { key: "admin.elections.errors.load" };
  }
  return { key: "admin.elections.errors.unexpectedCode", values: { code: error.code } };
}

export function Elections() {
  const { logout } = useAuth();
  const { language, t } = useI18n();

  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<PageError | null>(null);
  /* Changing this number re-runs the effect, which is the "retry" action. */
  const [reloadToken, setReloadToken] = useState(0);

  const [title, setTitle] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<PageError | null>(null);
  const [created, setCreated] = useState(false);

  const dateFormatter = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  useEffect(() => {
    document.title = t("admin.elections.heading");
  }, [t]);

  /* Retry is a user action, so the state changes here instead of inside the
     effect: setting state synchronously in an effect causes extra renders. */
  function retry() {
    setLoading(true);
    setLoadError(null);
    setReloadToken((value) => value + 1);
  }

  useEffect(() => {
    const controller = new AbortController();

    fetchElections(controller.signal)
      .then((data) => setElections(data.elections))
      .catch((error: unknown) => {
        // Cleanup aborted the request (unmount or StrictMode): nothing to show.
        if (error instanceof Error && error.name === "AbortError") return;

        // The session expired: clear it so RequireAuth redirects to /login.
        if (error instanceof ApiError && error.status === 401) {
          void logout();
          return;
        }
        setLoadError(describeError(error, "load"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [reloadToken, logout]);

  function formatDate(value: string): string {
    return dateFormatter.format(new Date(value));
  }

  async function handleCreate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    setCreated(false);
    setSubmitting(true);

    try {
      const { election } = await createElectionRequest({
        title: title.trim(),
        // Empty fields mean "not set yet", not an invalid date.
        opensAt: opensAt === "" ? null : opensAt,
        closesAt: closesAt === "" ? null : closesAt,
      });

      setElections((list) => [election, ...list]);
      setTitle("");
      setOpensAt("");
      setClosesAt("");
      setCreated(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        return;
      }
      setFormError(describeError(error, "create"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="elections">
      <div className="elections__content">
        <header className="elections__header">
          <div className="elections__topbar">
            <Link className="elections__back" to="/admin">
              <span aria-hidden="true">←</span> {t("admin.backToPanel")}
            </Link>
            <LanguageSwitcher />
          </div>
          <h1 className="elections__title">{t("admin.elections.heading")}</h1>
        </header>

        <form className="elections__form" onSubmit={handleCreate} aria-busy={submitting}>
          <h2 className="elections__form-title">{t("admin.elections.newTitle")}</h2>

          {formError !== null && (
            <p className="elections__error" role="alert">
              {t(formError.key, formError.values)}
            </p>
          )}
          {created && (
            <p className="elections__notice" role="status">
              {t("admin.elections.created")}
            </p>
          )}

          <label className="elections__field">
            <span>{t("admin.elections.titleLabel")}</span>
            <input
              type="text"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("admin.elections.titlePlaceholder")}
              maxLength={200}
              required
              disabled={submitting}
            />
          </label>

          <div className="elections__dates">
            <label className="elections__field">
              <span>{t("admin.elections.opensAt")}</span>
              <input
                type="datetime-local"
                name="opensAt"
                value={opensAt}
                onChange={(event) => setOpensAt(event.target.value)}
                disabled={submitting}
              />
            </label>

            <label className="elections__field">
              <span>{t("admin.elections.closesAt")}</span>
              <input
                type="datetime-local"
                name="closesAt"
                value={closesAt}
                min={opensAt === "" ? undefined : opensAt}
                onChange={(event) => setClosesAt(event.target.value)}
                disabled={submitting}
              />
            </label>
          </div>

          <p className="elections__hint">{t("admin.elections.datesHint")}</p>

          <button type="submit" className="elections__submit" disabled={submitting}>
            {submitting ? t("admin.elections.creating") : t("admin.elections.create")}
          </button>
        </form>

        <section className="elections__list-section">
          <h2 className="elections__form-title">{t("admin.elections.listTitle")}</h2>

          {loadError !== null && (
            <div className="elections__error" role="alert">
              <p>{t(loadError.key, loadError.values)}</p>
              <button type="button" className="elections__retry" onClick={retry}>
                {t("admin.elections.retry")}
              </button>
            </div>
          )}

          {loading && <p className="elections__hint">{t("common.loading")}</p>}

          {!loading && loadError === null && elections.length === 0 && (
            <p className="elections__empty">{t("admin.elections.empty")}</p>
          )}

          {elections.length > 0 && (
            <ul className="elections__list">
              {elections.map((election) => (
                <li key={election.id} className="elections__item">
                  <div>
                    <h3 className="elections__item-title">{election.title}</h3>
                    <p className="elections__item-dates">
                      {election.opensAt === null && election.closesAt === null ? (
                        t("admin.elections.noDates")
                      ) : (
                        <>
                          {election.opensAt !== null && (
                            <span>
                              {t("admin.elections.opensAtValue", {
                                date: formatDate(election.opensAt),
                              })}
                            </span>
                          )}
                          {election.closesAt !== null && (
                            <span>
                              {t("admin.elections.closesAtValue", {
                                date: formatDate(election.closesAt),
                              })}
                            </span>
                          )}
                        </>
                      )}
                    </p>
                  </div>

                  <span className={`elections__status elections__status--${election.status}`}>
                    {t(STATUS_KEYS[election.status])}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
