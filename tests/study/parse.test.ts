import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mergeNights, parseSchedule } from "../../src/study/parse";

const sample: unknown = JSON.parse(readFileSync(new URL("../fixtures/schedule-sample.json", import.meta.url), "utf8"));

describe("parseSchedule", () => {
  const nights = parseSchedule(sample, 12);
  const byPk = (pk: number) => nights.find((n) => n.gamePk === pk);

  it("keeps official finals with attendance and reads promos, flags and location", () => {
    expect(nights.map((n) => n.gamePk)).toEqual([1, 2, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const n = nights[0];
    expect(n).toMatchObject({
      sportId: 12, clubId: 900, club: "Riverbend Otters", date: "2025-06-07", weekday: 6, month: 6,
      attendance: 6120, doubleHeader: false, fireworks: true, giveaway: true, venueId: 7001, rescheduled: false,
      city: "Riverbend", state: "OH", lat: 40.1, lon: -82.9,
    });
    expect(n.promoNames).toEqual(["Bluey Night", "Postgame Fireworks", "Bobblehead Giveaway"]);
    expect(nights[1]).toMatchObject({ doubleHeader: true, promoNames: [], fireworks: false, giveaway: false, city: null, lat: null, venueId: null });
  });
  it("uses codedGameState F, not the display text: postponed rows with attendance are dropped", () => {
    expect(byPk(3)).toBeUndefined();
  });
  it("keeps official rain-shortened finals (Completed Early, codedGameState F)", () => {
    expect(byPk(5)).toMatchObject({ attendance: 2500, venueId: 7002 });
  });
  it("skips away-park (reverseHomeAwayStatus) games and non-regular-season game types", () => {
    expect(byPk(6)).toBeUndefined();
    expect(byPk(7)).toBeUndefined();
  });
  it("keeps rescheduled games but flags them", () => {
    expect(byPk(8)).toMatchObject({ rescheduled: true, attendance: 3300 });
    expect(nights.filter((n) => n.rescheduled).map((n) => n.gamePk)).toEqual([8]);
  });
  it("detects giveaways by promo name as well as offer type", () => {
    expect(byPk(9)).toMatchObject({ giveaway: true, fireworks: false });
  });
  it("detects fireworks from a promo description only when it announces a show", () => {
    expect(byPk(10)).toMatchObject({ fireworks: true, giveaway: false });
    expect(byPk(10)?.promoNames).toEqual(["Summer Sendoff"]);
    expect(byPk(11)).toMatchObject({ fireworks: false });
  });
  it("credits a multi-night description only to the weekday it ties to fireworks", () => {
    // "Friday night for a drone show, Saturday night for a fireworks show, and Sunday ..." on Fri/Sat/Sun
    expect([12, 13, 14].map((pk) => [byPk(pk)?.weekday, byPk(pk)?.fireworks])).toEqual([[5, false], [6, true], [0, false]]);
  });
  it("counts a weekday-tied description only on that weekday", () => {
    expect(byPk(15)).toMatchObject({ weekday: 6, fireworks: true }); // Saturday game
    expect(byPk(16)).toMatchObject({ weekday: 2, fireworks: false }); // same blurb, Tuesday game
  });
  it("returns [] for malformed input and never throws", () => {
    expect(parseSchedule(null, 11)).toEqual([]);
    expect(parseSchedule({ dates: "nope" }, 11)).toEqual([]);
    expect(parseSchedule({ dates: [{ games: [{ gamePk: "x" }] }] }, 11)).toEqual([]);
  });
});

describe("mergeNights", () => {
  it("dedupes by gamePk keeping the first seen, sorted by date then gamePk", () => {
    const base = parseSchedule(sample, 12);
    const pick = (pk: number) => {
      const n = base.find((x) => x.gamePk === pk);
      if (!n) throw new Error(`missing ${pk}`);
      return n;
    };
    const late = pick(2);
    const early = pick(1);
    const dupFirst = { ...late, attendance: 111 };
    const dupSecond = { ...late, attendance: 222 };
    // reverse order on purpose: later date first, duplicate gamePk differs by attendance
    const merged = mergeNights([[late, dupFirst], [early, dupSecond]]);
    expect(merged.map((n) => n.gamePk)).toEqual([1, 2]);
    expect(merged[1].attendance).toBe(late.attendance); // first occurrence wins
    const swapped = mergeNights([[dupSecond], [dupFirst, early]]);
    expect(swapped.map((n) => n.gamePk)).toEqual([1, 2]);
    expect(swapped[1].attendance).toBe(222);
  });
});
