import { describe, expect, it } from "vitest";
import { dateExample, dateHint, detectDateOrder, parseCalendar, parseDate } from "../../src/app/calendar/csv";
import { exactTries, matchScore, parsePlaceQuery, prefixTries, queryTargets, rankPlaces, typoDistance, type RawPlace } from "../../src/app/geo";
import { SPORTS } from "../../src/app/kind";
import { dateExample as dateExampleFromSamples, exampleCsv } from "../../src/app/samples";

const H = "date,theme,sponsor,locked,notes\n";

describe("reading a typed place", () => {
  it("finds a trailing state or province, with or without a comma, by code or by name", () => {
    expect(parsePlaceQuery("Fargo ND")).toMatchObject({ name: "Fargo", region: { code: "ND" }, country: "US" });
    expect(parsePlaceQuery("Tulsa OK")).toMatchObject({ name: "Tulsa", region: { code: "OK" } });
    expect(parsePlaceQuery("Tulsa, Oklahoma")).toMatchObject({ name: "Tulsa", region: { code: "OK" } });
    expect(parsePlaceQuery("tulsa oklahoma")).toMatchObject({ name: "tulsa", region: { code: "OK" } });
    expect(parsePlaceQuery("Grand Forks North Dakota")).toMatchObject({ name: "Grand Forks", region: { code: "ND" } });
    expect(parsePlaceQuery("Halifax NS")).toMatchObject({ name: "Halifax", region: { code: "NS" }, country: "CA" });
    expect(parsePlaceQuery("Moncton New Brunswick")).toMatchObject({ name: "Moncton", region: { code: "NB" }, country: "CA" });
    expect(parsePlaceQuery("Québec City, Québec")).toMatchObject({ name: "Québec City", region: { code: "QC" }, country: "CA" });
    expect(parsePlaceQuery("Washington DC")).toMatchObject({ name: "Washington", region: { code: "DC" } });
  });

  it("reads a country word and a state together", () => {
    expect(parsePlaceQuery("Tulsa, OK, USA")).toMatchObject({ name: "Tulsa", region: { code: "OK" }, country: "US" });
    expect(parsePlaceQuery("Tulsa OK USA")).toMatchObject({ name: "Tulsa", region: { code: "OK" } });
    expect(parsePlaceQuery("Toronto, Canada")).toMatchObject({ name: "Toronto", region: null, country: "CA" });
    expect(parsePlaceQuery("Toronto Canada")).toMatchObject({ name: "Toronto", country: "CA" });
  });

  it("leaves a name alone when it is only a state, or has no state", () => {
    expect(parsePlaceQuery("Oregon")).toMatchObject({ name: "Oregon", region: null });
    expect(parsePlaceQuery("New York")).toMatchObject({ name: "New York", region: null });
    expect(parsePlaceQuery("New York NY")).toMatchObject({ name: "New York", region: { code: "NY" } });
    expect(parsePlaceQuery("Oklahoma City")).toMatchObject({ name: "Oklahoma City", region: null });
    expect(parsePlaceQuery("Kansas City KS")).toMatchObject({ name: "Kansas City", region: { code: "KS" } });
    expect(parsePlaceQuery("Tulsa")).toMatchObject({ name: "Tulsa", region: null, country: null, extra: null });
  });

  it("knows the US territories, so it can say they are not covered", () => {
    expect(parsePlaceQuery("San Juan, PR")).toMatchObject({ name: "San Juan", region: { code: "PR", cc: "TERRITORY" } });
    expect(parsePlaceQuery("San Juan PR")).toMatchObject({ region: { code: "PR", cc: "TERRITORY" } });
    expect(parsePlaceQuery("San Juan Puerto Rico")).toMatchObject({ name: "San Juan", region: { code: "PR" } });
    expect(parsePlaceQuery("Hagatna, Guam")).toMatchObject({ region: { code: "GU", cc: "TERRITORY" } });
  });

  it("keeps text after a comma that is not ours, to tell 'Paris, France' from Paris, TX", () => {
    expect(parsePlaceQuery("Paris, France")).toMatchObject({ name: "Paris", region: null, extra: "france", tail: "France" });
  });

  it("ignores accents, case, dots and St/Ft/Mt", () => {
    expect(queryTargets(parsePlaceQuery("St. Paul"))).toEqual(["saint paul"]);
    expect(matchScore("Saint Paul", queryTargets(parsePlaceQuery("st paul")))).toBe(100);
    expect(matchScore("Québec", queryTargets(parsePlaceQuery("QUEBEC")))).toBe(100);
    expect(matchScore("Montréal", queryTargets(parsePlaceQuery("Montreal")))).toBe(100);
    expect(matchScore("Winston-Salem", queryTargets(parsePlaceQuery("winston salem")))).toBe(100);
    expect(matchScore("Québec", queryTargets(parsePlaceQuery("Quebec City")))).toBeGreaterThan(0);
  });

  it("allows no typo in four letters or fewer, one up to seven, two beyond", () => {
    const score = (found: string, typed: string): number => matchScore(found, queryTargets(parsePlaceQuery(typed)));
    expect(typoDistance("tulsa", "tusla")).toBe(1); // a swapped pair is one typo
    expect(score("Tulsa", "Tulsx")).toBeGreaterThan(0);
    expect(score("Reno", "Renx")).toBe(0);
    expect(score("Chicago", "Chicgo")).toBeGreaterThan(0);
    expect(score("Chicago", "Chcgo")).toBe(0); // two typos in a seven-letter name
    expect(score("Cincinnati", "Cincinatti")).toBeGreaterThan(0); // two typos in ten letters
    expect(score("Cincinnati", "Cincinattti")).toBe(0);
  });

  it("asks the geocoder for the name, the spelled-out name and no 'City', then for shorter starts", () => {
    expect(exactTries(parsePlaceQuery("Quebec City"))).toEqual(["Quebec City", "quebec"]);
    expect(exactTries(parsePlaceQuery("St Paul"))).toEqual(["St Paul", "saint paul"]);
    expect(exactTries(parsePlaceQuery("Tulsa OK"))).toEqual(["Tulsa"]);
    expect(prefixTries(parsePlaceQuery("Cincinatti"))).toEqual(["cincinat", "cincin", "cinc", "cin"]);
    expect(prefixTries(parsePlaceQuery("Albequerque"))).toContain("alb");
  });
});

describe("ranking what the geocoder returned", () => {
  const raw = (name: string, admin1: string, cc: string, population: number, extra: Partial<RawPlace> = {}): RawPlace => ({ name, admin1, country_code: cc, latitude: 1, longitude: 2, population, feature_code: "PPL", ...extra });

  it("drops a place that is not the name typed, even if the geocoder returned it first", () => {
    const hits = rankPlaces([raw("Willard", "Ohio", "US", 6000), raw("Chicago", "Illinois", "US", 2700000), raw("Salem", "Wisconsin", "US", 2700)], parsePlaceQuery("Chicago")).hits;
    expect(hits.map((x) => x.label)).toEqual(["Chicago, IL"]);
  });

  it("puts the exact name ahead of a longer one, and the bigger town ahead of the smaller", () => {
    const hits = rankPlaces([raw("Vancouver Junction", "Washington", "US", 100), raw("Vancouver", "Washington", "US", 190000), raw("Vancouver", "British Columbia", "CA", 600000)], parsePlaceQuery("Vancouver")).hits;
    expect(hits.map((x) => x.label)).toEqual(["Vancouver, BC", "Vancouver, WA", "Vancouver Junction, WA"]);
  });

  it("drops non-populated features and repeats", () => {
    const hits = rankPlaces([raw("Tulsa", "Oklahoma", "US", 400000), raw("Tulsa", "Oklahoma", "US", 10), raw("Tulsa", "Oklahoma", "US", 5, { feature_code: "AIRP" })], parsePlaceQuery("Tulsa")).hits;
    expect(hits).toHaveLength(1);
  });

  it("calls a place outside the US and Canada by its name, and does not confuse a typo-near foreign town with it", () => {
    expect(rankPlaces([raw("Mexico City", "Mexico City", "MX", 12000000)], parsePlaceQuery("Mexico City"))).toMatchObject({ hits: [], message: expect.stringContaining("Homestand covers towns in the US and Canada") });
    // A foreign village one letter from a typo is not "somewhere else": the typed name is probably a US city.
    expect(rankPlaces([raw("Cincinati", "Magdalena", "CO", 0)], parsePlaceQuery("Cincinatti")).message).toBeUndefined();
  });
});

describe("dates: one example, in the future", () => {
  it("every sport's example date is after today's date in the app, and the hint says both spellings", () => {
    for (const s of SPORTS) {
      expect(dateExample(s) > "2026-10-20").toBe(true);
      expect(dateExampleFromSamples(s)).toBe(dateExample(s));
    }
    expect(dateHint("baseball")).toBe("Use 2027-04-10 or 4/10/2027.");
    expect(dateHint("basketball")).toBe("Use 2027-11-12 or 11/12/2027.");
    expect(dateHint("baseball", true)).toBe("Use 2027-04-10 or 10/4/2027.");
  });

  it("a bad date in Check says the same thing the editor says", () => {
    const { errors } = parseCalendar(`${H}soon,Bluey,,no,\n`);
    expect(errors[0]!.message).toBe(`"soon" is not a date. ${dateHint("baseball")}`);
    expect(parseCalendar(`${H}soon,Bluey,,no,\n`, "hockey").errors[0]!.message).toBe(`"soon" is not a date. ${dateHint("hockey")}`);
    expect(JSON.stringify(parseCalendar(`${H}soon,Bluey,,no,\n`).errors)).not.toContain("2026");
  });
});

describe("dates: old years are dates", () => {
  it("accepts 1999-04-17 and 4/17/1999, still refuses nonsense and years outside 1900 to 2100", () => {
    expect(parseDate("1999-04-17")).toBe("1999-04-17");
    expect(parseDate("4/17/1999")).toBe("1999-04-17");
    expect(parseDate("1899-12-31")).toBeNull();
    expect(parseDate("2101-01-01")).toBeNull();
    expect(parseDate("1999-02-29")).toBeNull();
    const { rows, errors } = parseCalendar(`${H}1999-04-17,Bluey,,no,\n`);
    expect(errors).toEqual([]);
    expect(rows[0]!.date).toBe("1999-04-17");
  });
});

describe("dates: day first or month first", () => {
  it("reads the whole file day/month when any date has a first number above 12, and says so in one line", () => {
    const r = parseCalendar(`${H}10/4/2027,Bluey,,no,\n25/4/2027,Star Wars,,no,\n3/5/2027,Elvis,,no,\n`);
    expect(r.errors).toEqual([]);
    expect(r.dayFirst).toBe(true);
    expect(r.rows.map((x) => x.date)).toEqual(["2027-04-10", "2027-04-25", "2027-05-03"]);
    expect(r.notes).toEqual(["Read dates as day/month because of 25/4/2027"]);
  });

  it("keeps month first when nothing says otherwise, and shows the reading of the first unclear date", () => {
    const r = parseCalendar(`${H}10/4/2027,Bluey,,no,\n11/5/2027,Elvis,,no,\n`);
    expect(r.dayFirst).toBe(false);
    expect(r.rows.map((x) => x.date)).toEqual(["2027-10-04", "2027-11-05"]);
    expect(r.notes).toEqual(["Read 10/4/2027 as Oct 4, 2027"]);
  });

  it("says nothing for dates that cannot be read two ways", () => {
    expect(parseCalendar(`${H}4/4/2027,Bluey,,no,\n4/25/2027,Elvis,,no,\n2027-05-01,Marvel,,no,\n`).notes).toEqual([]);
    expect(parseCalendar(`${H}4/25/2027,Elvis,,no,\n`).dayFirst).toBe(false);
    expect(parseCalendar(`${H}2027-04-10,Bluey,,no,\n`).notes).toEqual([]);
  });

  it("when the file mixes both orders, reads month first, marks the odd rows and says so", () => {
    const r = parseCalendar(`${H}25/4/2027,A,,no,\n4/25/2027,B,,no,\n`);
    expect(r.dayFirst).toBe(false);
    expect(r.rows.map((x) => x.theme)).toEqual(["B"]);
    expect(r.errors.map((e) => e.line)).toEqual([2]);
    expect(r.notes[0]).toContain("mix day/month and month/day");
  });

  it("the hint on a bad row in a day-first file shows the day-first spelling", () => {
    const r = parseCalendar(`${H}25/4/2027,A,,no,\nsoon,B,,no,\n`);
    expect(r.errors[0]!.message).toBe('"soon" is not a date. Use 2027-04-10 or 10/4/2027.');
  });

  it("detectDateOrder works on bare strings", () => {
    expect(detectDateOrder(["13/1/2027"]).dayFirst).toBe(true);
    expect(detectDateOrder(["1/13/2027"]).dayFirst).toBe(false);
    expect(detectDateOrder(["2027-04-10", "soon"]).note).toBeNull();
  });
});

describe("dates: two nights on one date", () => {
  it("warns on each of the rows, never blocks, and still counts both", () => {
    const r = parseCalendar(`${H}2027-04-10,Bluey,,no,\n2027-04-17,Elvis,,no,\n4/10/2027,Marvel,,no,\n`);
    expect(r.rows).toHaveLength(3);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      { line: 2, message: "Two nights on Apr 10, 2027" },
      { line: 4, message: "Two nights on Apr 10, 2027" },
    ]);
  });

  it("counts three", () => {
    const r = parseCalendar(`${H}2027-04-10,A,,no,\n2027-04-10,B,,no,\n2027-04-10,C,,no,\n`);
    expect(r.warnings.map((w) => w.message)).toEqual(Array(3).fill("3 nights on Apr 10, 2027"));
  });

  it("a clean calendar has none, and the example calendars have none", () => {
    expect(parseCalendar(`${H}2027-04-10,A,,no,\n2027-04-11,B,,no,\n`).warnings).toEqual([]);
    for (const s of SPORTS) expect(parseCalendar(exampleCsv(s)).warnings).toEqual([]);
  });
});

describe("the nights-ready count is Check's count", () => {
  // The editor counts parseCalendar(text).rows, and Check sends parseCalendar(text).rows, so the number cannot differ.
  // These are the three ways it used to differ.
  it("a locked value of 'maybe': the night is not ready, and the row says why", () => {
    const r = parseCalendar(`${H}2027-04-10,A,,no,\n2027-04-11,B,,maybe,\n2027-04-12,C,,yes,\n`);
    expect(r.rows).toHaveLength(2);
    expect(r.errors).toEqual([{ line: 3, message: '"maybe" in the locked column is not yes or no.' }]);
    expect(r.raw.map((x) => x.line)).toEqual([2, 3, 4]);
    expect(r.raw[1]!.locked).toBe("maybe");
  });

  it("a missing header: nothing is ready, whatever the rows look like", () => {
    const r = parseCalendar("2027-04-10,A,,no,\n2027-04-11,B,,no,\n");
    expect(r.rows).toHaveLength(0);
    expect(r.headerOk).toBe(false);
    expect(r.errors[0]!.message).toContain("header");
    expect(r.raw).toEqual([]);
  });

  it("a header with only a theme column: one message about the header, not 'Not a date' on every row", () => {
    const r = parseCalendar("theme\nBluey\nElvis\n");
    expect(r.rows).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.message).toContain("no date column");
    expect(r.errors[0]!.message).not.toContain("not a date");
    expect(parseCalendar("date\n2027-04-10\n").errors[0]!.message).toContain("no theme column");
  });

  it("every skipped row is named by the line it is on, and good rows around it are kept", () => {
    const r = parseCalendar(`${H}2027-04-10,A,,no,\n\nsoon,B,,no,\n2027-04-12,,,no,\n2027-04-13,D,,no,\n`);
    expect(r.rows.map((x) => x.line)).toEqual([2, 6]);
    expect(r.errors.map((e) => e.line)).toEqual([4, 5]);
    expect(r.raw.map((x) => x.line)).toEqual([2, 4, 5, 6]);
  });
});
