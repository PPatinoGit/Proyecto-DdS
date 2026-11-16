/* 
 Login page.

 Texts are hardcoded in Spanish for now: the i18n block moves them to
 src/i18n/ and this file will read them through a translation hook.
*/

import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import "./Login.css";

/** Turns the API error into a message plus whether the fields should look invalid. */
function describeError(error: unknown): { message: string; fields: boolean } {
  if (!(error instanceof ApiError)) {
    return { message: "Ocurrió un error inesperado. Inténtalo de nuevo.", fields: false };
  }

  switch (error.code) {
    case "invalid_credentials":
      return { message: "Correo o contraseña incorrectos.", fields: true };
    case "invalid_input":
      return { message: "Revisa el correo electrónico y la contraseña.", fields: true };
    case "network_error":
      return {
        message: "No se pudo conectar con el servidor. Comprueba tu conexión.",
        fields: false,
      };
    default:
      break;
  }

  if (error.status >= 500) {
    return { message: "El servidor tuvo un problema. Inténtalo más tarde.", fields: false };
  }
  return { message: `No se pudo iniciar sesión (${error.code}).`, fields: false };
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ message: string; fields: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    // Clear the previous error so the message never stays stale.
    setError(null);
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      // "replace" removes /login from the history: Back does not return here.
      navigate("/admin", { replace: true });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <form className="login__card" onSubmit={handleSubmit} aria-busy={submitting}>
        <h1 className="login__title">Iniciar sesión</h1>
        <p className="login__subtitle">Sistema de votación y cuestionarios</p>

        {error !== null && (
          <p className="login__error" role="alert">
            {error.message}
          </p>
        )}

        <label className="login__field">
          <span>Correo electrónico</span>
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
          <span>Contraseña</span>
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
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}