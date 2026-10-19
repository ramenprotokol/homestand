import { describe, expect, it } from "vitest";
import { DISCOVERY_REFERENCE, discoveryZ, IDEA_POPULARITY, rankPool, standsOut, SWAP_POPULARITY, syntheticDiscoveryReference, worthAnIdea, worthASwap } from "../../src/app/discovery";
import { COMMITTED_IDS } from "../../src/app/themes/ids";
import { THEME_LIBRARY } from "../../src/app/themes/library";
import { libraryTitleMatcher } from "../../src/app/themes/match";

describe("discovery z and ranking", () => {
  const stat = { n: 40, mean: 0.8, sd: 0.05 };
  it("is the reading's distance from the title's own spread over the reference markets", () => {
    expect(discoveryZ(0.9, stat)).toBeCloseTo(2, 6);
    expect(discoveryZ(0.7, stat)).toBeCloseTo(-2, 6);
    expect(discoveryZ(null, stat)).toBeNull();
    expect(discoveryZ(0.9, undefined)).toBeNull();
    expect(discoveryZ(0.9, { n: 10, mean: 0.8, sd: 0.05 })).toBeNull(); // too few markets
    expect(discoveryZ(0.9, { n: 40, mean: 0.8, sd: 0 })).toBeNull(); // no spread to rank by
  });
  it("stands out at the same bar the library uses for Leans in", () => {
    expect(standsOut({ z: 0.5 })).toBe(true);
    expect(standsOut({ z: 0.49 })).toBe(false);
    expect(standsOut({ z: -2 })).toBe(false);
    expect(standsOut({ z: null })).toBe(false);
    expect(standsOut({})).toBe(false);
  });
  it("ranks the pool by z, best first, per type, and leaves out titles with no reading", () => {
    const ref = syntheticDiscoveryReference();
    const readings = new Map<string, number | null>([["SYN-D-movie-0", 0.75], ["SYN-D-movie-1", 0.95], ["SYN-D-movie-2", 0.6], ["SYN-D-movie-3", null], ["SYN-D-tv_show-0", 0.9]]);
    const movies = rankPool(readings, ref, "movie");
    expect(movies.map((m) => m.entityId)).toEqual(["SYN-D-movie-1", "SYN-D-movie-0", "SYN-D-movie-2"]);
    expect(movies[0]!.z).toBeCloseTo(2.5, 6);
    expect(rankPool(readings, ref, "tv_show").map((m) => m.entityId)).toEqual(["SYN-D-tv_show-0"]);
  });
  it("gives different cities different winners from the same pool", () => {
    const ref = syntheticDiscoveryReference();
    const a = rankPool(new Map([["SYN-D-movie-0", 0.95], ["SYN-D-movie-1", 0.6]]), ref, "movie")[0]!.entityId;
    const b = rankPool(new Map([["SYN-D-movie-0", 0.6], ["SYN-D-movie-1", 0.95]]), ref, "movie")[0]!.entityId;
    expect(a).not.toBe(b);
  });
});

describe("recognisable titles only", () => {
  it("a swap needs popularity 0.90 and to stand out; an idea needs 0.85", () => {
    expect(SWAP_POPULARITY).toBe(0.9);
    expect(IDEA_POPULARITY).toBe(0.85);
    expect(worthASwap({ z: 1, popularity: 0.9 })).toBe(true);
    expect(worthASwap({ z: 1, popularity: 0.89 })).toBe(false);
    expect(worthASwap({ z: 0.2, popularity: 0.99 })).toBe(false);
    expect(worthASwap({ z: 1 })).toBe(false); // no popularity: not recognisable
    expect(worthAnIdea({ z: 1, popularity: 0.85 })).toBe(true);
    expect(worthAnIdea({ z: 1, popularity: 0.84 })).toBe(false);
    expect(worthAnIdea({ z: -1, popularity: 0.99 })).toBe(false);
  });
  it("the pool carries each title's popularity through the ranking", () => {
    const ref = syntheticDiscoveryReference();
    expect(rankPool(new Map([["SYN-D-movie-0", 0.9]]), ref, "movie")[0]).toMatchObject({ popularity: 0.95 });
  });
});

describe("the committed discovery reference", () => {
  const ref = DISCOVERY_REFERENCE;
  it("is a pool plus per-title aggregates over the same 40 reference markets, and nothing market-level", () => {
    expect(ref.synthetic).toBe(false);
    expect(ref.markets).toBe(40);
    expect(ref.pool.length).toBeGreaterThanOrEqual(30);
    expect(ref.pool.length).toBeLessThanOrEqual(120);
    expect(new Set(ref.pool.map((p) => p.entityId)).size).toBe(ref.pool.length);
    for (const p of ref.pool) {
      expect(Object.keys(p).sort()).toEqual(["entityId", "name", "popularity", "type"]);
      expect(p.popularity).toBeGreaterThanOrEqual(0.7); // recognisable titles only; none with a missing popularity
      expect(["movie", "tv_show"]).toContain(p.type);
      const s = ref.stats[p.entityId]!;
      expect(Object.keys(s).sort()).toEqual(["mean", "n", "sd"]);
      expect(s.n).toBeGreaterThanOrEqual(20);
      expect(s.n).toBeLessThanOrEqual(40);
      expect(s.sd).toBeGreaterThan(0);
      expect(s.mean).toBeGreaterThan(0);
      expect(s.mean).toBeLessThanOrEqual(1);
    }
    expect(Object.keys(ref.stats).sort()).toEqual(ref.pool.map((p) => p.entityId).sort());
    expect(ref.pool.some((p) => p.type === "movie")).toBe(true);
    expect(ref.pool.some((p) => p.type === "tv_show")).toBe(true);
  });
  it("has no title that is already a library theme", () => {
    const isLibrary = libraryTitleMatcher(new Set(Object.values(COMMITTED_IDS).map((v) => v.id)), THEME_LIBRARY);
    expect(ref.pool.filter((p) => isLibrary(p.entityId, p.name)).map((p) => p.name)).toEqual([]);
  });
});
