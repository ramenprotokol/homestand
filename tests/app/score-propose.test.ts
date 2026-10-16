import { describe, expect, it } from "vitest";
import { bundleScore, comparisonSentence, fitFor, labelForZ, zScore } from "../../src/app/score";
import { checkCandidate, inWindow, isFamilySlot } from "../../src/app/propose/rules";
import { propose, type PlanNight, type ThemeFit } from "../../src/app/propose/propose";
import { numbersAreGrounded, numbersIn } from "../../src/app/guard";
import { THEME_LIBRARY, themeById } from "../../src/app/themes/library";

describe("scoring", () => {
  it("bundle score is the mean, and any missing entity makes it null (fixed bundle)", () => {
    expect(bundleScore([0.8, 0.6])).toBeCloseTo(0.7);
    expect(bundleScore([0.8, null])).toBeNull();
    expect(bundleScore([])).toBeNull();
  });
  it("z and the +/-0.5 cut-offs", () => {
    const ref = { n: 40, mean: 0.5, sd: 0.1 };
    expect(zScore(0.6, ref)).toBeCloseTo(1);
    expect(labelForZ(0.5)).toBe("leans-in");
    expect(labelForZ(0.4999)).toBe("average");
    expect(labelForZ(-0.5)).toBe("leans-away");
    expect(labelForZ(-0.4999)).toBe("average");
    expect(fitFor(0.55, ref)).toMatchObject({ label: "leans-in" });
    expect(fitFor(0.44, ref)).toMatchObject({ label: "leans-away" });
    expect(fitFor(0.5, ref)).toMatchObject({ label: "average", z: 0 });
  });
  it("is not scored with no score, no reference, or a flat reference", () => {
    expect(fitFor(null, { n: 40, mean: 0.5, sd: 0.1 }).label).toBe("not-scored");
    expect(fitFor(0.5, undefined).label).toBe("not-scored");
    expect(fitFor(0.5, { n: 40, mean: 0.5, sd: 0 })).toMatchObject({ label: "not-scored", z: null });
    expect(fitFor(0.5, { n: 40, mean: 0.5, sd: 0 }).reason).toContain("barely differ");
  });
  it("explains in plain words without claiming attendance", () => {
    expect(comparisonSentence("Bluey", "leans-in")).toBe("This market leans toward Bluey more than most ballpark markets.");
    expect(comparisonSentence("Bluey", "leans-away")).toContain("less than most");
  });
});

describe("number guard", () => {
  it("accepts only numbers that appear in the facts", () => {
    expect(numbersIn("z of 1.4 and 55% of 1,200")).toEqual([1.4, 55, 1200]);
    expect(numbersAreGrounded("It sits 1.4 above.", [1.4])).toBe(true);
    expect(numbersAreGrounded("It sits 1.4 above.", [1.44])).toBe(true);
    expect(numbersAreGrounded("It sits 2.4 above.", [1.4])).toBe(false);
    expect(numbersAreGrounded("No digits at all.", [])).toBe(true);
    expect(numbersAreGrounded("Boosts attendance 12%.", [1.4, 0.5])).toBe(false);
  });
});

const fit = (label: ThemeFit["label"], z: number | null): ThemeFit => ({ label, z, score: 0.5 });
const night = (index: number, date: string, themeId: string | null, extra: Partial<PlanNight> = {}): PlanNight => ({ index, date, themeId, sponsor: "", locked: false, notes: "", ...extra });
const T = (id: string) => themeById(id)!;

describe("constraint rules", () => {
  it("date windows wrap and bind", () => {
    expect(inWindow("2026-12-25", T("grinch").window)).toBe(true);
    expect(inWindow("2026-07-25", T("grinch").window)).toBe(false);
    expect(inWindow("2026-09-12", T("hocus-pocus").window)).toBe(true);
    expect(inWindow("2026-04-12", T("hocus-pocus").window)).toBe(false);
    expect(inWindow("2026-01-02", { from: "11-01", to: "02-28" })).toBe(true);
    expect(inWindow("2026-06-01", undefined)).toBe(true);
  });
  it("kids themes need a weekend or a day game", () => {
    expect(isFamilySlot({ date: "2026-04-11", notes: "" })).toBe(true); // Saturday
    expect(isFamilySlot({ date: "2026-04-10", notes: "" })).toBe(false); // Friday
    expect(isFamilySlot({ date: "2026-04-10", notes: "11am day game" })).toBe(true);
    const r = checkCandidate({ date: "2026-04-10", notes: "" }, T("margaritaville"), T("bluey"), new Set(), false);
    expect(r).toMatchObject({ ok: false, reason: "audience" });
  });
  it("a kids night is never handed to an adult theme", () => {
    expect(checkCandidate({ date: "2026-04-11", notes: "" }, T("bluey"), T("taylor-swift"), new Set(), false)).toMatchObject({ ok: false, reason: "audience" });
    expect(checkCandidate({ date: "2026-04-11", notes: "" }, T("bluey"), T("paw-patrol"), new Set(), false).ok).toBe(true);
  });
  it("blocks repeats unless allowed", () => {
    const used = new Set(["paw-patrol"]);
    expect(checkCandidate({ date: "2026-04-11", notes: "" }, T("bluey"), T("paw-patrol"), used, false)).toMatchObject({ reason: "duplicate" });
    expect(checkCandidate({ date: "2026-04-11", notes: "" }, T("bluey"), T("paw-patrol"), used, true).ok).toBe(true);
  });
  it("blocks out-of-window holiday themes", () => {
    expect(checkCandidate({ date: "2026-07-18", notes: "" }, T("elvis"), T("grinch"), new Set(), false)).toMatchObject({ reason: "window" });
  });
});

describe("proposals", () => {
  const library = THEME_LIBRARY;
  const fits: Record<string, ThemeFit> = {};
  for (const t of library) fits[t.id] = fit("average", 0);
  Object.assign(fits, {
    elvis: fit("leans-away", -1.5), "taylor-swift": fit("leans-away", -0.8), bluey: fit("leans-away", -2),
    "paw-patrol": fit("leans-in", 1.2), "grateful-dead": fit("leans-in", 1.9), "yellowstone": fit("leans-in", 1.0), grinch: fit("leans-in", 3), pokemon: fit("leans-in", 0.7),
  });
  const base = { library, fits, allowDuplicates: false, now: "2026-10-15T00:00:00.000Z" };

  it("never swaps a locked night; it offers a worded angle instead", () => {
    const res = propose({ ...base, nights: [night(0, "2026-07-03", "elvis", { locked: true, sponsor: "Harbor Credit Union" })] });
    expect(res.proposals).toEqual([]);
    expect(res.angles).toHaveLength(1);
    expect(res.angles[0]!.text).toContain("locked, so it stays");
    expect(res.angles[0]!.text).toContain("Harbor Credit Union");
  });
  it("swaps an unlocked leans-away night, keeping date and sponsor, and respects windows (no Grinch in July)", () => {
    const res = propose({ ...base, nights: [night(0, "2026-07-03", "elvis", { sponsor: "Harbor Credit Union" })] });
    expect(res.proposals).toHaveLength(1);
    const p = res.proposals[0]!;
    expect(p).toMatchObject({ date: "2026-07-03", fromThemeId: "elvis", toThemeId: "grateful-dead", sponsor: "Harbor Credit Union" });
    expect(p.toThemeId).not.toBe("grinch");
    expect(p.why).toContain("The date and the sponsor stay the same");
    expect(res.trace.some((s) => s.kind === "constraint" && s.detail?.includes("window 1"))).toBe(true);
  });
  it("does not use one replacement twice, and not a theme already on the calendar", () => {
    const res = propose({ ...base, nights: [night(0, "2026-07-03", "elvis"), night(1, "2026-07-10", "taylor-swift"), night(2, "2026-07-17", "yellowstone")] });
    const targets = res.proposals.map((p) => p.toThemeId);
    expect(new Set(targets).size).toBe(targets.length);
    expect(targets).not.toContain("yellowstone");
  });
  it("lets repeats through only when allowed", () => {
    const nights = [night(0, "2026-07-03", "elvis"), night(1, "2026-07-10", "taylor-swift")];
    expect(propose({ ...base, nights }).proposals.map((p) => p.toThemeId)).toEqual(["grateful-dead", "yellowstone"]);
    expect(propose({ ...base, allowDuplicates: true, nights }).proposals.map((p) => p.toThemeId)).toEqual(["grateful-dead", "grateful-dead"]);
  });
  it("keeps weekday type sensible: Bluey on a Saturday stays kid-friendly", () => {
    const res = propose({ ...base, nights: [night(0, "2026-04-11", "bluey")] });
    expect(res.proposals[0]!.toThemeId).toBe("paw-patrol");
  });
  it("leaves a night unfixed when nothing passes", () => {
    const res = propose({ ...base, fits: { ...fits, "paw-patrol": fit("average", 0), pokemon: fit("average", 0) }, nights: [night(0, "2026-04-11", "bluey")] });
    expect(res.proposals).toEqual([]);
    expect(res.unfixed).toHaveLength(1);
  });
  it("only touches leans-away nights", () => {
    const res = propose({ ...base, nights: [night(0, "2026-07-03", "paw-patrol"), night(1, "2026-07-04", null)] });
    expect(res.proposals).toEqual([]);
  });
});
