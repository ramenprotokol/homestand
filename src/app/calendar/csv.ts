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

/** One body row as typed, before any checking. `line` matches the line numbers in `errors` and `warnings`. */
export interface RawRow {
  line: number;
  date: string;
  theme: string;
  sponsor: string;
  locked: string;
  notes: string;
}

export interface ParsedCalendar {
  rows: CalendarRow[];
  /** Rows that cannot be used; Check skips them. */
  errors: RowError[];
  /** Rows that are used but worth a second look (two nights on one date). */
  warnings: RowError[];
  /** One-line notes about how the file was read ("Read dates as day/month because of 25/4/2027"). */
  notes: string[];
  /** True when the dates in the file were read day first. */
  dayFirst: boolean;
  /** Every body row as typed, for an editor to show; empty when the header is not usable. */
  raw: RawRow[];
  /** False when the first row is not a usable header (nothing below it was read). */
  headerOk: boolean;
}

export const CSV_HEADER = "date,theme,sponsor,locked,notes";
/** A venue run's exports call the second column "act". */
export const CSV_HEADER_VENUE = "date,act,sponsor,locked,notes";
export const CSV_TEMPLATE = `${CSV_HEADER}\n2027-04-09,Bluey Night,Harbor Credit Union,no,Kids run the bases after the game\n2027-04-16,Fireworks Friday,,no,\n2027-05-07,Star Wars Night,Gulf Coast Dental,yes,Sponsor contract signed\n`;
export const MAX_ROWS = 200;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Splits delimited text into records. Handles quoted fields, doubled quotes, and line breaks inside quotes. */
export function splitRecords(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\u{FEFF}/u, "");
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


const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * Accepts YYYY-MM-DD and M/D/YYYY (or M/D/YY; D/M/YYYY when `dayFirst`). Returns the ISO date, or null for anything that is not a real date.
 * Any real year from 1900 on is a date: whether it is in the past is a separate note, not a parse failure.
 */
export function parseDate(raw: string, dayFirst = false): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = SLASH_DATE.exec(s))) {
    [m, d] = dayFirst ? [Number(hit[2]), Number(hit[1])] : [Number(hit[1]), Number(hit[2])];
    y = hit[3]!.length === 2 ? 2000 + Number(hit[3]) : Number(hit[3]);
  } else return null;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "Oct 4, 2027" for 2027-10-04. */
export function prettyDate(iso: string): string {
  return `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
}

/**
 * How to write a date, ending every date message in the app: "Use 2027-04-10 or 4/10/2027." (10/4/2027 once the calendar is read
 * day-first). The example comes from the caller (samples.ts `dateExample`, the next-season one), so it is never in the past;
 * with no example the hint names the formats only.
 */
export function dateHint(example?: string, dayFirst = false): string {
  if (!example) return dayFirst ? "Use YYYY-MM-DD or D/M/YYYY." : "Use YYYY-MM-DD or M/D/YYYY.";
  const [y, m, d] = [example.slice(0, 4), Number(example.slice(5, 7)), Number(example.slice(8, 10))];
  return `Use ${example} or ${dayFirst ? `${d}/${m}/${y}` : `${m}/${d}/${y}`}.`;
}

/**
 * Month first (4/10/2027 is April 10) unless the file itself says otherwise: any date whose first number is above 12 can only be
 * day/month, so the whole file is read day/month. With no such date, 10/4/2027 stays month first but the reading is shown.
 */
export function detectDateOrder(dates: readonly string[]): { dayFirst: boolean; note: string | null } {
  let dayEvidence: string | null = null;
  let monthEvidence: string | null = null;
  let ambiguous: string | null = null;
  for (const raw of dates) {
    const hit = SLASH_DATE.exec(raw.trim());
    if (!hit) continue;
    const [a, b] = [Number(hit[1]), Number(hit[2])];
    if (a > 12 && b <= 12) dayEvidence ??= raw.trim();
    else if (b > 12 && a <= 12) monthEvidence ??= raw.trim();
    else if (a <= 12 && b <= 12 && a !== b) ambiguous ??= raw.trim();
  }
  if (dayEvidence && monthEvidence) return { dayFirst: false, note: `These dates mix day/month and month/day order (${dayEvidence} and ${monthEvidence}). They are read as month/day, so the others are marked.` };
  if (dayEvidence) return { dayFirst: true, note: `Read dates as day/month because of ${dayEvidence}` };
  if (ambiguous) return { dayFirst: false, note: `Read ${ambiguous} as ${prettyDate(parseDate(ambiguous) ?? "2000-01-01")}` };
  return { dayFirst: false, note: null };
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


/**
 * Good rows are returned even when others fail; each failure names its line. This is the one reader for a calendar: Check, the
 * "nights ready" count and the per-row messages in the editor all come from it, so they cannot disagree.
 */
export function parseCalendar(text: string, example?: string): ParsedCalendar {
  const rows: CalendarRow[] = [];
  const errors: RowError[] = [];
  const warnings: RowError[] = [];
  const raw: RawRow[] = [];
  const bail = (message: string): ParsedCalendar => ({ rows, errors: [{ line: 1, message }], warnings, notes: [], dayFirst: false, raw, headerOk: false });
  const firstLine = text.replace(/^\u{FEFF}/u, "").split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.trim() === "") return bail("The file is empty. Add a header row: date,theme,sponsor,locked,notes.");
  const records = splitRecords(text, pickDelimiter(firstLine));
  const header = (records[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name);
  const [cDate, cThemeCol, cSponsor, cLocked, cNotes] = ["date", "theme", "sponsor", "locked", "notes"].map(col) as [number, number, number, number, number];
  const cTheme = cThemeCol >= 0 ? cThemeCol : col("act"); // a venue calendar may call the column "act"
  if (cDate < 0 || cTheme < 0) {
    const missing = cDate < 0 && cTheme < 0 ? "date or theme column" : cDate < 0 ? "date column" : "theme column";
    return bail(`The first row must be a header with at least date and theme columns (date,theme,sponsor,locked,notes). This one has no ${missing}.`);
  }
  const get = (rec: string[], i: number): string => (i >= 0 ? (rec[i] ?? "").trim() : "");
  const body: Array<{ line: number; rec: string[] }> = [];
  for (let r = 1; r < records.length; r++) if (!records[r]!.every((f) => f.trim() === "")) body.push({ line: r + 1, rec: records[r]! });
  const order = detectDateOrder(body.map((b) => get(b.rec, cDate)));
  for (const { line, rec } of body) {
    raw.push({ line, date: get(rec, cDate), theme: get(rec, cTheme), sponsor: get(rec, cSponsor), locked: get(rec, cLocked), notes: get(rec, cNotes) });
    if (rows.length >= MAX_ROWS) {
      errors.push({ line, message: `Only the first ${MAX_ROWS} nights are read. This row was skipped.` });
      continue;
    }
    const date = parseDate(get(rec, cDate), order.dayFirst);
    if (!date) {
      errors.push({ line, message: `"${get(rec, cDate)}" is not a date. ${dateHint(example, order.dayFirst)}` });
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
  // Two nights on one date is allowed (a doubleheader, a day and a night game), so it is a note on each row, never a failure.
  const byDate = new Map<string, number[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r.line]);
  for (const [date, lines] of byDate) {
    if (lines.length < 2) continue;
    const count = lines.length === 2 ? "Two" : String(lines.length);
    for (const line of lines) warnings.push({ line, message: `${count} nights on ${prettyDate(date)}` });
  }
  warnings.sort((a, b) => a.line - b.line);
  if (rows.length === 0 && errors.length === 0) errors.push({ line: 1, message: "No nights found under the header." });
  return { rows, errors, warnings, notes: order.note ? [order.note] : [], dayFirst: order.dayFirst, raw, headerOk: true };
}

/** Rows in date order (a stable sort, so two nights on one date keep the order they were typed in). */
export function sortRowsByDate<T extends { date: string }>(rows: readonly T[]): T[] {
  return rows.map((r, i) => [r, i] as const).sort((a, b) => a[0].date.localeCompare(b[0].date) || a[1] - b[1]).map(([r]) => r);
}

/** One CSV field, quoted when needed. */
export function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
