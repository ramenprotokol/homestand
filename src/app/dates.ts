import { weekdayName } from "./calendar/csv";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fri Jun 19": the same short form the magnets use (weekday, month, day). */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${weekdayName(iso).slice(0, 3)} ${MONTHS[m - 1]} ${d}`;
}

/** "Apr 9, 2027" from a YYYY-MM-DD date. */
export function dateWithYear(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** The span a set of nights covers, with the year shown once when it is the same at both ends: "Apr 9 – Aug 7, 2027", or "Nov 6, 2026 – Mar 26, 2027" across New Year. Empty for no dates. */
export function seasonSpan(dates: string[]): string {
  if (dates.length === 0) return "";
  const sorted = [...dates].sort();
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (first === last) return dateWithYear(first);
  if (first.slice(0, 4) === last.slice(0, 4)) return `${dateWithYear(first).replace(/, \d{4}$/, "")} – ${dateWithYear(last)}`;
  return `${dateWithYear(first)} – ${dateWithYear(last)}`;
}

/** How many of these dates are before today (YYYY-MM-DD, both). */
export const passedCount = (dates: string[], today: string): number => dates.filter((d) => d < today).length;

/** The small label over a set of nights (`word` is "season", or "summer series" for a venue): "2027 season · Mar 5 – Jul 3", or "2026–27 season · Nov 6 – Mar 26" across New Year. Empty for no dates. */
export function seasonEyebrow(dates: string[], word = "season"): string {
  if (dates.length === 0) return "";
  const sorted = [...dates].sort();
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const noYear = (iso: string): string => dateWithYear(iso).replace(/, \d{4}$/, "");
  const y1 = first.slice(0, 4);
  const y2 = last.slice(0, 4);
  const season = y1 === y2 ? y1 : `${y1}\u2013${y2.slice(2)}`;
  return `${season} ${word} \u00b7 ${first === last ? noYear(first) : `${noYear(first)} \u2013 ${noYear(last)}`}`;
}
