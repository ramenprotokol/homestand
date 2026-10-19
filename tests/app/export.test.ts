import { describe, expect, it } from "vitest";
import { parseCalendar } from "../../src/app/calendar/csv";
import { exportCsv, safeCell } from "../../src/app/export/csv";
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

describe("export injection", () => {
  it("a lone carriage return cannot start a new calendar property", () => {
    const evil = "Bluey\rEND:VEVENT\rBEGIN:VEVENT\rSUMMARY:Injected";
    expect(icsEscape(evil)).toBe("Bluey\\nEND:VEVENT\\nBEGIN:VEVENT\\nSUMMARY:Injected");
    const ics = exportIcs([{ date: "2026-05-01", theme: evil, sponsor: "Co\u0007\u001b[0m", locked: false, notes: "line1\rline2\nline3\r\nline4" }], `Club\rX-EVIL:1`, "2026-10-18T00:00:00.000Z");
    expect(ics).not.toMatch(/\r(?!\n)/);
    const lines = ics.split("\r\n");
    expect(lines.filter((l) => l.startsWith("BEGIN:VEVENT"))).toHaveLength(1);
    expect(lines.some((l) => l.startsWith("SUMMARY:Injected") || l.startsWith("X-EVIL"))).toBe(false);
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    expect(ics).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/);
  });
  it("text columns that start like a formula are made plain text; numbers and the parse round-trip are untouched", () => {
    const rows = [
      { date: "2026-05-01", theme: "=HYPERLINK(\"http://evil\",\"x\")", sponsor: "+1 Bank", locked: false, notes: "@SUM(A1)" },
      { date: "2026-05-02", theme: "-2 Night", sponsor: "\tTab", locked: true, notes: "\rCR" },
      { date: "2026-05-03", theme: "Bluey Day", sponsor: "Fine Bank", locked: false, notes: "Normal, with comma" },
    ];
    const csv = exportCsv(rows);
    expect(csv).toContain(`2026-05-01,"'=HYPERLINK(""http://evil"",""x"")",'+1 Bank,no,'@SUM(A1)`);
    expect(csv).toContain("2026-05-02,'-2 Night,'\tTab,yes");
    expect(csv).toContain('2026-05-03,Bluey Day,Fine Bank,no,"Normal, with comma"');
    expect(safeCell("0.5")).toBe("0.5");
    expect(safeCell("Bluey")).toBe("Bluey");
    const back = parseCalendar(csv).rows;
    expect(back).toHaveLength(3);
    expect(back[2]).toMatchObject({ theme: "Bluey Day", sponsor: "Fine Bank", notes: "Normal, with comma" });
  });
});

describe("memo", () => {
  const data: MemoData = {
    club: "Akron, OH sample club <b>", generatedOn: "2026-10-15",
    swaps: [{ date: "2026-07-03", weekday: "Friday", from: "Elvis", to: "Grateful Dead", sponsor: "Tallmadge & Sons", fromZ: -1.24, toZ: 1.91, fromScore: 0.512, toScore: 0.731, why: "Closer to local taste." }],
    angles: ["Keep it."], nights: 24, suggested: 1, classic: 3, synthetic: true, recordedLabel: null,
  };
  it("escapes everything and cites the local pull, not raw affinities or the bundle score", () => {
    const html = buildMemoHtml(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("well below to well above"); // words, never a raw index
    expect(html).not.toMatch(/-1\.2|1\.9/);
    expect(html).not.toContain("0.51 to 0.73");
    expect(html).not.toContain("Bundle score");
    expect(html).toContain("SYNTHETIC DEMO DATA");
    expect(html).toContain("does not say a theme will raise attendance");
  });
  it("opens with a fixed sentence built only from counts: what was suggested and what was approved", () => {
    const head = "Homestand checked 24 theme nights for Akron, OH sample club <b> against local taste data from Qloo.";
    expect(memoOpener(data)).toBe(`${head} It suggested 1 swap; you approved 1. Each approved swap keeps its original date and sponsor.`);
    expect(memoOpener({ ...data, suggested: 2 })).toBe(`${head} It suggested 2 swaps; you approved 1. Each approved swap keeps its original date and sponsor.`);
    expect(memoOpener({ ...data, swaps: [], suggested: 2 })).toBe(`${head} It suggested 2 swaps; you approved none. The calendar is unchanged.`);
    expect(memoOpener({ ...data, swaps: [], suggested: 0 })).toBe(`${head} It suggested no swaps, so the calendar is unchanged.`);
    // The approved count can never read higher than the suggested one.
    expect(memoOpener({ ...data, suggested: 0 })).toContain("It suggested 1 swap; you approved 1.");
    expect(buildMemoHtml(data)).toContain("Homestand checked 24 theme nights for Akron, OH sample club &lt;b&gt; against local taste data from Qloo.");
    expect(buildMemoHtml(data)).not.toMatch(/preference for certain/i);
  });
  it("labels a discovered swap, has no local-pull number for it, and repeats Qloo's family ideas", () => {
    const d: MemoData = {
      ...data, synthetic: false,
      swaps: [{ date: "2026-05-08", weekday: "Friday", from: "Barbie", to: "DC League of Super-Pets", sponsor: "Pinecrest Auto", fromZ: -2.1, toZ: null, fromScore: null, toScore: null, why: "Qloo ranks DC League of Super-Pets among the top family movies for fans near Tulsa.", source: "template", discovered: true }],
      ideas: { city: "Tulsa", titles: ["Fuller House", "Sing 2"], scored: 19, poolSize: 46 },
    };
    const html = buildMemoHtml(d);
    expect(html).toContain("DC League of Super-Pets <em>(Discovered by Qloo)</em>");
    expect(html).toContain("well below to found by Qloo");
    expect(html).not.toMatch(/-2\.1/);
    expect(html).toContain("Family titles that stand out near Tulsa");
    expect(html).toContain("Fuller House, Sing 2.");
    expect(html).toContain("Qloo had local data for 19 of our 46 family titles here");
    expect(html).not.toContain("under-25");
    expect(html).toContain("They come from Qloo's taste data for this area");
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
