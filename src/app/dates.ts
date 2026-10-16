import { weekdayName } from "./calendar/csv";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fri Jun 19": the same short form the magnets use (weekday, month, day). */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${weekdayName(iso).slice(0, 3)} ${MONTHS[m - 1]} ${d}`;
}
