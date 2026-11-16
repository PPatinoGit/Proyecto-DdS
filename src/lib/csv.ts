/*
 CSV parsing and validation for the voter roster.

 Shared by the browser (preview) and the API (import): the same function decides
 what is valid, so the preview can never accept something the server rejects.
 Pure TypeScript on purpose: no Node or DOM APIs.
*/

export const CSV_COLUMNS = ["email", "name", "birthdate", "gender", "weight"] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** Columns that must exist in the header row. */
const REQUIRED_COLUMNS: readonly CsvColumn[] = ["email", "name"];

/** Hard limits, applied before parsing each row. */
export const MAX_CSV_ROWS = 1000;
export const MAX_CSV_CHARS = 2_000_000;

export type CsvFatalCode =
  | "empty_file"
  | "no_rows"
  | "missing_header"
  | "unclosed_quote"
  | "too_many_rows"
  | "file_too_large";

export type CsvFatal = {
  code: CsvFatalCode;
  /** Present for "missing_header". */
  column?: CsvColumn;
  /** Present for "too_many_rows" and "file_too_large". */
  max?: number;
};

export type CsvIssueCode =
  | "required"
  | "too_long"
  | "invalid_email"
  | "duplicate_email"
  | "invalid_birthdate"
  | "birthdate_future"
  | "invalid_weight"
  | "weight_range";

export type CsvIssue = {
  /** 1-based physical line in the file, including the header. */
  line: number;
  field: CsvColumn;
  code: CsvIssueCode;
  max?: number;
  min?: number;
};

/** A normalized row. Values are always usable, even when the row has issues. */
export type VoterCsvRow = {
  line: number;
  email: string;
  name: string;
  birthdate: string | null;
  gender: string | null;
  weight: number;
};

export type VoterCsvResult = {
  rows: VoterCsvRow[];
  issues: CsvIssue[];
  /** Number of data rows, valid or not. */
  totalRows: number;
  fatal: CsvFatal | null;
};

type Field = { value: string; line: number };

/* Minimum weight and maximum name length keep the roster sane. */
const MIN_WEIGHT = 0.01;
const MAX_WEIGHT = 1000;
const MAX_NAME_LENGTH = 200;
const MAX_GENDER_LENGTH = 40;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/*
 Splits the text into records. Quoted fields may contain commas, escaped quotes
 ("") and line breaks; the line number of each field is kept for error messages.
*/
function parseRecords(text: string): { records: Field[][]; unclosedQuote: boolean } {
  const records: Field[][] = [];
  let record: Field[] = [];
  let value = "";
  let line = 1;
  let fieldLine = 1;
  let inQuotes = false;

  const pushField = () => {
    record.push({ value, line: fieldLine });
    value = "";
  };

  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line += 1;
        value += char;
      }
      continue;
    }

    if (char === '"' && value === "") {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
      fieldLine = line;
    } else if (char === "\r") {
      /* Ignore: the newline that usually follows is handled below. */
    } else if (char === "\n") {
      pushRecord();
      line += 1;
      fieldLine = line;
    } else {
      value += char;
    }
  }

  if (inQuotes) return { records, unclosedQuote: true };

  /* A file without a trailing newline still has a last record. */
  if (value !== "" || record.length > 0) pushRecord();

  return { records, unclosedQuote: false };
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parses and validates a voter CSV. Errors never throw: they are returned. */
export function parseVoterCsv(raw: string): VoterCsvResult {
  const empty: VoterCsvResult = { rows: [], issues: [], totalRows: 0, fatal: null };
  const text = raw.replace(/^\uFEFF/, "");

  if (text.length > MAX_CSV_CHARS) {
    return { ...empty, fatal: { code: "file_too_large", max: MAX_CSV_CHARS } };
  }

  const { records, unclosedQuote } = parseRecords(text);
  if (unclosedQuote) return { ...empty, fatal: { code: "unclosed_quote" } };

  const nonEmpty = records.filter((record) =>
    record.some((field) => field.value.trim() !== ""),
  );
  if (nonEmpty.length === 0) return { ...empty, fatal: { code: "empty_file" } };

  const header = nonEmpty[0];
  const columnIndex = new Map<string, number>();
  header.forEach((field, index) => {
    const name = normalizeHeader(field.value);
    if (name !== "" && !columnIndex.has(name)) columnIndex.set(name, index);
  });

  for (const column of REQUIRED_COLUMNS) {
    if (!columnIndex.has(column)) {
      return { ...empty, fatal: { code: "missing_header", column } };
    }
  }

  const dataRecords = nonEmpty.slice(1);
  if (dataRecords.length === 0) return { ...empty, fatal: { code: "no_rows" } };
  if (dataRecords.length > MAX_CSV_ROWS) {
    return { ...empty, fatal: { code: "too_many_rows", max: MAX_CSV_ROWS } };
  }

  const rows: VoterCsvRow[] = [];
  const issues: CsvIssue[] = [];
  const seenEmails = new Set<string>();
  const today = todayIso();

  const cell = (record: Field[], column: CsvColumn): string => {
    const index = columnIndex.get(column);
    return index === undefined ? "" : (record[index]?.value ?? "").trim();
  };

  for (const record of dataRecords) {
    const line = record[0]?.line ?? 1;
    const addIssue = (field: CsvColumn, code: CsvIssueCode, extra?: Partial<CsvIssue>) => {
      issues.push({ line, field, code, ...extra });
    };

    const email = cell(record, "email").toLowerCase();
    if (email === "") {
      addIssue("email", "required");
    } else if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      addIssue("email", "invalid_email");
    } else if (seenEmails.has(email)) {
      addIssue("email", "duplicate_email");
    } else {
      seenEmails.add(email);
    }

    const name = cell(record, "name");
    if (name === "") {
      addIssue("name", "required");
    } else if (name.length > MAX_NAME_LENGTH) {
      addIssue("name", "too_long", { max: MAX_NAME_LENGTH });
    }

    const birthdateText = cell(record, "birthdate");
    let birthdate: string | null = null;
    if (birthdateText !== "") {
      if (!isValidIsoDate(birthdateText)) {
        addIssue("birthdate", "invalid_birthdate");
      } else if (birthdateText > today) {
        addIssue("birthdate", "birthdate_future");
      } else {
        birthdate = birthdateText;
      }
    }

    const genderText = cell(record, "gender");
    let gender: string | null = null;
    if (genderText !== "") {
      if (genderText.length > MAX_GENDER_LENGTH) {
        addIssue("gender", "too_long", { max: MAX_GENDER_LENGTH });
      } else {
        gender = genderText;
      }
    }

    const weightText = cell(record, "weight");
    let weight = 1;
    if (weightText !== "") {
      const parsed = Number(weightText);
      if (!Number.isFinite(parsed)) {
        addIssue("weight", "invalid_weight");
      } else if (parsed < MIN_WEIGHT || parsed > MAX_WEIGHT) {
        addIssue("weight", "weight_range", { min: MIN_WEIGHT, max: MAX_WEIGHT });
      } else {
        weight = parsed;
      }
    }

    rows.push({ line, email, name, birthdate, gender, weight });
  }

  return { rows, issues, totalRows: rows.length, fatal: null };
}

/** CSV used by the "download template" button. */
export const CSV_TEMPLATE =
  "email,name,birthdate,gender,weight\n" +
  "ana@example.com,Ana Pérez,2000-05-14,female,1\n" +
  "luis@example.com,Luis Gómez,1999-11-02,male,2\n";
