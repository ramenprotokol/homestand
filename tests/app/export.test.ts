import { describe, expect, it } from "vitest";
import { parseCalendar } from "../../src/app/calendar/csv";
import { exportCsv } from "../../src/app/export/csv";
import { exportIcs, foldLine, icsEscape } from "../../src/app/export/ics";
import { buildMemoHtml, memoDocument, type MemoData } from "../../src/app/export/memo";

const rows = [
  { date: "2026-05-02", theme: "Paw Patrol Day", sponsor: 'Smith, "Sons" & Co', locked: false, notes: "Swapped from Elvis Night" },
  { date: "2026-04-10", theme: "Margaritaville Night", sponsor: "", locked: true, notes: "" },
];

describe("CSV export", () => {
  it("sorts by date, quotes fields, and round-trips through the parser", () => {
    const csv = exportCsv(rows);
    expect(csv.split("\r\n")[0]).toBe("date,theme,sponsor,locked,notes");
    expect(csv.split("\r\n")[1]).toContain("2026-04-10");
    const back = parseCalendar(csv);
    expect(back.errors).toEqual([]);
    expect(back.rows.map((r) => [r.date, r.sponsor, r.locked])).toEqual([["2026-04-10", "", true], ["2026-05-02", 'Smith, "Sons" & Co', false]]);
  });
});

describe("ICS export", () => {
  const ics = exportIcs(rows, "Akron, OH sample club", "2026-10-15T12:00:00.000Z");
  it("is a valid-looking all-day calendar with CRLF lines", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260410");
    expect(ics).toContain("DTEND;VALUE=DATE:20260411");
    expect(ics).toContain("DTSTAMP:20261015T120000Z");
    expect(ics).toContain("X-WR-CALNAME:Akron\\, OH sample club");
    expect(ics).toContain("SUMMARY:Paw Patrol Day (Smith\\, \"Sons\" & Co)");
    expect(ics).toContain("DESCRIPTION:Locked");
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });
  it("ends events across month boundaries", () => {
    expect(exportIcs([{ date: "2026-04-30", theme: "x", sponsor: "", locked: false, notes: "" }], "c", "2026-10-15T00:00:00Z")).toContain("DTEND;VALUE=DATE:20260501");
  });
  it("escapes and folds at 75 octets without splitting characters", () => {
    expect(icsEscape("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
    const long = "SUMMARY:" + "é".repeat(60);
    const folded = foldLine(long);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(long);
  });
});

describe("memo", () => {
  const data: MemoData = {
    club: "Akron, OH sample club <b>", generatedOn: "2026-10-15", summary: "Two <script>alert(1)</script> swaps.",
    swaps: [{ date: "2026-07-03", weekday: "Friday", from: "Elvis", to: "Grateful Dead", sponsor: "Tallmadge & Sons", fromZ: -1.24, toZ: 1.91, fromScore: 0.512, toScore: 0.731, why: "Closer to local taste." }],
    angles: ["Keep it."], nights: 24, classic: 3, synthetic: true, recordedOn: null,
  };
  it("escapes everything and cites the index and bundle score, not raw affinities", () => {
    const html = buildMemoHtml(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("-1.2 to +1.9");
    expect(html).toContain("0.51 to 0.73");
    expect(html).toContain("SYNTHETIC DEMO DATA");
    expect(html).toContain("does not say a theme will raise attendance");
  });
  it("says so when nothing was approved", () => {
    expect(buildMemoHtml({ ...data, swaps: [], synthetic: false })).toContain("No swaps were approved");
  });
  it("makes a standalone printable document", () => {
    expect(memoDocument(data).startsWith("<!doctype html>")).toBe(true);
  });
});
