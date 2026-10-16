import { describe, expect, it } from "vitest";
import { CSV_TEMPLATE, parseCalendar, parseDate, weekdayName } from "../../src/app/calendar/csv";
import { isClassicNight } from "../../src/app/calendar/classic";
import { resolveTheme } from "../../src/app/calendar/resolve";
import { THEME_LIBRARY } from "../../src/app/themes/library";
import { SAMPLE_CALENDAR_IDS, sampleCsv } from "../../src/app/samples";

describe("CSV parser", () => {
  it("reads the template", () => {
    const { rows, errors } = parseCalendar(CSV_TEMPLATE);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ date: "2026-05-02", theme: "Star Wars Night", sponsor: "Gulf Coast Dental", locked: true });
  });

  it("handles quotes, commas, doubled quotes, CRLF and a BOM", () => {
    const text = '﻿date,theme,sponsor,locked,notes\r\n2026-04-10,"Bluey, the Night","Smith ""& Sons""",yes,"line one\nline two"\r\n';
    const { rows, errors } = parseCalendar(text);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ theme: "Bluey, the Night", sponsor: 'Smith "& Sons"', locked: true, notes: "line one\nline two" });
  });

  it("accepts tabs and semicolons, US dates, and any column order", () => {
    expect(parseCalendar("theme\tdate\nBluey\t4/10/2026\n").rows[0]).toMatchObject({ date: "2026-04-10", theme: "Bluey", locked: false });
    expect(parseCalendar("date;theme\n2026-04-10;Bluey\n").rows).toHaveLength(1);
  });

  it("reports bad rows with their line and still returns the good rows", () => {
    const { rows, errors } = parseCalendar("date,theme,sponsor,locked\n2026-04-10,Bluey,,no\nnot a date,Star Wars,,no\n2026-02-30,Frozen,,no\n2026-05-01,,,no\n2026-05-02,Moana,,maybe\n2026-05-03,Marvel,,yes\n");
    expect(rows.map((r) => r.theme)).toEqual(["Bluey", "Marvel"]);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
    expect(errors[1]!.message).toContain("not a date");
    expect(errors[3]!.message).toContain("locked");
  });

  it("explains a missing header or an empty file", () => {
    expect(parseCalendar("2026-04-10,Bluey\n").errors[0]!.message).toContain("header");
    expect(parseCalendar("").errors[0]!.message).toContain("empty");
  });

  it("validates real dates and weekdays", () => {
    expect(parseDate("2026-02-29")).toBeNull();
    expect(parseDate("2024-02-29")).toBe("2024-02-29");
    expect(parseDate("13/1/2026")).toBeNull();
    expect(weekdayName("2026-04-11")).toBe("Saturday");
  });

  it("reads all four sample calendars cleanly, 20 to 28 nights, April to September 2026", () => {
    expect(SAMPLE_CALENDAR_IDS).toHaveLength(4);
    for (const id of SAMPLE_CALENDAR_IDS) {
      const { rows, errors } = parseCalendar(sampleCsv(id));
      expect(errors).toEqual([]);
      expect(rows.length).toBeGreaterThanOrEqual(20);
      expect(rows.length).toBeLessThanOrEqual(28);
      for (const r of rows) {
        expect(r.date >= "2026-04-01" && r.date <= "2026-09-30").toBe(true);
        expect(r.sponsor).not.toMatch(/MLB|Pirates of Pittsburgh/i);
      }
      expect(rows.filter((r) => r.locked).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("classic nights", () => {
  it.each(["Fireworks Friday", "Dollar Dog Night", "Bark in the Park", "Bobblehead Giveaway", "Faith and Family Night", "Hispanic Heritage Night", "Military Appreciation Night"])("%s is classic", (t) =>
    expect(isClassicNight(t)).toBe(true),
  );
  it("a pop-culture match wins over a classic word", () => {
    expect(resolveTheme("Star Wars Fireworks Night", THEME_LIBRARY)).toEqual({ kind: "theme", themeId: "star-wars", method: "alias" });
  });
});

describe("theme resolution", () => {
  it("matches aliases on whole words, ignoring case and punctuation", () => {
    expect(resolveTheme("BLUEY!! day", THEME_LIBRARY)).toMatchObject({ kind: "theme", themeId: "bluey" });
    expect(resolveTheme("May the 4th Be With You", THEME_LIBRARY)).toMatchObject({ themeId: "star-wars" });
    expect(resolveTheme("Spider-Man Night", THEME_LIBRARY)).toMatchObject({ themeId: "marvel" });
    expect(resolveTheme("Scooby-Doo Day", THEME_LIBRARY)).toMatchObject({ themeId: "scooby-doo" });
  });
  it("does not match inside other words", () => {
    expect(resolveTheme("Mariner Appreciation", THEME_LIBRARY).kind).toBe("unknown");
    expect(resolveTheme("Dinosaurus Rex Express", THEME_LIBRARY).kind).toBe("unknown");
  });
  it("asks when two themes fit and never forces a match", () => {
    const r = resolveTheme("Pirates & Princesses", THEME_LIBRARY);
    expect(r).toEqual({ kind: "ambiguous", candidates: expect.arrayContaining(["princess", "pirates"]) });
    expect(resolveTheme("Pirates and Princesses Day", THEME_LIBRARY).kind).toBe("ambiguous");
  });
  it("marks unmatched text unknown", () => {
    expect(resolveTheme("Hot Sauce Showdown", THEME_LIBRARY)).toEqual({ kind: "unknown" });
  });
  it("classic wins only when nothing pop-culture matches", () => {
    expect(resolveTheme("Fireworks Friday", THEME_LIBRARY)).toEqual({ kind: "classic" });
  });
  it("the sample calendars have exactly the intended mix", () => {
    for (const id of SAMPLE_CALENDAR_IDS) {
      const kinds = parseCalendar(sampleCsv(id)).rows.map((r) => resolveTheme(r.theme, THEME_LIBRARY).kind);
      expect(kinds.filter((k) => k === "ambiguous")).toHaveLength(1);
      expect(kinds.filter((k) => k === "unknown").length).toBeGreaterThanOrEqual(1);
      const classic = kinds.filter((k) => k === "classic").length;
      expect(classic).toBeGreaterThanOrEqual(3);
      expect(classic).toBeLessThanOrEqual(4);
    }
  });
});
