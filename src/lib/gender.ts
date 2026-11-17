/*
 Turns the free-text `gender` column of the CSV into a salutation.

 The CSV accepts anything, so the user may write "female", "F", "mujer" or
 "женский". Only two exact categories matter for the greeting; everything else
 (empty, "other", unknown words) falls back to a neutral salutation.
*/

export type Salutation = "female" | "male" | "neutral";

/* Lowercase and trim: "Femenino" and "femenino" must match. */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/*
 Accent-free form, so "männlich" also matches "mannlich".
 Cyrillic is checked in its original form too: NFD turns "й" into "и" plus a
 breve, and stripping that would break "женский".
*/
function fold(value: string): string {
  return normalize(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .normalize("NFC");
}

const FEMALE = new Set([
  "f",
  "female",
  "woman",
  "mujer",
  "femenino",
  "femenina",
  "fem",
  "feminino",
  "feminina",
  "femme",
  "weiblich",
  "ж",
  "женский",
  "женщина",
  "жіноча",
  "жінка",
]);

const MALE = new Set([
  "m",
  "male",
  "man",
  "hombre",
  "masculino",
  "masculina",
  "masc",
  "homme",
  "mannlich",
  "м",
  "мужской",
  "мужчина",
  "чоловіча",
  "чоловік",
]);

/** Returns which greeting the email should use for this gender value. */
export function salutationFor(gender: string | null): Salutation {
  if (gender === null) return "neutral";

  const plain = normalize(gender);
  const folded = fold(gender);
  if (FEMALE.has(plain) || FEMALE.has(folded)) return "female";
  if (MALE.has(plain) || MALE.has(folded)) return "male";
  return "neutral";
}
