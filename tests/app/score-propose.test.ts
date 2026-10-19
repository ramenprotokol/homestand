import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AUDIT_LINE, bundleScore, centre, comparisonSentence, fitFor, labelForZ, marketLevelSentence, pullWords, vsAverage, zScore } from "../../src/app/score";
import { checkCandidate, inWindow, isFamilySlot } from "../../src/app/propose/rules";
import { propose, templateWhy, likeness, type PlanNight, type ThemeFit } from "../../src/app/propose/propose";
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
    expect(fitFor(0.5, { n: 9, mean: 0.5, sd: 0.1 }).label).toBe("not-scored");
    expect(fitFor(0.5, { n: 40, mean: 0.5, sd: 0 })).toMatchObject({ label: "not-scored", z: null });
    expect(fitFor(0.5, { n: 40, mean: 0.5, sd: 0 }).reason).toContain("barely differ");
  });
  it("explains in plain words without claiming attendance", () => {
    expect(comparisonSentence("Bluey", "leans-in")).toBe("Against its own average, Bluey stands out above.");
    expect(comparisonSentence("Bluey", "leans-away")).toContain("stands out below");
    expect(marketLevelSentence(-1.1)).toBe("Compared with other ballpark markets, this market scores lower than usual on most themes.");
    expect(marketLevelSentence(0.9)).toContain("higher than usual");
    expect(marketLevelSentence(0.1)).toContain("about the same as usual");
    expect(vsAverage(1.14)).toBe("stands out above this market's average (+1.1)");
    expect(vsAverage(-0.8)).toBe("sits below this market's average (-0.8)");
  });
});

describe("market-centred index", () => {
  const base = [0.2, -0.4, 0.9, -0.1, 0.3, -0.6, 0.5, 0.0, -0.3, 0.1];
  const labels = (zs: Array<number | null>) => centre(zs).indices.map((i) => (i === null ? null : labelForZ(i)));

  it("a market shifted uniformly across every theme changes no label and no index", () => {
    const a = centre(base);
    for (const shift of [-3, -1.2, 2.5]) {
      const b = centre(base.map((z) => z + shift));
      b.indices.forEach((v, i) => expect(v).toBeCloseTo(a.indices[i]!, 10));
      expect(b.mean).toBeCloseTo(a.mean! + shift, 10);
    }
  });
  it("a market that is low on everything gets all About average, not all Leans away", () => {
    expect(new Set(labels(base.map((z) => z * 0.1 - 2.2)))).toEqual(new Set(["average"]));
    // Plain z would have called all of these Leans away.
    expect(labelForZ(-2.2)).toBe("leans-away");
  });
  it("a single-theme spike stands out as Leans in, and the rest stay level", () => {
    const zs = [0, 0, 0, 0, 0, 0, 0, 0, 0, 3.5].map((z) => z - 2); // low market overall, one spike
    const l = labels(zs);
    expect(l[9]).toBe("leans-in");
    expect(l.slice(0, 9).every((x) => x === "average")).toBe(true);
  });
  it("the average excludes not-scored themes, and a thin market has no average", () => {
    const withGaps = centre([1, null, 3, null, 2, 4, 0]);
    expect(withGaps.count).toBe(5);
    expect(withGaps.mean).toBeCloseTo(2, 10);
    expect(withGaps.indices[1]).toBeNull();
    expect(withGaps.indices[0]).toBeCloseTo(-1, 10);
    const thin = centre([1, 2, null, 3]);
    expect(thin.mean).toBeNull();
    expect(thin.indices).toEqual([null, null, null, null]);
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
  it("hard audience rule: kids and family nights only take kids or family themes", () => {
    const sat = { date: "2026-04-11", notes: "" };
    // The live cases the judge saw: Super Mario to Taylor Swift, Star Wars to Yellowstone, Marvel to Garth Brooks.
    for (const [from, to] of [["super-mario", "taylor-swift"], ["star-wars", "yellowstone"], ["marvel", "garth-brooks"], ["dinosaur", "beatles"], ["peanuts", "elvis"]] as const) {
      expect(checkCandidate(sat, T(from), T(to), new Set(), false), `${from} to ${to}`).toMatchObject({ ok: false, reason: "audience" });
    }
    expect(checkCandidate(sat, T("super-mario"), T("pokemon"), new Set(), false).ok).toBe(true);
    expect(checkCandidate(sat, T("star-wars"), T("batman"), new Set(), false).ok).toBe(true);
    // Adult nights may take adult or family themes; kids' themes only at a weekend or day game.
    expect(checkCandidate({ date: "2026-04-10", notes: "" }, T("elvis"), T("batman"), new Set(), false).ok).toBe(true);
    expect(checkCandidate({ date: "2026-04-10", notes: "" }, T("elvis"), T("bluey"), new Set(), false).ok).toBe(false);
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
    expect(res.trace.some((s) => s.kind === "constraint" && s.detail?.includes("1 outside its date window"))).toBe(true);
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
  it("a family night with only adult themes leaning in is unfixed, with a family-specific reason", () => {
    const f2 = { ...fits, "paw-patrol": fit("average", 0), pokemon: fit("average", 0) };
    const res = propose({ ...base, fits: { ...f2, "super-mario": fit("leans-away", -1) }, nights: [night(0, "2026-04-11", "super-mario")] });
    expect(res.proposals).toEqual([]);
    expect(res.unfixed[0]!.reason).toBe("No family theme leans in here that fits this date.");
  });
  it("a locked Country night is never offered a kids' theme as a touch", () => {
    const f3 = { ...fits, "country": fit("leans-away", -1), dinosaur: fit("leans-in", 3), "paw-patrol": fit("leans-in", 3) };
    const res = propose({ ...base, fits: f3, nights: [night(0, "2026-04-11", "country", { locked: true })] });
    expect(res.angles).toHaveLength(1);
    expect(res.angles[0]!.text).not.toMatch(/Dinosaur|PAW Patrol/);
    expect(res.angles[0]!.text).toContain("locked, so it stays");
  });
  it("hands a kids or family night the library cannot fix to a discovered Qloo title, never repeating one", () => {
    const f2 = { ...fits, "paw-patrol": fit("average", 0), pokemon: fit("average", 0), "super-mario": fit("leans-away", -1), bluey: fit("leans-away", -2) };
    const discovered = [
      { name: "Kite Club", entityId: "m1", type: "movie" as const, affinity: 0.9 },
      { name: "Puddle Patrol", entityId: "s1", type: "tv_show" as const, affinity: 0.9 },
    ];
    const res = propose({ ...base, fits: f2, discovered, city: "Tulsa", nights: [night(0, "2026-04-11", "bluey", { sponsor: "Sunrise Dental" }), night(1, "2026-04-18", "super-mario")]});
    expect(res.proposals).toHaveLength(2);
    const [a, b] = res.proposals;
    expect(a).toMatchObject({ fromThemeId: "bluey", toThemeId: "qloo:m1", sponsor: "Sunrise Dental", date: "2026-04-11", to: { label: "found", z: null, score: null }, discovered: { name: "Kite Club" } });
    expect(a!.why).toBe("Qloo ranks Kite Club among the top family movies for fans near Tulsa.");
    expect(b!.toThemeId).toBe("qloo:s1");
    expect(b!.why).toBe("Qloo ranks Puddle Patrol among the top family shows for fans near Tulsa.");
    // Not offered to an adult night, and nothing is left to repeat.
    const adult = propose({ ...base, fits: { ...f2, elvis: fit("leans-away", -2), "grateful-dead": fit("average", 0), yellowstone: fit("average", 0), "taylor-swift": fit("average", 0) }, discovered, nights: [night(0, "2026-04-24", "elvis")] });
    expect(adult.proposals).toEqual([]);
    expect(adult.unfixed).toHaveLength(1);
  });
  it("a locked night gets a cross-theme touch only from the same kind of theme", () => {
    const f4 = { ...fits, "star-trek": fit("leans-away", -1), wrestling: fit("leans-in", 3), "star-wars": fit("leans-in", 0.6), country: fit("leans-away", -1), "stranger-things": fit("leans-in", 3), "garth-brooks": fit("leans-in", 0.6) };
    const trek = propose({ ...base, fits: f4, nights: [night(0, "2026-04-11", "star-trek", { locked: true })] });
    expect(trek.angles[0]!.text).toMatch(/Star Wars|PAW Patrol/);
    expect(trek.angles[0]!.text).not.toContain("Pro wrestling");
    const country = propose({ ...base, fits: f4, nights: [night(0, "2026-04-11", "country", { locked: true })] });
    expect(country.angles[0]!.text).toMatch(/Grateful Dead|Garth Brooks/);
    expect(country.angles[0]!.text).not.toContain("Stranger Things");
    const lonely = propose({ ...base, fits: { ...f4, "garth-brooks": fit("average", 0), "grateful-dead": fit("average", 0) }, nights: [night(0, "2026-04-11", "country", { locked: true })] });
    expect(lonely.angles[0]!.text).toContain("A sponsor-friendly angle");
  });
  it("only touches leans-away nights", () => {
    const res = propose({ ...base, nights: [night(0, "2026-07-03", "paw-patrol"), night(1, "2026-07-04", null)] });
    expect(res.proposals).toEqual([]);
  });

  describe("like-for-like ranking and alternates", () => {
    const f: Record<string, ThemeFit> = {};
    for (const t of library) f[t.id] = fit("average", 0);
    Object.assign(f, {
      "harry-potter": fit("leans-away", -1.5), ghostbusters: fit("leans-away", -1), bluey: fit("leans-away", -1.2),
      "taylor-swift": fit("leans-in", 3), "bad-bunny": fit("leans-in", 2.5), "star-wars": fit("leans-in", 0.6), "star-trek": fit("leans-in", 0.9), marvel: fit("leans-in", 0.7),
      "paw-patrol": fit("leans-in", 0.6), dinosaur: fit("leans-in", 0.8), "grinch": fit("leans-in", 4),
    });
    const base2 = { library, fits: f, allowDuplicates: false, now: "2026-10-15T00:00:00.000Z" };

    it("ranks the same category first, even when another theme leans in harder", () => {
      const res = propose({ ...base2, nights: [night(0, "2026-05-09", "harry-potter")] });
      const p = res.proposals[0]!;
      expect(T(p.toThemeId).category).toBe("film");
      expect(p.toThemeId).toBe("star-trek"); // film, z 0.9 beats film z 0.6; Taylor Swift (z 3) is a different category
      expect(res.trace.some((s) => s.detail?.includes("same category"))).toBe(true);
    });
    it("falls back to the same audience, then to anything", () => {
      expect(likeness(T("bluey"), T("paw-patrol"))).toBe(0);
      expect(likeness(T("bluey"), T("minecraft"))).toBe(1);
      expect(likeness(T("bluey"), T("elvis"))).toBe(2);
      // Ghostbusters (film, family): film candidates removed, so the same audience (family) wins over adult.
      const noFilms = { ...f, "star-wars": fit("average", 0), "star-trek": fit("average", 0), marvel: fit("average", 0), wrestling: fit("leans-in", 0.55) };
      const res = propose({ ...base2, fits: noFilms, nights: [night(0, "2026-05-09", "ghostbusters")] });
      // Wrestling is family-audience like Ghostbusters: it beats Taylor Swift (adult, z 3) and Bad Bunny.
      expect(res.proposals[0]!.toThemeId).toBe("wrestling");
    });
    it("offers up to two alternates that pass the same constraints", () => {
      const res = propose({ ...base2, nights: [night(0, "2026-05-09", "harry-potter")] });
      const p = res.proposals[0]!;
      expect(p.alternates.map((a) => a.toThemeId)).toEqual(["marvel", "star-wars"]);
      for (const a of p.alternates) {
        expect(a.to.label).toBe("leans-in");
        expect(checkCandidate({ date: p.date, notes: "" }, T("harry-potter"), T(a.toThemeId), new Set(), false).ok).toBe(true);
      }
    });
    it("alternates respect windows, audience, repeats and other proposals' picks", () => {
      // Kids night on a Friday evening with the original adult: Bluey is kids, so adult-only and window themes must not appear.
      const res = propose({ ...base2, nights: [night(0, "2026-07-10", "ghostbusters"), night(1, "2026-07-17", "harry-potter"), night(2, "2026-07-18", "bluey")] });
      const tops = res.proposals.map((p) => p.toThemeId);
      expect(new Set(tops).size).toBe(tops.length);
      for (const p of res.proposals) {
        const orig = T(p.fromThemeId);
        for (const a of p.alternates) {
          expect(tops).not.toContain(a.toThemeId); // another proposal's pick
          expect(a.toThemeId).not.toBe("grinch"); // out of window in July
          expect(checkCandidate({ date: p.date, notes: "" }, orig, T(a.toThemeId), new Set(), false).ok).toBe(true);
        }
      }
      const bluey = res.proposals.find((p) => p.fromThemeId === "bluey")!;
      for (const a of [bluey.toThemeId, ...bluey.alternates.map((x) => x.toThemeId)]) expect(T(a).audience).not.toBe("adult");
    });
    it("with repeats allowed, alternates may repeat another pick", () => {
      const res = propose({ ...base2, allowDuplicates: true, nights: [night(0, "2026-05-09", "harry-potter"), night(1, "2026-05-16", "ghostbusters")] });
      expect(res.proposals[0]!.toThemeId).toBe(res.proposals[1]!.toThemeId);
    });
  });

  it("the template reason reads correctly with and without a sponsor", () => {
    expect(templateWhy(T("elvis"), T("grateful-dead"), "")).toContain("The date stays the same.");
    expect(templateWhy(T("elvis"), T("grateful-dead"), "")).not.toContain("stay the same");
    expect(templateWhy(T("elvis"), T("grateful-dead"), "Acme Bank")).toContain("The date and the sponsor stay the same.");
  });
});

describe("plain-words copy", () => {
  it("describes local pull from the sign and size of the index", () => {
    expect(pullWords(-2.14)).toBe("well below this town's usual");
    expect(pullWords(-0.7)).toBe("below this town's usual");
    expect(pullWords(0.1)).toBe("about this town's usual");
    expect(pullWords(0.8)).toBe("above this town's usual");
    expect(pullWords(1.6)).toBe("well above this town's usual");
    expect(pullWords(null)).toBe("not compared");
  });
  it("keeps the audit line in step with the published study", () => {
    const r = JSON.parse(readFileSync("study/results.json", "utf8")) as { counts: { nightsInput: number }; h1: { accuracy: { estimate: number } } };
    expect(AUDIT_LINE).toContain(`${r.counts.nightsInput} real 2025 nights`);
    expect(AUDIT_LINE).toContain(`${Math.round(r.h1.accuracy.estimate * 100)} times in 100`);
    expect(AUDIT_LINE).not.toMatch(/H1|found no link/);
  });
});
