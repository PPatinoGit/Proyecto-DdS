/*
 Names of the languages, always written in their own language.

 Shared by the UI language switcher and by the email language selector so both
 show exactly the same labels without duplicating strings.
*/

import type { Language } from "./index";

export const LANGUAGE_LABELS: Record<Language, string> = {
  es: "Español",
  en: "English",
  ru: "Русский",
};
