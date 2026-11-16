// ---------------------------------------------------------------------------
// Translation core.
//
// This module has no React imports on purpose: the server (email templates)
// can reuse the same dictionaries and the same translate() function.
//
// Spanish is the source of truth. `TranslationKey` is derived from es.json,
// so the compiler rejects any key that does not exist there.
// ---------------------------------------------------------------------------

import es from "./es.json" with { type: "json" };
import en from "./en.json" with { type: "json" };
import ru from "./ru.json" with { type: "json" };

export const LANGUAGES = ["es", "en", "ru"] as const;
export type Language = (typeof LANGUAGES)[number];

export type TranslationKey = keyof typeof es;
type Dictionary = Record<TranslationKey, string>;

/**
 * Every language must contain every key of es.json.
 * If one is missing, this assignment does not compile.
 */
export const dictionaries: Record<Language, Dictionary> = { es, en, ru };

export type TranslateValues = Record<string, string | number>;

/**
 * Returns the text for `key` in `language`, replacing {placeholders}.
 *
 * Missing placeholders are left untouched so the bug is visible instead of
 * silently producing a half-filled sentence.
 */
export function translate(
  language: Language,
  key: TranslationKey,
  values?: TranslateValues,
): string {
  const template = dictionaries[language][key];
  if (values === undefined) return template;

  // Function replacer: a value containing "$&" is treated as literal text.
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  );
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}
