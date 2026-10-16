import { CSV_HEADER, csvField } from "../calendar/csv";

export interface ExportRow {
  date: string;
  theme: string;
  sponsor: string;
  locked: boolean;
  notes: string;
}

export function exportCsv(rows: readonly ExportRow[]): string {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const lines = sorted.map((r) => [r.date, r.theme, r.sponsor, r.locked ? "yes" : "no", r.notes].map(csvField).join(","));
  return `${CSV_HEADER}\r\n${lines.join("\r\n")}\r\n`;
}
