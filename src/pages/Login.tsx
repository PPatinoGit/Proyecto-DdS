/*
 Login page.

 Every visible text comes from the i18n dictionaries: this file only knows
 translation keys, never sentences.
*/

import { useEffect, useState, type SubmitEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../i18n/i18n-context";
import type { TranslateValues, TranslationKey } from "../i18n";
import { LanguageSwitcher } from "../components/ui/LanguageSwitcher";
import "./Login.css";

type LoginError = {
  key: TranslationKey;
  /** Whether the inputs should look invalid. */
  fields: boolean;
  /** Values for placeholders such as {code}. */
  values?: TranslateValues;
};

/* Maps the API error to a translation key; the text lives in the dictionaries. */
function describeError(error: unknown): LoginError {
  if (!(error instanceof ApiError)) {
    return { key: "login.errors.unexpected", fields: false };
  }

  switch (error.code) {
    case "invalid_credentials":
      return { key: "login.errors.invalidCredentials", fields: true };
    case "invalid_input":
      return { key: "login.errors.invalidInput", fields: true };
    case "network_error":
      return { key: "login.errors.network", fields: false };
    default:
      break;
  }

  if (error.status >= 500) {
    return { key: "login.errors.server", fields: false };
  }
  return {
    key: "login.errors.unexpectedCode",
    fields: false,
    values: { code: error.code },
  };
}

/*
 RequireAuth sends { from: "/some/path" } when it redirects here. Only
 internal paths are accepted: "//evil.example" would be protocol-relative
 and navigate away from the app.
*/
function redirectTarget(state: unknown): string {
  if (typeof state === "object" && state !== null && "from" in state) {
    const from = (state as { from?: unknown }).from;
    if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) {
      return from;
    }
  }
  return "/admin";
}

export function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const target = redirectTarget(location.state);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<LoginError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Keep the browser tab title in the selected language.
  useEffect(() => {
    document.title = t("login.title");
  }, [t]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    // Clear the previous error so the message never stays stale.
    setError(null);
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      // "replace" removes /login from the history: Back does not return here.
      navigate(target, { replace: true });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <div className="login__toolbar">
        <LanguageSwitcher />
      </div>

      <form className="login__card" onSubmit={handleSubmit} aria-busy={submitting}>
        <h1 className="login__title">{t("login.title")}</h1>
        <p className="login__subtitle">{t("login.subtitle")}</p>

        {error !== null && (
          <p className="login__error" role="alert">
            {t(error.key, error.values)}
          </p>
        )}

        <label className="login__field">
          <span>{t("login.email")}</span>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
            autoFocus
            disabled={submitting}
            aria-invalid={error?.fields ?? false}
          />
        </label>

        <label className="login__field">
          <span>{t("login.password")}</span>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            maxLength={200}
            required
            disabled={submitting}
            aria-invalid={error?.fields ?? false}
          />
        </label>

        <button type="submit" className="login__submit" disabled={submitting}>
          {submitting ? t("login.submitting") : t("login.submit")}
        </button>
      </form>
    </main>
  );
}
