import { CSV_HEADER, csvField } from "../calendar/csv";

export interface ExportRow {
  date: string;
  theme: string;
  sponsor: string;
  locked: boolean;
  notes: string;
}

/** A spreadsheet runs a cell that starts with = + - @ tab or CR as a formula. Text columns get a leading apostrophe, which it shows as plain text. */
export const safeCell = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function exportCsv(rows: readonly ExportRow[]): string {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const lines = sorted.map((r) => [r.date, safeCell(r.theme), safeCell(r.sponsor), r.locked ? "yes" : "no", safeCell(r.notes)].map(csvField).join(","));
  return `${CSV_HEADER}\r\n${lines.join("\r\n")}\r\n`;
}
