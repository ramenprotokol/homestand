import type { ExportRow } from "./csv";

const enc = new TextEncoder();

/** RFC 5545 text escaping. */
export function icsEscape(s: string): string {
  // Every kind of line break becomes a literal \n (a lone CR would otherwise end the property and start a new one), and other control characters go.
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

/** Folds a content line at 75 octets, on character boundaries; continuation lines start with one space. */
export function foldLine(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74;
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const compact = (iso: string): string => iso.replace(/-/g, "");

function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** All-day events, one per night. `stamp` is an ISO timestamp, passed in so the output is reproducible. */
export function exportIcs(rows: readonly ExportRow[], calendarName: string, stamp: string): string {
  const dtstamp = stamp.replace(/[-:]/g, "").replace(/\.\d+/, "").replace(/Z?$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Homestand//Season calendar//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsEscape(calendarName)}`];
  [...rows].sort((a, b) => a.date.localeCompare(b.date)).forEach((r, i) => {
    const summary = r.sponsor ? `${r.theme} (${r.sponsor})` : r.theme;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${compact(r.date)}-${i}@homestand`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compact(r.date)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(r.date))}`,
      `SUMMARY:${icsEscape(summary)}`,
    );
    const desc = [r.locked ? "Locked" : "", r.notes].filter(Boolean).join(". ");
    if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
