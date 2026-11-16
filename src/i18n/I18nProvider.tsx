// ---------------------------------------------------------------------------
// Stores the selected language and exposes the translate function.
//
// It lives in its own file because React Fast Refresh requires a module to
// export components only; the hook and the context are in i18n-context.ts.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { isLanguage, translate, type Language, type TranslateValues } from "./index";
import type { TranslationKey } from "./index";
import { I18nContext } from "./i18n-context";

const STORAGE_KEY = "app.language";

/** Stored choice first, then the browser languages, then Spanish. */
function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Storage can be blocked (private mode); fall back to the browser.
  }

  const tags = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    if (tag.startsWith("es")) return "es";
    if (tag.startsWith("ru")) return "ru";
    if (tag.startsWith("en")) return "en";
  }
  return "es";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(detectLanguage);

  // Keep the document language and the stored preference in sync.
  // <html lang> is what screen readers and spell checkers use.
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Not fatal: the choice simply will not persist.
    }
  }, [language]);

  const t = useCallback(
    (key: TranslationKey, values?: TranslateValues) => translate(language, key, values),
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
