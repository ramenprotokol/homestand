import { describe, expect, it } from "vitest";
import { parseCalendar } from "../../src/app/calendar/csv";
import { placeLabel } from "../../src/app/geo";
import { exampleCsv } from "../../src/app/samples";
import { sortRowsByDate } from "../../src/app/calendar/csv";
import { cleanTitle, swapName, personalLine, checkResultLine, fitSummary, localDay, lockedLine, longDate, plural } from "../../src/app/text";
import { resolveTheme } from "../../src/app/calendar/resolve";
import { THEME_LIBRARY } from "../../src/app/themes/library";

describe("count wording", () => {
  it("never says '1 nights' or '1 locked night stay'", () => {
    expect(plural(1, "night")).toBe("night");
    expect(plural(2, "night")).toBe("nights");
    expect(lockedLine(1)).toBe("1 locked night stays exactly as planned");
    expect(lockedLine(4)).toBe("4 locked nights stay exactly as planned");
    expect(checkResultLine(0, 1, "Tulsa")).toBe("This night isn't a weak fit for Tulsa.");
    expect(checkResultLine(1, 1, "Tulsa")).toBe("This night is a weak fit for Tulsa.");
    expect(checkResultLine(1, 25, "Tulsa")).toBe("1 of 25 nights is a weak fit for Tulsa.");
    expect(checkResultLine(8, 25, "Biloxi")).toBe("8 of 25 nights are a weak fit for Biloxi.");
    expect(checkResultLine(0, 25, "Biloxi")).toBe("None of the 25 nights is a weak fit for Biloxi.");
    expect(checkResultLine(2, 18, "Raleigh", "date", "dates")).toBe("2 of 18 dates are a weak fit for Raleigh.");
    expect(fitSummary({ in: 1, average: 4, away: 1, notScored: 0, classic: 2 })).toBe("1 strong fit, 4 average fit, 1 weak fit, 0 no data, 2 proven promo.");
  });
});

describe("dates", () => {
  it("uses the viewer's local day and a plain long date", () => {
    expect(localDay(new Date(2026, 9, 19, 23, 30))).toBe("2026-10-19");
    expect(longDate("2026-10-19")).toBe("October 19, 2026");
    expect(longDate("whenever")).toBe("whenever");
  });
});

describe("city labels", () => {
  it("writes US states and Canadian provinces as codes and refuses everywhere else", () => {
    expect(placeLabel("Tulsa", "Oklahoma", "US")).toBe("Tulsa, OK");
    expect(placeLabel("Spokane", "Washington", "US")).toBe("Spokane, WA");
    expect(placeLabel("Calgary", "Alberta", "CA")).toBe("Calgary, AB");
    expect(placeLabel("Tulsa", "Gujarat", "IN")).toBeNull();
  });
});

describe("the own-calendar example", () => {
  it("is 15 to 20 valid rows that mostly resolve to library themes, with one classic and one locked sponsored night", () => {
    const { rows, errors } = parseCalendar(exampleCsv());
    expect(errors).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(15);
    expect(rows.length).toBeLessThanOrEqual(20);
    const res = rows.map((r) => resolveTheme(r.theme, THEME_LIBRARY));
    expect(res.filter((r) => r.kind === "classic")).toHaveLength(1);
    expect(res.filter((r) => r.kind === "theme").length).toBeGreaterThanOrEqual(15);
    expect(rows.filter((r) => r.locked && r.sponsor)).toHaveLength(1);
    const themeIds = res.flatMap((r) => (r.kind === "theme" ? [r.themeId] : []));
    const auds = new Set(themeIds.map((id) => THEME_LIBRARY.find((t) => t.id === id)!.audience));
    expect([...auds].sort()).toEqual(["adult", "family", "kids", "teen"]);
    expect(new Set(themeIds).size).toBe(themeIds.length);
  });
});

describe("the Study's personal line", () => {
  it("answers each call for the published result (CALL STANDS)", () => {
    expect(personalLine("Yes", "CALL STANDS")).toBe("You said Yes. The data didn't back that up.");
    expect(personalLine("No", "CALL STANDS")).toBe("You said No. That matches what we found.");
    expect(personalLine("Not sure", "CALL STANDS")).toBe("Fair: the data couldn't tell either.");
  });
  it("has wording for the other verdicts too, and says 'You said' at most once", () => {
    for (const v of ["CONFIRMED", "OVERTURNED"] as const) for (const c of ["Yes", "No", "Not sure"] as const) expect(personalLine(c, v).match(/You said/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});

describe("real night names for swaps", () => {
  it("keeps the original ending: Barbie Day becomes LEGO Movie Day, Star Wars Night becomes Pro Wrestling Night", () => {
    expect(swapName("Barbie Day", "LEGO Movie")).toBe("LEGO Movie Day");
    expect(swapName("Star Wars Night", "Pro wrestling")).toBe("Pro Wrestling Night");
    expect(swapName("Fireworks Friday", "Batman")).toBe("Batman Friday");
    expect(swapName("Hot Sauce Showdown", "Garth Brooks")).toBe("Garth Brooks Showdown");
    expect(swapName("Dinosaurs & Superheroes", "Marvel")).toBe("Marvel Night");
    expect(swapName("Day", "Marvel")).toBe("Marvel Night");
  });
});

describe("rows in date order", () => {
  it("sorts by date and keeps typed order for the same date", () => {
    const rows = [{ date: "2027-05-02", theme: "b" }, { date: "2027-04-01", theme: "a" }, { date: "2027-05-02", theme: "c" }, { date: "2027-04-30", theme: "d" }];
    expect(sortRowsByDate(rows).map((r) => r.theme)).toEqual(["a", "d", "b", "c"]);
    expect(rows[0]!.theme).toBe("b"); // the input is not changed
  });
});

describe("clean display titles", () => {
  it("strips a trailing series note and nothing else", () => {
    expect(cleanTitle("Harry Potter and the Sorcerer's Stone (Harry Potter, #1)")).toBe("Harry Potter and the Sorcerer's Stone");
    expect(cleanTitle("The Hobbit (The Lord of the Rings Series)")).toBe("The Hobbit");
    expect(cleanTitle("Dune (Dune Chronicles, Book 1) ")).toBe("Dune");
    expect(cleanTitle("Spider-Man: No Way Home")).toBe("Spider-Man: No Way Home");
    expect(cleanTitle("Mission: Impossible (1996)")).toBe("Mission: Impossible (1996)");
    expect(cleanTitle("Chip 'n Dale: Rescue Rangers")).toBe("Chip 'n Dale: Rescue Rangers");
    expect(cleanTitle("(#1)")).toBe("(#1)");
  });
});
