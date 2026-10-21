import { describe, expect, it } from "vitest";
import { parseCalendar } from "../../src/app/calendar/csv";
import { SPORT_WORDS, type Sport } from "../../src/app/kind";
import { csvTemplate, dateExample, exampleCsv, exampleStart } from "../../src/app/samples";

const SPORTS: Sport[] = ["baseball", "basketball", "hockey", "soccer"];
const TODAYS = ["2026-10-20", "2027-01-15", "2027-05-01", "2027-09-30"];
const day = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();
const plusDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const inSeason = (s: Sport, iso: string): boolean => {
  const [first, last] = SPORT_WORDS[s].seasonMonths;
  const m = Number(iso.slice(5, 7));
  return first <= last ? m >= first && m <= last : m >= first || m <= last;
};

describe("the example calendar starts at the next season", () => {
  for (const sport of SPORTS) {
    for (const today of TODAYS) {
      it(`${sport}, today ${today}`, () => {
        const rows = parseCalendar(exampleCsv(sport, today)).rows;
        const base = parseCalendar(exampleCsv(sport, "2027-03-22")).rows;
        expect(rows).toHaveLength(20);
        expect(day(rows[0]!.date)).toBe(5);
        expect(rows[0]!.date >= plusDays(today, 14)).toBe(true);
        expect(rows.every((r) => inSeason(sport, r.date))).toBe(true);
        rows.forEach((r, i) => {
          expect(day(r.date)).toBe(day(base[i]!.date));
          expect((Date.parse(r.date) - Date.parse(rows[0]!.date)) / 86_400_000).toBe((Date.parse(base[i]!.date) - Date.parse(base[0]!.date)) / 86_400_000);
        });
        expect(parseCalendar(csvTemplate(sport, today)).errors).toEqual([]);
        expect(dateExample(sport, today) >= today).toBe(true);
        for (const r of parseCalendar(csvTemplate(sport, today)).rows) expect(r.date >= plusDays(today, 14)).toBe(true);
      });
    }
  }
  it("gives the dates for today = 2026-10-20", () => {
    expect(exampleStart("soccer", "2026-10-20")).toBe("2027-03-05");
    expect(exampleStart("basketball", "2026-10-20")).toBe("2026-11-06");
    expect(exampleStart("hockey", "2026-10-20")).toBe("2026-11-06");
    expect(exampleStart("baseball", "2026-10-20")).toBe("2027-04-02");
  });
  it("starts two weeks out when the whole example still fits in the season", () => {
    expect(exampleStart("soccer", "2027-05-01")).toBe("2027-05-21");
    expect(exampleStart("baseball", "2027-04-20")).toBe("2027-05-07");
  });
  it("waits for the next opening when the example would run past the end of the season", () => {
    expect(exampleStart("baseball", "2027-07-20")).toBe("2028-04-07");
    expect(exampleStart("hockey", "2027-05-01")).toBe("2027-10-01");
  });
  it("keeps the sport's own promo and notes", () => {
    expect(exampleCsv("hockey", "2026-10-20")).toContain("Teddy Bear Toss");
    expect(exampleCsv("soccer", "2026-10-20")).toContain("Afternoon kickoff");
    expect(exampleCsv("baseball", "2026-10-20")).toContain("Fireworks Friday,Prairie Bank");
  });
});
