import { CSV_HEADER, CSV_HEADER_VENUE, csvField } from "../calendar/csv";

export interface ExportRow {
  date: string;
  theme: string;
  sponsor: string;
  locked: boolean;
  notes: string;
  /** The rating in words ("Strong fit"), for the spreadsheet. */
  fit?: string;
}

/** A spreadsheet runs a cell that starts with = + - @ tab or CR as a formula. Text columns get a leading apostrophe, which it shows as plain text. */
export const safeCell = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function exportCsv(rows: readonly ExportRow[], kind?: "club" | "venue"): string {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const withFit = rows.some((r) => r.fit !== undefined);
  const lines = sorted.map((r) => [r.date, safeCell(r.theme), safeCell(r.sponsor), r.locked ? "yes" : "no", safeCell(r.notes), ...(withFit ? [safeCell(r.fit ?? "")] : [])].map(csvField).join(","));
  return `${kind === "venue" ? CSV_HEADER_VENUE : CSV_HEADER}${withFit ? ",fit" : ""}\r\n${lines.join("\r\n")}\r\n`;
}
