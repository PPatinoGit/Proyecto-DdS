/*
 Admin panel home.

 For now it only proves the session works and shows where the three modules
 will live. Each card is a placeholder for a later block.
*/

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../i18n/i18n-context";
import type { TranslationKey } from "../../i18n";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { FullScreenLoader } from "../../components/ui/FullScreenLoader";
import "./AdminHome.css";

/* Shape of one card. Title and description are keys, never sentences:
   the text belongs to the dictionaries. */
type Section = {
  id: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  /** Present once the section has a page; missing sections are "coming soon". */
  to?: string;
};

/* `satisfies` keeps the literal types of the keys (so a typo fails to
   compile) while still checking that every entry follows `Section`. */
const SECTIONS = [
  {
    id: "elections",
    titleKey: "admin.sections.elections.title",
    descriptionKey: "admin.sections.elections.description",
    to: "/admin/elections",
  },
  {
    id: "voters",
    titleKey: "admin.sections.voters.title",
    descriptionKey: "admin.sections.voters.description",
    to: "/admin/voters",
  },
  {
    id: "emails",
    titleKey: "admin.sections.emails.title",
    descriptionKey: "admin.sections.emails.description",
    to: "/admin/emails",
  },
  {
    id: "questionnaires",
    titleKey: "admin.sections.questionnaires.title",
    descriptionKey: "admin.sections.questionnaires.description",
    to: "/admin/questionnaires",
  },
] as const satisfies readonly Section[];

export function AdminHome() {
  const { user, logout } = useAuth();
  const { t } = useI18n();

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  // Keep the browser tab title in the selected language.
  useEffect(() => {
    document.title = t("admin.title");
  }, [t]);

  async function handleLogout() {
    if (loggingOut) return;

    setLogoutFailed(false);
    setLoggingOut(true);

    try {
      await logout();
      // No state update on success: RequireAuth sees the anonymous status and
      // redirects to /login, which unmounts this page.
    } catch {
      setLogoutFailed(true);
      setLoggingOut(false);
    }
  }

  // RequireAuth already guarantees a user; this keeps the type honest and
  // covers a render between the status change and the redirect.
  if (user === null) return <FullScreenLoader />;

  return (
    <main className="admin">
      <header className="admin__header">
        <div>
          <h1 className="admin__title">{t("admin.title")}</h1>
          <p className="admin__welcome">{t("admin.welcome", { name: user.name })}</p>
        </div>

        <div className="admin__actions">
          <LanguageSwitcher />
          <button
            type="button"
            className="admin__logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? t("admin.loggingOut") : t("admin.logout")}
          </button>
        </div>
      </header>

      {logoutFailed && (
        <p className="admin__error" role="alert">
          {t("admin.logoutError")}
        </p>
      )}

      <ul className="admin__sections">
        {SECTIONS.map((section) => {
          const content = (
            <>
              <h2 className="admin__card-title">{t(section.titleKey)}</h2>
              <p className="admin__card-text">{t(section.descriptionKey)}</p>
            </>
          );

          return (
            <li key={section.id} className="admin__card">
              {"to" in section ? (
                <Link className="admin__card-link" to={section.to}>
                  {content}
                  <span className="admin__card-action">
                    {t("admin.manage")} <span aria-hidden="true">→</span>
                  </span>
                </Link>
              ) : (
                <>
                  <span className="admin__badge">{t("admin.comingSoon")}</span>
                  {content}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
