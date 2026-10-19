import { describe, expect, it } from "vitest";
import { parseCalendar } from "../../src/app/calendar/csv";
import { exportCsv } from "../../src/app/export/csv";
import { exportIcs, foldLine, icsEscape } from "../../src/app/export/ics";
import { buildMemoHtml, memoDocument, memoOpener, type MemoData } from "../../src/app/export/memo";

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
    club: "Akron, OH sample club <b>", generatedOn: "2026-10-15",
    swaps: [{ date: "2026-07-03", weekday: "Friday", from: "Elvis", to: "Grateful Dead", sponsor: "Tallmadge & Sons", fromZ: -1.24, toZ: 1.91, fromScore: 0.512, toScore: 0.731, why: "Closer to local taste." }],
    angles: ["Keep it."], nights: 24, classic: 3, synthetic: true, recordedOn: null,
  };
  it("escapes everything and cites the local pull, not raw affinities or the bundle score", () => {
    const html = buildMemoHtml(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("-1.2 to +1.9");
    expect(html).not.toContain("0.51 to 0.73");
    expect(html).not.toContain("Bundle score");
    expect(html).toContain("SYNTHETIC DEMO DATA");
    expect(html).toContain("does not say a theme will raise attendance");
  });
  it("opens with a fixed sentence built only from counts", () => {
    expect(memoOpener(data)).toBe("Homestand checked 24 theme nights for Akron, OH sample club <b> against local taste data from Qloo and suggests 1 swap. Each swap keeps its original date and sponsor.");
    expect(memoOpener({ ...data, swaps: [] })).toContain("suggests no swaps. The calendar is unchanged.");
    expect(buildMemoHtml(data)).toContain("Homestand checked 24 theme nights for Akron, OH sample club &lt;b&gt; against local taste data from Qloo");
    expect(buildMemoHtml(data)).not.toMatch(/preference for certain/i);
  });
  it("labels a discovered swap, has no local-pull number for it, and repeats Qloo's family ideas", () => {
    const d: MemoData = {
      ...data, synthetic: false,
      swaps: [{ date: "2026-05-08", weekday: "Friday", from: "Barbie", to: "DC League of Super-Pets", sponsor: "Pinecrest Auto", fromZ: -2.1, toZ: null, fromScore: null, toScore: null, why: "Qloo ranks DC League of Super-Pets among the top family movies for fans near Tulsa.", source: "template", discovered: true }],
      ideas: { city: "Tulsa", titles: ["Fuller House", "Sing 2"], young: ["All That"] },
    };
    const html = buildMemoHtml(d);
    expect(html).toContain("DC League of Super-Pets <em>(Discovered by Qloo)</em>");
    expect(html).toContain("-2.1 to Found by Qloo");
    expect(html).toContain("Fresh family ideas from Qloo for Tulsa");
    expect(html).toContain("Fuller House, Sing 2.");
    expect(html).toContain("Under-25 fans here also lean toward: All That.");
    expect(html).toContain("These come from Qloo's taste data for this area");
    expect(html).not.toContain("n/a");
  });
  it("carries a discovered title into the CSV and the calendar file", () => {
    const rows = [{ date: "2026-05-08", theme: "DC League of Super-Pets", sponsor: "Pinecrest Auto", locked: false, notes: "Swapped from Barbie (Homestand, discovered by Qloo)" }];
    expect(exportCsv(rows)).toContain('DC League of Super-Pets,Pinecrest Auto,no,"Swapped from Barbie (Homestand, discovered by Qloo)"');
    expect(exportIcs(rows, "Tulsa, OK", "2026-10-18T00:00:00.000Z")).toContain("DC League of Super-Pets");
  });
  it("says so when nothing was approved", () => {
    expect(buildMemoHtml({ ...data, swaps: [], synthetic: false })).toContain("No swaps were approved");
  });
  it("makes a standalone printable document", () => {
    expect(memoDocument(data).startsWith("<!doctype html>")).toBe(true);
  });
});
