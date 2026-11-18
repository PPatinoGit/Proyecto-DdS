/*
 Voting page reached from the emailed link: /vote/<token>.

 The token is the credential; there is no login here. The page reads the
 ballot, lets the voter choose one option per motion and submits once. It also
 handles the states that can happen before/after the vote: election not open
 yet, closed, invalid link and "already voted".

 All texts come from the dictionaries; API codes become translation keys.
*/

import { useEffect, useMemo, useState, type SubmitEvent } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { useI18n } from "../../i18n/i18n-context";
import type { TranslateValues, TranslationKey } from "../../i18n";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { fetchBallot, submitVoteRequest } from "../../lib/vote-api";
import type { Ballot, VoteReceipt } from "../../lib/types";
import "./VotePage.css";

type PageError = { key: TranslationKey; values?: TranslateValues };
type Phase = "loading" | "ready" | "voted" | "blocked";

const WINDOW_KEYS: Record<string, TranslationKey> = {
  draft: "vote.window.draft",
  upcoming: "vote.window.upcoming",
  closed: "vote.window.closed",
};

const ERROR_KEYS: Record<string, TranslationKey> = {
  invalid_token: "vote.errors.invalidToken",
  network_error: "vote.errors.network",
  database_error: "vote.errors.server",
  incomplete_ballot: "vote.errors.incomplete",
  invalid_input: "vote.errors.incomplete",
  invalid_choice: "vote.errors.invalidChoice",
  already_voted: "vote.errors.alreadyVoted",
  draft: "vote.window.draft",
  upcoming: "vote.window.upcoming",
  closed: "vote.window.closed",
};

function describeError(error: unknown): PageError {
  if (!(error instanceof ApiError)) return { key: "vote.errors.unexpected" };

  if (error.status >= 500) return { key: "vote.errors.server" };
  return { key: ERROR_KEYS[error.code] ?? "vote.errors.unexpected" };
}

export function VotePage() {
  const { token = "" } = useParams();
  const { language, t } = useI18n();

  const [phase, setPhase] = useState<Phase>("loading");
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);
  /* True when the token was already used before this visit (not just now). */
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [error, setError] = useState<PageError | null>(null);
  const [selections, setSelections] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }),
    [language],
  );

  function formatDate(value: string | null): string {
    if (value === null) return "";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : dateFormatter.format(parsed);
  }

  useEffect(() => {
    document.title = t("vote.heading");
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();

    fetchBallot(token, controller.signal)
      .then(({ ballot: data }) => {
        setBallot(data);
        setError(null);

        setAlreadyVoted(data.receipt !== null);
        if (data.receipt !== null) {
          setReceipt(data.receipt);
          setPhase("voted");
        } else if (data.election.window !== "open") {
          setPhase("blocked");
        } else {
          setPhase("ready");
        }
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(describeError(cause));
        setPhase("blocked");
      });

    return () => controller.abort();
  }, [token]);

  const windowKey = ballot === null ? null : WINDOW_KEYS[ballot.election.window];

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || ballot === null || ballot.motions.length === 0) return;

    const votes = ballot.motions.flatMap((motion) => {
      const optionId = selections[motion.id];
      return optionId === undefined ? [] : [{ motionId: motion.id, optionId }];
    });

    if (votes.length !== ballot.motions.length) {
      setError({ key: "vote.errors.incomplete" });
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await submitVoteRequest(token, votes);
      setAlreadyVoted(false);
      setReceipt(result.receipt);
      setPhase("voted");
    } catch (cause) {
      setError(describeError(cause));
      /* A rejected POST can only be retried if the ballot was not consumed. */
      if (cause instanceof ApiError && cause.code === "already_voted") {
        setAlreadyVoted(true);
        setReceipt(null);
        setPhase("blocked");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="vote">
      <div className="vote__card">
        <header className="vote__header">
          <LanguageSwitcher />
          <h1 className="vote__title">{t("vote.heading")}</h1>
        </header>

        {phase === "loading" && <p className="vote__hint">{t("common.loading")}</p>}

        {error !== null && (
          <div className="vote__message vote__message--error" role="alert">
            <p>{t(error.key, error.values)}</p>
            {error.key === "vote.errors.network" && (
              <button
                type="button"
                className="vote__retry"
                onClick={() => window.location.reload()}
              >
                {t("vote.errors.retry")}
              </button>
            )}
          </div>
        )}

        {ballot !== null && (
          <>
            <h2 className="vote__election">{ballot.election.title}</h2>
            <p className="vote__greeting">{t("vote.greeting", { name: ballot.voterName })}</p>

            {ballot.election.opensAt !== null && (
              <p className="vote__hint">{t("vote.opensAt", { date: formatDate(ballot.election.opensAt) })}</p>
            )}
            {ballot.election.closesAt !== null && (
              <p className="vote__hint">{t("vote.closesAt", { date: formatDate(ballot.election.closesAt) })}</p>
            )}
          </>
        )}

        {phase === "blocked" && windowKey !== null && (
          <div className="vote__message vote__message--info" role="status">
            <p>{t(windowKey, { date: formatDate(ballot?.election.opensAt ?? null) })}</p>
          </div>
        )}

        {phase === "ready" && ballot !== null && (
          <form className="vote__form" onSubmit={(event) => void submit(event)}>
            <p className="vote__hint">{t("vote.instructions")}</p>

            {ballot.motions.map((motion, index) => (
              <fieldset key={motion.id} className="vote__motion">
                <legend>{t("vote.motionLabel", { number: index + 1 })}</legend>
                <p className="vote__motion-title">{motion.title}</p>

                <div className="vote__options">
                  {motion.options.map((option) => (
                    <label key={option.id} className="vote__option">
                      <input
                        type="radio"
                        name={`motion-${motion.id}`}
                        value={option.id}
                        checked={selections[motion.id] === option.id}
                        onChange={() =>
                          setSelections((current) => ({ ...current, [motion.id]: option.id }))
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}

            <button type="submit" className="vote__submit" disabled={submitting}>
              {submitting ? t("vote.submitting") : t("vote.submit")}
            </button>
          </form>
        )}

        {phase === "voted" && (
          <section className="vote__done">
            <h2 className="vote__done-title">
              {t(alreadyVoted ? "vote.alreadyTitle" : "vote.confirmTitle")}
            </h2>
            <p>{t(alreadyVoted ? "vote.alreadyText" : "vote.confirmText")}</p>

            {receipt !== null && (
              <>
                <div className="vote__receipt">
                  <h3 className="vote__receipt-title">{t("vote.receiptTitle")}</h3>
                  <ul>
                    {receipt.answers.map((answer) => (
                      <li key={answer.motionTitle}>
                        {t("vote.receiptMotion", {
                          motion: answer.motionTitle,
                          option: answer.optionLabel,
                        })}
                      </li>
                    ))}
                  </ul>
                  <p className="vote__weight">
                    {t("vote.weight", { weight: new Intl.NumberFormat(language).format(receipt.weight) })}
                  </p>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
