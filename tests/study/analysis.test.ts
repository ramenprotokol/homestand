import { describe, expect, it } from "vitest";
import { analyze, pairScore, parseScores, verdictFor, type Scores, type StudyResults } from "../../src/study/analysis";
import { mulberry32, spearman, zScores } from "../../src/study/stats";
import type { ThemeNight } from "../../src/study/summary";
import { STUDY_THEMES, type StudyThemeId } from "../../src/study/themes";

const THEMES: StudyThemeId[] = STUDY_THEMES.map((t) => t.id);
const SEED = 20261030;
const REPS = 200;
const OPTS = { seed: SEED, reps: REPS };
const POPULARITY = Object.fromEntries(THEMES.map((t, i) => [t, 40 + 7 * i])) as Record<StudyThemeId, number>;

type Rng = () => number;
const normal = (rng: Rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const key = (club: string, theme: StudyThemeId) => `${club}|${theme}`;

interface World {
  nights: ThemeNight[];
  clubs: string[];
  ran: Map<string, StudyThemeId[]>;
  themeEffect: Record<StudyThemeId, number>;
}

/** 80 clubs, 9 themes, 2–6 themes per club, 1–2 nights per club-theme; lift = theme effect + club taste + noise. */
function makeWorld(seed: number): World {
  const rng = mulberry32(seed);
  const themeEffect = Object.fromEntries(THEMES.map((t) => [t, 0.1 * normal(rng)])) as Record<StudyThemeId, number>;
  const clubs = Array.from({ length: 80 }, (_, i) => `Club ${String(i).padStart(2, "0")}`);
  const nights: ThemeNight[] = [];
  const ran = new Map<string, StudyThemeId[]>();
  let gamePk = 1;
  for (const club of clubs) {
    const order = [...THEMES];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const themes = order.slice(0, 2 + Math.floor(rng() * 5));
    ran.set(club, themes);
    for (const theme of themes) {
      const taste = 0.15 * normal(rng);
      const count = rng() < 0.3 ? 2 : 1;
      for (let j = 0; j < count; j++) {
        const lift = themeEffect[theme] + taste + 0.02 * normal(rng);
        nights.push({
          gamePk, club, date: "2025-06-01", theme, lift, liftR2: lift + 0.01 * normal(rng), otherPromos: 1,
          lat: 40, lon: -80, city: "X", state: "OH",
        });
        gamePk++;
      }
    }
  }
  return { nights, clubs, ran, themeEffect };
}

/** Naive reference: club-theme mean lift, minus the theme's mean over every club that ran it. */
function clubThemeLifts(nights: ThemeNight[], field: "lift" | "liftR2"): Map<string, number> {
  const acc = new Map<string, number[]>();
  for (const n of nights) acc.set(key(n.club, n.theme), [...(acc.get(key(n.club, n.theme)) ?? []), n[field]]);
  return new Map([...acc].map(([k, xs]) => [k, xs.reduce((s, x) => s + x, 0) / xs.length]));
}
function centredLifts(nights: ThemeNight[], field: "lift" | "liftR2" = "lift"): Map<string, number> {
  const ct = clubThemeLifts(nights, field);
  const themeMean = new Map<string, number>();
  for (const t of THEMES) {
    const xs = [...ct].filter(([k]) => k.endsWith(`|${t}`)).map(([, v]) => v);
    if (xs.length) themeMean.set(t, xs.reduce((s, x) => s + x, 0) / xs.length);
  }
  return new Map([...ct].map(([k, v]) => [k, v - themeMean.get(k.split("|")[1])!]));
}

type Predictor = (club: string, theme: StudyThemeId) => number | null;
/** z within theme over every club scored for it; a theme with one distinct value makes no call (null). */
function zPredictor(raw: Scores["qloo"]): Predictor {
  const z = new Map<string, number | null>();
  for (const t of THEMES) {
    const clubs = Object.keys(raw).filter((c) => raw[c][t] !== undefined);
    const values = clubs.map((c) => raw[c][t]!);
    const zs = zScores(values);
    const flat = new Set(values).size <= 1;
    clubs.forEach((c, i) => z.set(key(c, t), flat ? null : zs[i]));
  }
  return (club, theme) => z.get(key(club, theme)) ?? null;
}
function referenceAccuracy(nights: ThemeNight[], scores: Scores, predictor: Predictor, outcome: Map<string, number>): number {
  const byClub = new Map<string, StudyThemeId[]>();
  for (const n of nights) {
    if (scores.qloo[n.club]?.[n.theme] === undefined || scores.llm[n.club]?.[n.theme] === undefined) continue;
    const list = byClub.get(n.club) ?? [];
    if (!list.includes(n.theme)) list.push(n.theme);
    byClub.set(n.club, list);
  }
  let sum = 0;
  let count = 0;
  for (const [club, themes] of byClub) {
    for (let i = 0; i < themes.length; i++) {
      for (let j = i + 1; j < themes.length; j++) {
        const [a, b] = [themes[i], themes[j]];
        const [pa, pb] = [predictor(club, a), predictor(club, b)];
        const [oa, ob] = [outcome.get(key(club, a))!, outcome.get(key(club, b))!];
        sum += pa === null || pb === null || pa === pb || oa === ob ? 0.5 : Math.sign(pa - pb) === Math.sign(oa - ob) ? 1 : 0;
        count++;
      }
    }
  }
  return sum / count;
}

type ScoreFn = (club: string, theme: StudyThemeId, ran: boolean) => number;
/** Scores for every theme x every club (Amendment 1, A2). */
function scoresFor(world: World, qloo: ScoreFn, llm: ScoreFn): Scores {
  const build = (fn: ScoreFn) =>
    Object.fromEntries(world.clubs.map((c) => [c, Object.fromEntries(THEMES.map((t) => [t, fn(c, t, world.ran.get(c)!.includes(t))]))]));
  return { pulledAt: "2026-10-30T00:00:00Z", qloo: build(qloo), llm: build(llm), nationalPopularity: { ...POPULARITY } };
}

const world = makeWorld(7);
const centred = centredLifts(world.nights);
const noise = mulberry32(99);
const llmRating: ScoreFn = () => 1 + Math.floor(noise() * 10);
const planted: ScoreFn = (c, t, ran) => (ran ? centred.get(key(c, t))! + 0.01 * normal(noise) : 0.15 * normal(noise));
const plantedScores = scoresFor(world, planted, llmRating);
const plantedResults = analyze(world.nights, plantedScores, OPTS);

describe("pairScore and the verdict words", () => {
  it("scores a pair 1 / 0 by sign agreement, and 0.5 on a predictor tie, an outcome tie or no call", () => {
    expect(pairScore(2, 1, 0.3, 0.1)).toBe(1);
    expect(pairScore(2, 1, 0.1, 0.3)).toBe(0);
    expect(pairScore(-1, 1, -0.2, 0.4)).toBe(1);
    expect(pairScore(1, 1, 0.1, 0.3)).toBe(0.5);
    expect(pairScore(2, 1, 0.3, 0.3)).toBe(0.5);
    expect(pairScore(null, 1, 0.3, 0.1)).toBe(0.5);
    expect(pairScore(2, null, 0.3, 0.1)).toBe(0.5);
  });
  it("maps H1 to CONFIRMED / OVERTURNED / CALL STANDS exactly at the pre-registered lines", () => {
    expect(verdictFor({ estimate: 0.55, lo: 0.5001, hi: 0.6 })).toEqual({ pass: true, verdict: "CONFIRMED" });
    expect(verdictFor({ estimate: 0.5499, lo: 0.51, hi: 0.6 })).toEqual({ pass: false, verdict: "CALL STANDS" });
    expect(verdictFor({ estimate: 0.6, lo: 0.5, hi: 0.7 })).toEqual({ pass: false, verdict: "CALL STANDS" });
    expect(verdictFor({ estimate: 0.45, lo: 0.4, hi: 0.4999 })).toEqual({ pass: false, verdict: "OVERTURNED" });
    expect(verdictFor({ estimate: 0.47, lo: 0.42, hi: 0.5 })).toEqual({ pass: false, verdict: "CALL STANDS" });
  });
});

describe("analyze: planted signal, null and inverted predictors", () => {
  it("recovers a planted signal (predictor = centred lift + small noise): H1 > 0.9, CONFIRMED, R1 > 0.9, beats the LLM", () => {
    const r = plantedResults;
    expect(r.h1.accuracy.estimate).toBeGreaterThan(0.9);
    expect(r.h1.pass).toBe(true);
    expect(r.h1.verdict).toBe("CONFIRMED");
    expect(r.r1.accuracy.estimate).toBeGreaterThan(0.9);
    expect(r.h2.beats).toBe(true);
    expect(r.h1.accuracy.lo).toBeLessThanOrEqual(r.h1.accuracy.estimate);
    expect(r.h1.accuracy.hi).toBeGreaterThanOrEqual(r.h1.accuracy.estimate);
  });
  it("matches a naive independent reference for H1, H2 and R2 point estimates", () => {
    const r = plantedResults;
    const qz = zPredictor(plantedScores.qloo);
    const lz = zPredictor(plantedScores.llm);
    expect(r.h1.accuracy.estimate).toBeCloseTo(referenceAccuracy(world.nights, plantedScores, qz, centred), 12);
    expect(r.h2.llmAccuracy.estimate).toBeCloseTo(referenceAccuracy(world.nights, plantedScores, lz, centred), 12);
    expect(r.h2.difference.estimate).toBeCloseTo(r.h1.accuracy.estimate - r.h2.llmAccuracy.estimate, 12);
    expect(r.r2.accuracy.estimate).toBeCloseTo(referenceAccuracy(world.nights, plantedScores, qz, centredLifts(world.nights, "liftR2")), 12);
    const raw = clubThemeLifts(world.nights, "lift");
    expect(r.descriptive.raw.qloo).toBeCloseTo(referenceAccuracy(world.nights, plantedScores, qz, raw), 12);
    expect(r.descriptive.raw.nationalPopularity).toBeCloseTo(referenceAccuracy(world.nights, plantedScores, (_, t) => POPULARITY[t], raw), 12);
  });
  it("gives about 0.5 and CALL STANDS for a pure-noise predictor", () => {
    const rng = mulberry32(5);
    const r = analyze(world.nights, scoresFor(world, () => normal(rng), llmRating), OPTS);
    expect(Math.abs(r.h1.accuracy.estimate - 0.5)).toBeLessThan(0.08);
    expect(r.h1.pass).toBe(false);
    expect(r.h1.verdict).toBe("CALL STANDS");
  });
  it("gives OVERTURNED for a predictor equal to minus the centred lift", () => {
    const rng = mulberry32(6);
    const inverted: ScoreFn = (c, t, ran) => (ran ? -centred.get(key(c, t))! + 0.01 * normal(rng) : 0.15 * normal(rng));
    const r = analyze(world.nights, scoresFor(world, inverted, llmRating), OPTS);
    expect(r.h1.accuracy.estimate).toBeLessThan(0.1);
    expect(r.h1.accuracy.hi).toBeLessThan(0.5);
    expect(r.h1.verdict).toBe("OVERTURNED");
  });
});

describe("analyze: ties, missing data and centring", () => {
  it("treats a flat Qloo theme as no call: every pair containing it scores 0.5, and diagnostics show SD 0 and 1 distinct value", () => {
    const flat: ScoreFn = (c, t, ran) => (t === "bluey" ? 0.1 : planted(c, t, ran));
    const scores = scoresFor(world, flat, llmRating);
    const r = analyze(world.nights, scores, OPTS);
    const d = r.diagnostics.perTheme.bluey;
    expect(d.qlooSd).toBe(0);
    expect(d.qlooDistinct).toBe(1);
    expect(d.clubsScored).toBe(80);
    expect(d.pairs).toBeGreaterThan(0);
    expect(d.qlooAccuracy).toBe(0.5);
    expect(r.diagnostics.flatThemes.qloo).toEqual(["bluey"]);
    expect(r.h1.accuracy.estimate).toBeCloseTo(referenceAccuracy(world.nights, scores, zPredictor(scores.qloo), centred), 12);
    expect(r.diagnostics.perTheme["star-wars"].qlooDistinct).toBe(80);
  });
  it("drops a combination missing its LLM score for all predictors, and reports droppedCombos = 1", () => {
    const club = world.clubs.find((c) => world.ran.get(c)!.length >= 3)!;
    const theme = world.ran.get(club)![0];
    const k = world.ran.get(club)!.length;
    const scores = structuredClone(plantedScores);
    delete scores.llm[club][theme];
    const r = analyze(world.nights, scores, OPTS);
    expect(r.diagnostics.droppedCombos).toBe(1);
    expect(r.diagnostics.pairs).toBe(plantedResults.diagnostics.pairs - (k - 1));
    const comboNights = world.nights.filter((n) => n.club === club && n.theme === theme).length;
    expect(r.diagnostics.nights).toBe(plantedResults.diagnostics.nights - comboNights);
    expect(r.diagnostics.nightsInput).toBe(world.nights.length);
    // Same pairs for every predictor: Qloo and the LLM both lose exactly this club's pairs with the dropped theme.
    expect(r.h1.accuracy.estimate).toBeCloseTo(referenceAccuracy(world.nights, scores, zPredictor(scores.qloo), centred), 12);
    expect(r.h2.llmAccuracy.estimate).toBeCloseTo(referenceAccuracy(world.nights, scores, zPredictor(scores.llm), centred), 12);
    expect(r.h3.qloo.nights).toBe(r.diagnostics.nights);
    expect(r.h3.llm.nights).toBe(r.diagnostics.nights);
  });
  it("does not count a missing score for a theme the club never ran", () => {
    const club = world.clubs[0];
    const theme = THEMES.find((t) => !world.ran.get(club)!.includes(t))!;
    const scores = structuredClone(plantedScores);
    delete scores.qloo[club][theme];
    const r = analyze(world.nights, scores, OPTS);
    expect(r.diagnostics.droppedCombos).toBe(0);
    expect(r.diagnostics.pairs).toBe(plantedResults.diagnostics.pairs);
    expect(r.diagnostics.perTheme[theme].clubsScored).toBe(79);
  });
  it("centres lift within theme: national popularity is exactly 0.5 on the centred outcome, centred lifts sum to zero", () => {
    const r = plantedResults;
    expect(r.descriptive.raw.nationalPopularityCentred).toBe(0.5);
    expect(r.descriptive.raw.nationalPopularity).not.toBe(0.5);
    const total = r.binned.reduce((s, b) => s + b.n * b.meanCentredLift, 0);
    expect(Math.abs(total)).toBeLessThan(1e-12);
    expect(r.binned.reduce((s, b) => s + b.n, 0)).toBe(r.diagnostics.combos);
  });
  it("reports the Spearman correlation of national popularity with the theme mean lifts", () => {
    const raw = clubThemeLifts(world.nights, "lift");
    const themeMeans = THEMES.map((t) => {
      const xs = [...raw].filter(([k]) => k.endsWith(`|${t}`)).map(([, v]) => v);
      return xs.reduce((s, x) => s + x, 0) / xs.length;
    });
    expect(plantedResults.descriptive.raw.themesInSpearman).toBe(9);
    expect(plantedResults.descriptive.raw.spearmanPopularityVsThemeMeanLift).toBeCloseTo(spearman(THEMES.map((t) => POPULARITY[t]), themeMeans), 12);
  });
  it("makes five equal-count bins of Qloo z", () => {
    const sizes = plantedResults.binned.map((b) => b.n);
    expect(sizes).toHaveLength(5);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    const means = plantedResults.binned.map((b) => b.meanCentredLift);
    expect(means).toEqual([...means].sort((a, b) => a - b));
  });
});

describe("analyze: a dropped combination with an extreme lift (Amendment 2 centring, Amendment 3 theme mean)", () => {
  // The theme with the lowest planted effect, at a club that ran 3+ themes: its lift becomes +50 and its LLM score
  // is removed, so it is dropped. "Over every club that ran the theme" and "over kept clubs" then differ sharply.
  const theme = [...THEMES].sort((a, b) => world.themeEffect[a] - world.themeEffect[b])[0];
  const club = world.clubs.find((c) => world.ran.get(c)!.includes(theme) && world.ran.get(c)!.length >= 3)!;
  const isDropped = (n: ThemeNight) => n.club === club && n.theme === theme;
  const nights = world.nights.map((n) => (isDropped(n) ? { ...n, lift: 50, liftR2: 50 } : n));
  const keptNights = nights.filter((n) => !isDropped(n));
  const scores = structuredClone(plantedScores);
  delete scores.llm[club][theme];
  const r = analyze(nights, scores, OPTS);

  it("centres over every club that ran the theme, not only the kept ones: H1 and R2 match the 'over all' reference", () => {
    const qz = zPredictor(scores.qloo);
    const overAll = referenceAccuracy(nights, scores, qz, centredLifts(nights));
    const overKept = referenceAccuracy(nights, scores, qz, centredLifts(keptNights));
    expect(r.diagnostics.droppedCombos).toBe(1);
    expect(Math.abs(overAll - overKept)).toBeGreaterThan(0.01);
    expect(r.h1.accuracy.estimate).toBeCloseTo(overAll, 12);
    expect(r.r2.accuracy.estimate).toBeCloseTo(referenceAccuracy(nights, scores, qz, centredLifts(nights, "liftR2")), 12);
  });
  it("uses the centring constant (mean over every club that ran the theme) as the theme mean lift in the Spearman", () => {
    const themeMeanLifts = (ns: ThemeNight[]) => {
      const ct = clubThemeLifts(ns, "lift");
      return THEMES.map((t) => {
        const xs = [...ct].filter(([k]) => k.endsWith(`|${t}`)).map(([, v]) => v);
        return xs.reduce((s, x) => s + x, 0) / xs.length;
      });
    };
    const pops = THEMES.map((t) => POPULARITY[t]);
    const overAll = spearman(pops, themeMeanLifts(nights));
    const overKept = spearman(pops, themeMeanLifts(keptNights));
    expect(Math.abs(overAll - overKept)).toBeGreaterThan(0.1);
    expect(r.descriptive.raw.themesInSpearman).toBe(9);
    expect(r.descriptive.raw.spearmanPopularityVsThemeMeanLift).toBeCloseTo(overAll, 12);
  });
});

describe("analyze: pooled OLS (H3)", () => {
  it("recovers a planted night-level slope on Qloo z with theme fixed effects (noiseless)", () => {
    const rng = mulberry32(11);
    const scores = scoresFor(world, () => normal(rng), llmRating);
    const z = zPredictor(scores.qloo);
    const nights = world.nights.map((n) => ({ ...n, lift: world.themeEffect[n.theme] + 0.2 * z(n.club, n.theme)! }));
    const r = analyze(nights, scores, OPTS);
    expect(Math.abs(r.h3.qloo.coefficient!.estimate - 0.2)).toBeLessThan(1e-6);
    expect(Math.abs(r.h3.qloo.coefficient!.lo - 0.2)).toBeLessThan(1e-6);
    expect(Math.abs(r.h3.qloo.coefficient!.hi - 0.2)).toBeLessThan(1e-6);
    expect(r.h3.qloo.partialCorrelation!.estimate).toBeCloseTo(1, 9);
    expect(r.h3.qloo.degenerateDraws).toBe(0);
    expect(r.h3.qloo.nights).toBe(world.nights.length);
  });
  it("matches the within-theme (Frisch-Waugh) slope and partial correlation on noisy data", () => {
    const z = zPredictor(plantedScores.qloo);
    const rows = world.nights.map((n) => ({ theme: n.theme, y: n.lift, x: z(n.club, n.theme)! }));
    const demean = (pick: (r: (typeof rows)[number]) => number) => {
      const m = new Map(THEMES.map((t) => {
        const xs = rows.filter((r) => r.theme === t).map(pick);
        return [t, xs.reduce((s, v) => s + v, 0) / xs.length];
      }));
      return rows.map((r) => pick(r) - m.get(r.theme)!);
    };
    const dy = demean((r) => r.y);
    const dx = demean((r) => r.x);
    const sxy = dx.reduce((s, v, i) => s + v * dy[i], 0);
    const sxx = dx.reduce((s, v) => s + v * v, 0);
    const syy = dy.reduce((s, v) => s + v * v, 0);
    expect(plantedResults.h3.qloo.coefficient!.estimate).toBeCloseTo(sxy / sxx, 10);
    expect(plantedResults.h3.qloo.partialCorrelation!.estimate).toBeCloseTo(sxy / Math.sqrt(sxx * syy), 10);
    expect(plantedResults.h3.qloo.coefficient!.lo).toBeLessThan(plantedResults.h3.qloo.coefficient!.hi);
  });
  it("fits national popularity without theme fixed effects (context only)", () => {
    const nights = world.nights.map((n) => ({ ...n, lift: 0.3 - 0.01 * POPULARITY[n.theme] }));
    const r = analyze(nights, plantedScores, OPTS);
    expect(Math.abs(r.h3.nationalPopularityContext.coefficient!.estimate + 0.01)).toBeLessThan(1e-9);
    expect(r.h3.nationalPopularityContext.partialCorrelation!.estimate).toBeCloseTo(-1, 9);
  });
});

describe("analyze: determinism, bootstrap and output hygiene", () => {
  it("gives an identical result for the same seed, and a different interval but the same estimate for another seed", () => {
    const again: StudyResults = analyze(world.nights, plantedScores, OPTS);
    expect(again).toEqual(plantedResults);
    const other = analyze(world.nights, plantedScores, { seed: SEED + 1, reps: REPS });
    expect(other.h1.accuracy.estimate).toBe(plantedResults.h1.accuracy.estimate);
    expect([other.h1.accuracy.lo, other.h1.accuracy.hi]).not.toEqual([plantedResults.h1.accuracy.lo, plantedResults.h1.accuracy.hi]);
  });
  it("pairs the H2 difference: identical Qloo and LLM scores give a difference of exactly 0 in every draw", () => {
    const same = { ...plantedScores, llm: structuredClone(plantedScores.qloo) };
    const r = analyze(world.nights, same, OPTS);
    expect(r.h2.difference).toEqual({ estimate: 0, lo: 0, hi: 0 });
    expect(r.h2.beats).toBe(false);
  });
  it("resamples only clubs with 2+ kept themes for the pairs, but keeps a one-theme club's nights in centring and H3", () => {
    const solo: ThemeNight = { ...world.nights[0], gamePk: 99999, club: "Solo", theme: "marvel", lift: 5 };
    const scores = structuredClone(plantedScores);
    scores.qloo.Solo = { marvel: 0 };
    scores.llm.Solo = { marvel: 5 };
    const r = analyze([...world.nights, solo], scores, OPTS);
    expect(r.diagnostics.clubsWithPairs).toBe(80);
    expect(r.diagnostics.pairs).toBe(plantedResults.diagnostics.pairs);
    expect(r.diagnostics.nights).toBe(plantedResults.diagnostics.nights + 1);
    expect(r.h3.qloo.nights).toBe(plantedResults.diagnostics.nights + 1);
    expect(r.diagnostics.perTheme.marvel.clubsRan).toBe(plantedResults.diagnostics.perTheme.marvel.clubsRan + 1);
    expect(r.h1.accuracy.estimate).toBeCloseTo(referenceAccuracy([...world.nights, solo], scores, zPredictor(scores.qloo), centredLifts([...world.nights, solo])), 12);
  });
  it("does not depend on the order of the input nights", () => {
    const shuffled = [...world.nights].reverse();
    expect(analyze(shuffled, plantedScores, OPTS)).toEqual(plantedResults);
  });
  it("records meta and the counts, and contains aggregates only (no club names)", () => {
    const r = analyze(world.nights, plantedScores, { ...OPTS, commit: "abc1234" });
    expect(r.meta).toEqual({
      seed: SEED, reps: REPS, passLine: { accuracyAtLeast: 0.55, lowerBoundAbove: 0.5 },
      interval: "club bootstrap, 2.5th and 97.5th percentiles", pulledAt: "2026-10-30T00:00:00Z", commit: "abc1234",
    });
    expect(r.diagnostics.clubsWithPairs).toBe(80);
    expect(r.diagnostics.combos).toBe([...world.ran.values()].reduce((s, ts) => s + ts.length, 0));
    expect(r.diagnostics.pairs).toBe([...world.ran.values()].reduce((s, ts) => s + (ts.length * (ts.length - 1)) / 2, 0));
    expect(JSON.stringify(r)).not.toMatch(/Club \d/);
  });
  it("refuses an input score that is present but not a finite number", () => {
    const scores = structuredClone(plantedScores);
    scores.qloo[world.clubs[0]].bluey = Number.NaN;
    expect(() => analyze(world.nights, scores, OPTS)).toThrow(/finite/);
  });
});

describe("parseScores", () => {
  it("accepts the documented shape", () => {
    const parsed = parseScores(JSON.parse(JSON.stringify(plantedScores)));
    expect(parsed).toEqual(plantedScores);
  });
  it("rejects a missing national popularity, an unknown theme and a non-number score", () => {
    const base = JSON.parse(JSON.stringify(plantedScores)) as Record<string, unknown>;
    expect(() => parseScores({ ...base, nationalPopularity: { bluey: 1 } })).toThrow(/nationalPopularity/);
    expect(() => parseScores({ ...base, qloo: { "Club 00": { quidditch: 1 } } })).toThrow(/quidditch/);
    expect(() => parseScores({ ...base, llm: { "Club 00": { bluey: "7" } } })).toThrow(/llm/);
    expect(() => parseScores({ ...base, pulledAt: 5 })).toThrow(/pulledAt/);
  });
});
