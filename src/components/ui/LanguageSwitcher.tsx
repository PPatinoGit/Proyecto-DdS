import { isLanguage, LANGUAGES } from "../../i18n";
import { LANGUAGE_LABELS } from "../../i18n/language-labels";
import { useI18n } from "../../i18n/i18n-context";
import "./LanguageSwitcher.css";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="language-switcher">
      <span className="language-switcher__label">{t("common.language")}</span>
      <select
        className="language-switcher__select"
        value={language}
        onChange={(event) => {
          const next = event.target.value;
          if (isLanguage(next)) setLanguage(next);
        }}
      >
        {LANGUAGES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LANGUAGE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
