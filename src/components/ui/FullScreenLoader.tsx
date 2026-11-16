/*
 Loader shown while the app does not know yet whether there is a session.

 It is rendered full screen so the user never sees the login form for a
 fraction of a second before being sent to the panel (or the other way round).
*/

import { useI18n } from "../../i18n/i18n-context";
import "./FullScreenLoader.css";

export function FullScreenLoader() {
  const { t } = useI18n();

  return (
    <div className="full-screen-loader" role="status">
      <span className="full-screen-loader__spinner" aria-hidden="true" />
      <p className="full-screen-loader__text">{t("common.loading")}</p>
    </div>
  );
}
