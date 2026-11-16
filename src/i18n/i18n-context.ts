// ---------------------------------------------------------------------------
// i18n context and the hook that reads it.
//
// The provider component lives in I18nProvider.tsx: React Fast Refresh needs
// a module that exports components only.
// ---------------------------------------------------------------------------

import { createContext, useContext } from "react";
import type { Language, TranslateValues, TranslationKey } from "./index";

export type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, values?: TranslateValues) => string;
};

/** null means "no provider above": useI18n turns that into a clear error. */
export const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Reads the current language and the translate function.
 *
 * @throws {Error} when used outside <I18nProvider>.
 */
export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (value === null) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return value;
}
