import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mergeNights, parseSchedule } from "../../src/study/parse";

const sample: unknown = JSON.parse(readFileSync(new URL("../fixtures/schedule-sample.json", import.meta.url), "utf8"));

describe("parseSchedule", () => {
  it("keeps Final games with attendance and reads promos, flags and location", () => {
    const nights = parseSchedule(sample, 12);
    expect(nights.map((n) => n.gamePk)).toEqual([1, 2]);
    const n = nights[0];
    expect(n).toMatchObject({
      sportId: 12, clubId: 900, club: "Riverbend Otters", date: "2025-06-07", weekday: 6, month: 6,
      attendance: 6120, doubleHeader: false, fireworks: true, giveaway: true,
      city: "Riverbend", state: "OH", lat: 40.1, lon: -82.9,
    });
    expect(n.promoNames).toEqual(["Bluey Night", "Postgame Fireworks", "Bobblehead Giveaway"]);
    expect(nights[1]).toMatchObject({ doubleHeader: true, promoNames: [], fireworks: false, giveaway: false, city: null, lat: null });
  });
  it("returns [] for malformed input and never throws", () => {
    expect(parseSchedule(null, 11)).toEqual([]);
    expect(parseSchedule({ dates: "nope" }, 11)).toEqual([]);
    expect(parseSchedule({ dates: [{ games: [{ gamePk: "x" }] }] }, 11)).toEqual([]);
  });
});

describe("mergeNights", () => {
  it("dedupes by gamePk keeping the first, sorted by date then gamePk", () => {
    const a = parseSchedule(sample, 12);
    const merged = mergeNights([a, a]);
    expect(merged.map((n) => n.gamePk)).toEqual([1, 2]);
  });
});
