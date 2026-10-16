export interface CalendarRow {
  /** 1-based line in the uploaded text (the header is line 1). */
  line: number;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  theme: string;
  sponsor: string;
  locked: boolean;
  notes: string;
}

export interface RowError {
  line: number;
  message: string;
}

export interface ParsedCalendar {
  rows: CalendarRow[];
  errors: RowError[];
}

export const CSV_HEADER = "date,theme,sponsor,locked,notes";
export const CSV_TEMPLATE = `${CSV_HEADER}\n2026-04-10,Bluey Night,Harbor Credit Union,no,Kids run the bases after the game\n2026-04-17,Fireworks Friday,,no,\n2026-05-02,Star Wars Night,Gulf Coast Dental,yes,Sponsor contract signed\n`;
export const MAX_ROWS = 200;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Splits delimited text into records. Handles quoted fields, doubled quotes, and line breaks inside quotes. */
export function splitRecords(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === "") inQuotes = true;
    else if (c === delimiter) {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      out.push(record);
      record = [];
    } else field += c;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    out.push(record);
  }
  return out;
}

function pickDelimiter(headerLine: string): string {
  const counts = [",", "\t", ";"].map((d) => [d, headerLine.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0]![0];
}

/** Accepts YYYY-MM-DD and M/D/YYYY (or M/D/YY). Returns the ISO date, or null for anything that is not a real date. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s))) {
    m = Number(hit[1]);
    d = Number(hit[2]);
    y = hit[3]!.length === 2 ? 2000 + Number(hit[3]) : Number(hit[3]);
  } else return null;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const TRUE_WORDS = new Set(["yes", "y", "true", "1", "x", "locked", "lock"]);
const FALSE_WORDS = new Set(["", "no", "n", "false", "0", "unlocked"]);

export function parseLocked(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  return null;
}

export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export const weekdayName = (iso: string): string => WEEKDAYS[weekdayIndex(iso)]!;

/** Good rows are returned even when others fail; each failure names its line. */
export function parseCalendar(text: string): ParsedCalendar {
  const rows: CalendarRow[] = [];
  const errors: RowError[] = [];
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.trim() === "") return { rows, errors: [{ line: 1, message: "The file is empty. Add a header row: date,theme,sponsor,locked,notes." }] };
  const records = splitRecords(text, pickDelimiter(firstLine));
  const header = (records[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name);
  const [cDate, cTheme, cSponsor, cLocked, cNotes] = ["date", "theme", "sponsor", "locked", "notes"].map(col) as [number, number, number, number, number];
  if (cDate < 0 || cTheme < 0) {
    return { rows, errors: [{ line: 1, message: "The first row must be a header with at least date and theme columns (date,theme,sponsor,locked,notes)." }] };
  }
  const get = (rec: string[], i: number): string => (i >= 0 ? (rec[i] ?? "").trim() : "");
  for (let r = 1; r < records.length; r++) {
    const rec = records[r]!;
    const line = r + 1;
    if (rec.every((f) => f.trim() === "")) continue;
    if (rows.length >= MAX_ROWS) {
      errors.push({ line, message: `Only the first ${MAX_ROWS} nights are read. This row was skipped.` });
      continue;
    }
    const date = parseDate(get(rec, cDate));
    if (!date) {
      errors.push({ line, message: `"${get(rec, cDate)}" is not a date. Use 2026-04-10 or 4/10/2026.` });
      continue;
    }
    const theme = get(rec, cTheme);
    if (theme === "") {
      errors.push({ line, message: "The theme is empty." });
      continue;
    }
    const locked = parseLocked(get(rec, cLocked));
    if (locked === null) {
      errors.push({ line, message: `"${get(rec, cLocked)}" in the locked column is not yes or no.` });
      continue;
    }
    rows.push({ line, date, theme: theme.slice(0, 120), sponsor: get(rec, cSponsor).slice(0, 80), locked, notes: get(rec, cNotes).slice(0, 300) });
  }
  if (rows.length === 0 && errors.length === 0) errors.push({ line: 1, message: "No nights found under the header." });
  return { rows, errors };
}

/** One CSV field, quoted when needed. */
export function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
