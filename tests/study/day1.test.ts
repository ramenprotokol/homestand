import { describe, expect, it } from "vitest";
import type { SearchHit } from "../../src/qloo/client";
import {
  bundleScore, chooseRadius, emptyThemes, noLocalSignal, withoutKeys, evaluateShape, maxAbsDiff, nationalPopularity, needsLocalityFallback, normalizeName, pickEntity,
  type RadiusResult,
} from "../../src/study/day1";
import { BUNDLE_ENTITIES } from "../../src/study/bundles";
import { STUDY_THEMES } from "../../src/study/themes";

const hit = (name: string, releaseYear: number | null = null, entityId = name): SearchHit => ({ entityId, name, types: [], releaseYear, popularity: null });

describe("pickEntity", () => {
  it("matches names ignoring case, punctuation and diacritics", () => {
    expect(normalizeName("Spider-Man: No Way Home")).toBe("spider man no way home");
    expect(normalizeName("Harry Potter and the Sorcerer’s Stone")).toBe(normalizeName("harry potter and the sorcerers stone"));
    expect(normalizeName("Beyoncé")).toBe("beyonce");
  });
  it("requires an exact name, not a prefix", () => {
    expect(pickEntity([hit("Frozen II", 2019), hit("Frozen 2")], { names: ["Frozen"] })).toBeNull();
  });
  it("requires the release year when one is given", () => {
    const c = [hit("Cinderella", 2015, "new"), hit("Cinderella", 1950, "old")];
    expect(pickEntity(c, { names: ["Cinderella"], year: 1950 })?.entityId).toBe("old");
    expect(pickEntity([hit("Cinderella")], { names: ["Cinderella"], year: 1950 })).toBeNull();
  });
  it("accepts an explicit alias", () => {
    const c = [hit("Harry Potter and the Philosopher's Stone", 2001)];
    expect(pickEntity(c, { names: ["Harry Potter and the Sorcerer's Stone"], year: 2001 })).toBeNull();
    expect(pickEntity(c, { names: ["Harry Potter and the Sorcerer's Stone", "Harry Potter and the Philosopher's Stone"], year: 2001 })).not.toBeNull();
  });
});

describe("evaluateShape", () => {
  const ten = (f: (i: number) => number | null) => Array.from({ length: 10 }, (_, i) => f(i));
  it("passes at 10/10 with variation", () => {
    expect(evaluateShape({ a: ten((i) => i / 10) }).pass).toBe(true);
  });
  it("fails coverage at 9/10", () => {
    const r = evaluateShape({ a: ten((i) => (i === 3 ? null : i / 10)) });
    expect(r).toMatchObject({ pass: false, coverage: false, varies: true, missing: ["a"] });
  });
  it("fails variation for a flat entity", () => {
    const r = evaluateShape({ a: ten((i) => i / 10), b: ten(() => 0.5) });
    expect(r).toMatchObject({ pass: false, coverage: true, varies: false, flat: ["b"] });
  });
});

describe("radius choice", () => {
  const res = (radiusM: number, coverage: boolean, varies = true): RadiusResult => ({
    radiusM, evaluation: { pass: coverage && varies, coverage, varies, missing: [], flat: [] },
  });
  it("picks the smallest passing radius", () => {
    expect(chooseRadius([res(80000, true), res(40000, false), res(60000, true)])).toBe(60000);
    expect(chooseRadius([res(40000, false)])).toBeNull();
  });
  it("falls back to locality only when every radius fails coverage", () => {
    expect(needsLocalityFallback([res(40000, false), res(60000, false)])).toBe(true);
    expect(needsLocalityFallback([res(40000, false), res(60000, true, false)])).toBe(false);
    expect(needsLocalityFallback([])).toBe(false);
  });
});

describe("scores", () => {
  it("averages only the entities with values", () => {
    expect(bundleScore([0.5, null, 0.9])).toBeCloseTo(0.7);
    expect(bundleScore([null])).toBeNull();
    expect(nationalPopularity([0.2, 0.4])).toBeCloseTo(0.3);
  });
  it("maxAbsDiff is infinite when one side is missing", () => {
    expect(maxAbsDiff([0.1, 0.5], [0.1, 0.5])).toBe(0);
    expect(maxAbsDiff([0.1, null], [0.4, null])).toBeCloseTo(0.3);
    expect(maxAbsDiff([0.1, null], [0.1, 0.2])).toBe(Infinity);
  });
});

describe("bundles", () => {
  it("cover all nine themes with unique keys", () => {
    expect(new Set(BUNDLE_ENTITIES.map((e) => e.theme))).toEqual(new Set(STUDY_THEMES.map((t) => t.id)));
    expect(new Set(BUNDLE_ENTITIES.map((e) => e.key)).size).toBe(BUNDLE_ENTITIES.length);
  });
});

describe("no local signal", () => {
  const t1 = { a: [0.1, null], b: [null, null], c: [null, null] };
  const t2 = { a: [null, null], b: [null, null], c: [null, 0.4] };
  it("flags only entities empty at every club in every table", () => {
    expect(noLocalSignal([t1, t2])).toEqual(["b"]);
    expect(noLocalSignal([t1])).toEqual(["b", "c"]);
  });
  it("leaves partial-coverage entities in, so they still fail criterion (1)", () => {
    const table = { a: [0.1, null, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.2], b: Array.from({ length: 10 }, () => null) };
    const kept = withoutKeys(table, noLocalSignal([table]));
    expect(Object.keys(kept)).toEqual(["a"]);
    expect(evaluateShape(kept)).toMatchObject({ pass: false, coverage: false, missing: ["a"] });
  });
  it("reports themes with no kept entity", () => {
    const theme = { x1: "x", x2: "x", y1: "y" } as Record<string, string>;
    expect(emptyThemes(theme, ["x", "y"], ["x1"])).toEqual(["y"]);
    expect(emptyThemes(theme, ["x", "y"], ["x1", "y1"])).toEqual([]);
  });
});
