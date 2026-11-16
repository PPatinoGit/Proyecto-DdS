// Compares every dictionary against src/i18n/es.json.
//
// The TypeScript types already reject missing keys at build time. This script
// adds what types cannot check: empty values, extra keys and placeholders.
//
// Usage: npm run i18n:check
import { readFileSync } from "node:fs";

const languages = ["es", "en", "ru"];
const base = "es";

const dictionaries = Object.fromEntries(
  languages.map((lang) => [
    lang,
    JSON.parse(readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), "utf8")),
  ]),
);

const placeholders = (text) =>
  [...text.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .sort()
    .join(",");

const baseKeys = Object.keys(dictionaries[base]);
const problems = [];

for (const lang of languages) {
  const dictionary = dictionaries[lang];

  for (const key of baseKeys) {
    const text = dictionary[key];

    if (text === undefined) {
      problems.push(`${lang}: missing key "${key}"`);
    } else if (text.trim() === "") {
      problems.push(`${lang}: empty value for "${key}"`);
    } else if (placeholders(text) !== placeholders(dictionaries[base][key])) {
      problems.push(`${lang}: placeholders differ in "${key}"`);
    }
  }

  for (const key of Object.keys(dictionary)) {
    if (!baseKeys.includes(key)) {
      problems.push(`${lang}: unknown key "${key}"`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`i18n OK: ${baseKeys.length} keys in ${languages.length} languages`);
}
