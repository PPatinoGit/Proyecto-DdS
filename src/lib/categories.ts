/*
  Automatic categorization of free-text questionnaire questions.

  Keywords are stored without diacritics and compared against a normalized
  copy of the question, so "Presupuesto" and "presupuesto" match the same rule.
  Spanish is the source language; English and Russian keywords make the same
  function useful for questionnaires written in any interface language.
*/

import type { CategoryKey } from "./types.js";

/** Canonical keys, in priority order: earlier categories win a tie. */
export const CATEGORY_KEYS: readonly CategoryKey[] = [
  "finance",
  "operations",
  "environment",
  "marketing",
  "people",
  "technology",
  "legal",
  "general",
];

type KeywordRule = {
  category: Exclude<CategoryKey, "general">;
  words: string[];
};

const KEYWORD_RULES: KeywordRule[] = [
  {
    category: "finance",
    words: [
      "presupuesto", "finanza", "financier", "coste", "costo", "factura",
      "impuesto", "ingreso", "gasto", "auditoria", "budget", "invoice",
      "tax", "revenue", "expense", "finance", "бюджет", "финанс", "налог",
      "деньг", "доход", "расход", "счет", "аудит",
    ],
  },
  {
    category: "operations",
    words: [
      "operacion", "proceso", "logistica", "inventario", "produccion",
      "calidad", "proveedor", "almacen", "operation", "process", "logistic",
      "inventory", "production", "quality", "supplier", "warehouse",
      "операц", "процесс", "логист", "склад", "постав", "производств", "качеств",
    ],
  },
  {
    category: "environment",
    words: [
      "medio ambiente", "ambiental", "sostenibilidad", "reciclaje", "emision",
      "energia", "contaminacion", "environment", "sustainab", "recycl",
      "emission", "energy", "pollution", "эколог", "сред", "переработ",
      "выброс", "энерг", "загрязн",
    ],
  },
  {
    category: "marketing",
    words: [
      "marketing", "publicidad", "cliente", "marca", "venta", "campana",
      "redes sociales", "advertis", "brand", "campaign", "customer", "sales",
      "social media", "маркетинг", "реклам", "клиент", "бренд", "продаж",
      "кампан",
    ],
  },
  {
    category: "people",
    words: [
      "recurso humano", "personal", "empleado", "salario", "contratacion",
      "capacitacion", "rrhh", "employee", "salary", "hiring", "training",
      "human resource", "staff", "сотрудник", "зарплат", "кадр", "обуч",
      "персонал",
    ],
  },
  {
    category: "technology",
    words: [
      "tecnologia", "software", "sistema", "datos", "seguridad", "servidor",
      "aplicacion", "technology", "software", "data", "security", "server",
      "application", "database", "технолог", "программ", "данн", "безопас",
      "сервер", "систем", "прилож",
    ],
  },
  {
    category: "legal",
    words: [
      "legal", "ley", "normativa", "contrato", "cumplimiento", "law",
      "regulation", "compliance", "contract", "прав", "закон", "норматив",
      "договор", "соответств",
    ],
  },
];

/**
 * Lowercase, drop diacritics and punctuation, keep Unicode letters (Cyrillic
 * included). Removing diacritics turns "й" into "и", so Russian keywords are
 * written in that same folded form.
 */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the best matching category. Every keyword found adds one point, so
 * a longer, more specific question wins over a single generic word.
 */
export function categorizeQuestion(body: string): CategoryKey {
  const text = normalize(body);
  if (text === "") return "general";

  let best: CategoryKey = "general";
  let bestScore = 0;

  for (const rule of KEYWORD_RULES) {
    const score = rule.words.reduce(
      (total, word) => total + (text.includes(word) ? 1 : 0),
      0,
    );
    /* Strictly greater: ties keep the earlier rule in KEYWORD_RULES. */
    if (score > bestScore) {
      best = rule.category;
      bestScore = score;
    }
  }

  return best;
}

/** Dictionary key for a category label; all three languages define it. */
export function categoryLabelKey(category: CategoryKey): `category.${CategoryKey}` {
  return `category.${category}`;
}
