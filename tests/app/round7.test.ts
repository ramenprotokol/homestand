import { describe, expect, it } from "vitest";
import { matchPoolTitle } from "../../src/app/calendar/pooltitle";
import { poolOffset, rankPool, syntheticDiscoveryReference } from "../../src/app/discovery";
import { exportCsv } from "../../src/app/export/csv";
import { hungarian, pickAngle, propose, withinOneTier, type PlanNight, type SponsorAngle, type ThemeFit } from "../../src/app/propose/propose";
import { bridgeSentence, fitWord } from "../../src/app/score";
import { withArticle } from "../../src/app/text";
import { parseCalendar } from "../../src/app/calendar/csv";
import type { Theme } from "../../src/app/themes/library";

const ent = [{ key: "k", type: "artist" as const, query: "q", names: ["q"], id: "x" }];
const music = (id: string, genre: Theme["genre"]): Theme => ({ id, label: id.toUpperCase(), aliases: [], category: "music", audience: "adult", genre, entities: ent });
const fit = (label: ThemeFit["label"], z: number): ThemeFit => ({ label, z, score: 0.5 });

describe("joint assignment", () => {
  it("finds the cheapest assignment, not the first come", () => {
    // Row 0 would take column 0 greedily (cost 1), but then row 1 pays 100. Jointly: row 0 takes column 1 (2), row 1 takes column 0 (1).
    expect(hungarian([[1, 2], [1, 100]])).toEqual([1, 0]);
    expect(hungarian([[5, 9, 1], [4, 2, 8]])).toEqual([2, 1]);
  });

  it("gives a country night the country act and leaves the other night something else (club)", () => {
    // Two weak nights both want the strongest candidate. Garth (country) must get Kenny (country), not the Beatles; the wrestling night takes the Beatles.
    const lib: Theme[] = [music("garth", "country"), { ...music("wrestling", undefined), category: "sports entertainment", audience: "teen", genre: undefined }, music("kenny", "country"), music("beatles", "classic-rock")];
    const fits: Record<string, ThemeFit> = { garth: fit("leans-away", -1.5), wrestling: fit("leans-away", -2), kenny: fit("leans-in", 1.2), beatles: fit("leans-in", 1.8) };
    const nights: PlanNight[] = [
      { index: 0, date: "2027-07-02", themeId: "garth", sponsor: "", locked: false, notes: "" },
      { index: 1, date: "2027-07-09", themeId: "wrestling", sponsor: "", locked: false, notes: "" },
    ];
    const r = propose({ nights, library: lib, fits, allowDuplicates: false, now: "t" });
    const by = Object.fromEntries(r.proposals.map((p) => [p.fromThemeId, p.toThemeId]));
    expect(by.garth).toBe("kenny");
    expect(by.wrestling).toBe("beatles");
  });
});

describe("locked-night add-ons", () => {
  const angle: SponsorAngle = {
    index: 3, date: "2027-06-01", themeId: "a", sponsor: "", toThemeId: "x", text: "first",
    generic: "generic",
    options: [{ toThemeId: "x", text: "first" }, { toThemeId: "y", text: "second" }],
  };
  it("never offers a theme that is already a swap, and re-picks when the swap changes", () => {
    expect(pickAngle(angle, new Set()).text).toBe("first");
    expect(pickAngle(angle, new Set(["x"]))).toMatchObject({ toThemeId: "y", text: "second" });
    expect(pickAngle(angle, new Set(["x", "y"]))).toMatchObject({ toThemeId: "a", text: "generic" });
  });
});

describe("family titles named on a calendar", () => {
  const pool = [{ entityId: "1", name: "The Lion King" }, { entityId: "2", name: "Inside Out 2" }, { entityId: "3", name: "Sing" }, { entityId: "4", name: "Sing 2" }];
  it("matches a whole-word title, with or without 'The', and never guesses", () => {
    expect(matchPoolTitle("Lion King Night", pool)?.entityId).toBe("1");
    expect(matchPoolTitle("The Lion King Day", pool)?.entityId).toBe("1");
    expect(matchPoolTitle("Inside Out Night", pool)).toBeNull(); // the pool has the sequel, not this title
    expect(matchPoolTitle("Sing 2 Night", pool)?.entityId).toBe("4"); // the longer title wins
    expect(matchPoolTitle("Sing Along Night", pool)).toBeNull(); // four letters is too short to match
  });
});

describe("discovery z is centred on the market's own pool average", () => {
  it("a market that scores high on everything does not show most of the pool as standing out", () => {
    const ref = syntheticDiscoveryReference(); // every title: n 40, mean 0.7, sd 0.1
    const high = new Map<string, number | null>(ref.pool.map((p, i) => [p.entityId, 0.9 + (i % 2 === 0 ? 0.02 : -0.02)]));
    const off = poolOffset(high, ref.pool, ref.stats);
    expect(off).toBeCloseTo(2, 5);
    const movies = rankPool(high, ref, "movie", off);
    // Raw z is about +2 for every title; centred, only the ones above the market's own average stand out.
    expect(movies.every((m) => (m.zRaw ?? 0) > 1.5)).toBe(true);
    expect(movies.filter((m) => (m.z ?? 0) >= 0.5).length).toBeLessThan(movies.length);
    expect(poolOffset(new Map([["a", 0.9]]), [{ entityId: "a" }], { a: { n: 40, mean: 0.7, sd: 0.1 } })).toBe(0); // too few to centre
  });
});

describe("copy", () => {
  it("uses the right article", () => {
    expect(withArticle("indie act")).toBe("an indie act");
    expect(withArticle("rock act")).toBe("a rock act");
    expect(withArticle("R&B act")).toBe("an R&B act");
    expect(withArticle("emo act")).toBe("an emo act");
    expect(withArticle("Latin act")).toBe("a Latin act");
  });
  it("says in plain words when the label and the other-markets line disagree", () => {
    expect(bridgeSentence("leans-in", -1.2, "Winnipeg")).toBe("Below most markets, but strong for Winnipeg's own usual taste.");
    expect(bridgeSentence("leans-away", 1.2, "Winnipeg")).toBe("Above most markets, but weak for Winnipeg's own usual taste.");
    expect(bridgeSentence("leans-in", 0.8, "Winnipeg")).toBe("");
    expect(bridgeSentence("average", -1.2, "Winnipeg")).toBe("");
  });
  it("calls a venue's classic night a classic date and its CSV column act", () => {
    expect(fitWord("classic", "venue")).toBe("Classic date");
    expect(fitWord("classic", "club")).toBe("Classic night");
    const rows = [{ date: "2027-06-01", theme: "Journey", sponsor: "", locked: false, notes: "" }];
    expect(exportCsv(rows, "venue").split("\r\n")[0]).toBe("date,act,sponsor,locked,notes");
    expect(exportCsv(rows).split("\r\n")[0]).toBe("date,theme,sponsor,locked,notes");
    expect(parseCalendar(exportCsv(rows, "venue")).rows[0]!.theme).toBe("Journey"); // and it reads back in
  });
});

describe("booking tiers", () => {
  it("allows a swap within one tier only", () => {
    expect(withinOneTier("amphitheatre", "arena")).toBe(true);
    expect(withinOneTier("amphitheatre", "theatre")).toBe(true);
    expect(withinOneTier("amphitheatre", "stadium")).toBe(false);
    expect(withinOneTier("theatre", "arena")).toBe(false);
    expect(withinOneTier(undefined, "stadium")).toBe(true);
  });
});

describe("the sponsor memo", () => {
  const swap = { date: "2027-06-26", weekday: "Saturday", from: "Green Day", to: "Mt. Joy", sponsor: "Triangle Taproom", fromZ: -1, toZ: 0.5, fromScore: 0.9, toScore: 0.9, why: "Mt. Joy stands out.", source: "template" as const, fromEntities: ["Green Day"], toEntities: ["Mt. Joy"], discovered: true };
  const data = { kind: "venue" as const, club: "Raleigh, NC sample amphitheatre", generatedOn: "2027-01-01", swaps: [swap], angles: [], nights: 18, suggested: 2, classic: 2, synthetic: false, recordedLabel: null };
  it("lists the Qloo entities checked, says it once about attendance, and never says 'you approved'", async () => {
    const { buildMemoHtml, memoOpener } = await import("../../src/app/export/memo");
    const html = buildMemoHtml(data);
    expect(html).toContain("Qloo checked Green Day for the planned date (");
    expect(html).toContain("Mt. Joy for the swap (found by Qloo, not scored against the library)");
    expect(html.match(/attendance/gi)).toHaveLength(1);
    expect(memoOpener(data)).not.toMatch(/you approved/i);
    expect(memoOpener(data)).toContain("1 is in the revised calendar");
  });
});

describe("support acts across locked nights", () => {
  it("never gives two locked nights the same add-on", async () => {
    const { pickAngles } = await import("../../src/app/propose/propose");
    const mk = (i: number): SponsorAngle => ({ index: i, date: "2027-06-01", themeId: `h${i}`, sponsor: "", toThemeId: "x", text: "t", generic: "g", options: [{ toThemeId: "x", text: "x" }, { toThemeId: "y", text: "y" }, { toThemeId: "z", text: "z" }] });
    expect(pickAngles([mk(0), mk(1), mk(2)], new Set()).map((a) => a.toThemeId)).toEqual(["x", "y", "z"]);
    expect(pickAngles([mk(0), mk(1)], new Set(["x"])).map((a) => a.toThemeId)).toEqual(["y", "z"]);
  });
});
