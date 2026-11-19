/*
  Audit log page.

  Shows the most recent recorded actions with who caused them and which object
  they affected. Action names are machine codes from the API and are translated
  with dictionary keys; unknown codes are displayed verbatim.
*/

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../i18n/i18n-context";
import { dictionaries, type TranslationKey } from "../../i18n";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { fetchAudit } from "../../lib/audit-api";
import type { AuditEvent } from "../../lib/types";
import "./Audit.css";

type PageError = { key: TranslationKey };

function describeError(error: unknown): PageError {
  if (error instanceof ApiError && error.status >= 500) {
    return { key: "admin.audit.errors.server" };
  }
  return { key: "admin.audit.errors.load" };
}

const LIMITS = [20, 50, 100, 200] as const;

export function Audit() {
  const { logout } = useAuth();
  const { language, t } = useI18n();
  const [limit, setLimit] = useState<number>(50);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<PageError | null>(null);
  const [reload, setReload] = useState(0);

  const date = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  useEffect(() => {
    document.title = t("admin.audit.heading");
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();

    fetchAudit(limit, controller.signal)
      .then((data) => {
        setEvents(data.events);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        if (cause instanceof ApiError && cause.status === 401) {
          void logout();
          return;
        }
        setError(describeError(cause));
      });

    return () => controller.abort();
  }, [limit, logout, reload]);

  function actorLabel(event: AuditEvent): string {
    if (event.actorType === "system") return t("admin.audit.actor.system");
    if (event.actorId === null) return t("admin.audit.actor.unknown");
    if (event.actorType === "admin") {
      return t("admin.audit.actor.admin", { id: event.actorId });
    }
    return t("admin.audit.actor.recipient", { id: event.actorId });
  }

  function actionLabel(event: AuditEvent): string {
    const key = `audit.action.${event.action}`;
    return key in dictionaries[language]
      ? t(key as TranslationKey)
      : t("admin.audit.action.unknown", { action: event.action });
  }

  return (
    <main className="audit">
      <div className="audit__content">
        <header className="audit__header">
          <div className="audit__topbar">
            <Link className="audit__back" to="/admin">
              <span aria-hidden="true">←</span> {t("admin.backToPanel")}
            </Link>
            <LanguageSwitcher />
          </div>
          <h1 className="audit__title">{t("admin.audit.heading")}</h1>
        </header>

        <section className="audit__panel">
          <label className="audit__field">
            <span>{t("admin.audit.limitLabel")}</span>
            <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              {LIMITS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </section>

        {error !== null && (
          <div className="audit__panel audit__error" role="alert">
            <p>{t(error.key)}</p>
            <button type="button" className="audit__retry" onClick={() => setReload((value) => value + 1)}>
              {t("admin.audit.retry")}
            </button>
          </div>
        )}

        {events === null && error === null && (
          <p className="audit__hint">{t("common.loading")}</p>
        )}

        {events !== null && events.length === 0 && (
          <div className="audit__panel">
            <p className="audit__hint">{t("admin.audit.empty")}</p>
          </div>
        )}

        {events !== null && events.length > 0 && (
          <section className="audit__panel audit__table-panel">
            <table className="audit__table">
              <thead>
                <tr>
                  <th scope="col">{t("admin.audit.table.date")}</th>
                  <th scope="col">{t("admin.audit.table.actor")}</th>
                  <th scope="col">{t("admin.audit.table.action")}</th>
                  <th scope="col">{t("admin.audit.table.target")}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const parsed = new Date(event.createdAt);
                  return (
                    <tr key={event.id}>
                      <td>{Number.isNaN(parsed.getTime()) ? event.createdAt : date.format(parsed)}</td>
                      <td>{actorLabel(event)}</td>
                      <td>{actionLabel(event)}</td>
                      <td>
                        {event.targetType === null || event.targetId === null
                          ? "—"
                          : t("admin.audit.target", { type: event.targetType, id: event.targetId })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}
