// The pre-registered analysis (study/PREREGISTRATION.md, read with Amendment 1, which supersedes the
// original text where they differ). Pure functions only: no I/O, no clock, no randomness beyond the seed.
import { mean, mulberry32, ols, pearson, percentile, populationSd, spearman, zScores } from "./stats";
import type { ThemeNight } from "./summary";
import { STUDY_THEMES, type StudyThemeId } from "./themes";

const THEME_IDS: readonly StudyThemeId[] = STUDY_THEMES.map((t) => t.id);
const themeIndex = (t: StudyThemeId): number => THEME_IDS.indexOf(t);
const isThemeId = (s: string): s is StudyThemeId => (THEME_IDS as readonly string[]).includes(s);

/** H1 passes only if accuracy >= 0.55 and the interval's lower bound is above 0.50. */
export const PASS_LINE = { accuracyAtLeast: 0.55, lowerBoundAbove: 0.5 } as const;
/** OVERTURNED: the interval's upper bound is below 0.50. */
const OVERTURNED_UPPER_BELOW = 0.5;
const LOWER_PERCENTILE = 2.5;
const UPPER_PERCENTILE = 97.5;
const BINS = 5;

export type ScoreTable = Record<string, Partial<Record<StudyThemeId, number>>>;

export interface Scores {
  pulledAt: string;
  /** Raw Qloo bundle affinity per club and theme; a missing score is an absent key. */
  qloo: ScoreTable;
  /** Raw 1–10 LLM rating per club and theme; a missing score is an absent key. */
  llm: ScoreTable;
  /** One number per theme, identical for every club (not z-scored: Amendment 1, A1). */
  nationalPopularity: Record<StudyThemeId, number>;
}

export interface AnalyzeOptions {
  seed: number;
  reps: number;
  commit?: string | null;
}

export interface Interval {
  estimate: number;
  lo: number;
  hi: number;
}

export type Verdict = "CONFIRMED" | "CALL STANDS" | "OVERTURNED";

export interface Hypothesis {
  accuracy: Interval;
  pass: boolean;
  verdict: Verdict;
}

export interface PooledFit {
  nights: number;
  /** null when the full-sample design is rank-deficient (e.g. a predictor with no variation left). */
  coefficient: Interval | null;
  partialCorrelation: Interval | null;
  /** Bootstrap draws whose design was rank-deficient; they are left out of the percentiles. */
  degenerateDraws: number;
}

export interface ThemeDiagnostics {
  clubsRan: number;
  clubsKept: number;
  nightsKept: number;
  /** Clubs with a Qloo score for the theme: the z-score population. */
  clubsScored: number;
  qlooSd: number | null;
  qlooDistinct: number;
  llmScored: number;
  llmSd: number | null;
  llmDistinct: number;
  /** Kept within-club pairs that contain the theme. */
  pairs: number;
  /** Qloo accuracy (centred outcome) over the pairs containing the theme. Descriptive, no interval. */
  qlooAccuracy: number | null;
}

export interface Bin {
  n: number;
  zMin: number;
  zMax: number;
  meanZ: number;
  meanCentredLift: number;
}

export interface StudyResults {
  h1: Hypothesis;
  h2: { llmAccuracy: Interval; difference: Interval; beats: boolean };
  h3: { qloo: PooledFit; llm: PooledFit; nationalPopularityContext: PooledFit };
  r1: { accuracy: Interval };
  r2: Hypothesis;
  descriptive: {
    raw: {
      qloo: number;
      llm: number;
      nationalPopularity: number;
      nationalPopularityCentred: number;
      spearmanPopularityVsThemeMeanLift: number | null;
      themesInSpearman: number;
    };
  };
  diagnostics: {
    droppedCombos: number;
    combos: number;
    pairs: number;
    clubsWithPairs: number;
    nights: number;
    nightsInput: number;
    flatThemes: { qloo: StudyThemeId[]; llm: StudyThemeId[] };
    perTheme: Record<StudyThemeId, ThemeDiagnostics>;
  };
  binned: Bin[];
  meta: {
    seed: number;
    reps: number;
    passLine: { accuracyAtLeast: number; lowerBoundAbove: number };
    interval: string;
    pulledAt: string;
    commit: string | null;
  };
}

// ---------- pair scoring and the verdict ----------

/**
 * One within-club pair. A null predictor value means "no call" (a theme on which the predictor
 * does not vary across clubs: Amendment 1, A5). No call, a predictor tie or an outcome tie scores 0.5.
 */
export function pairScore(pA: number | null, pB: number | null, oA: number, oB: number): number {
  if (pA === null || pB === null || pA === pB || oA === oB) return 0.5;
  return Math.sign(pA - pB) === Math.sign(oA - oB) ? 1 : 0;
}

export function verdictFor(accuracy: Interval): { pass: boolean; verdict: Verdict } {
  const pass = accuracy.estimate >= PASS_LINE.accuracyAtLeast && accuracy.lo > PASS_LINE.lowerBoundAbove;
  const verdict: Verdict = pass ? "CONFIRMED" : accuracy.hi < OVERTURNED_UPPER_BELOW ? "OVERTURNED" : "CALL STANDS";
  return { pass, verdict };
}

// ---------- club-theme combinations ----------

interface Combo {
  club: string;
  theme: StudyThemeId;
  nights: ThemeNight[];
  lift: number;
  liftR2: number;
}

interface Kept extends Combo {
  centred: number;
  centredR2: number;
  /** z within theme (0 for a flat theme). Used by H3 and the bins. */
  qz: number;
  lz: number;
  /** Pair calls: the z, or null (no call) for a theme with no across-club variation. */
  qCall: number | null;
  lCall: number | null;
  pop: number;
}

const comboKey = (club: string, theme: StudyThemeId): string => `${club}\u0000${theme}`;
const byClubThenTheme = (a: { club: string; theme: StudyThemeId }, b: { club: string; theme: StudyThemeId }): number =>
  a.club < b.club ? -1 : a.club > b.club ? 1 : themeIndex(a.theme) - themeIndex(b.theme);

function checkNight(n: ThemeNight): void {
  if (!isThemeId(n.theme)) throw new Error(`Unknown theme on game ${n.gamePk}: ${String(n.theme)}`);
  if (!Number.isFinite(n.lift) || !Number.isFinite(n.liftR2)) throw new Error(`Game ${n.gamePk} needs finite lift and liftR2`);
}

/** Step 1: each (club, theme) that ran the theme, with the mean of `lift` and of `liftR2` over its nights. */
function groupCombos(nights: readonly ThemeNight[]): Combo[] {
  nights.forEach(checkNight);
  const sorted = [...nights].sort((a, b) => byClubThenTheme(a, b) || a.gamePk - b.gamePk);
  const groups = new Map<string, ThemeNight[]>();
  for (const n of sorted) {
    const k = comboKey(n.club, n.theme);
    const list = groups.get(k);
    if (list) list.push(n);
    else groups.set(k, [n]);
  }
  return [...groups.values()].map((ns) => ({
    club: ns[0].club, theme: ns[0].theme, nights: ns, lift: mean(ns.map((n) => n.lift)), liftR2: mean(ns.map((n) => n.liftR2)),
  }));
}

/** The mean of a club-theme quantity over every club that ran the theme (the centring constant, A3). */
function themeMeans(combos: readonly Combo[], pick: (c: Combo) => number): Map<StudyThemeId, number> {
  const out = new Map<StudyThemeId, number>();
  for (const t of THEME_IDS) {
    const xs = combos.filter((c) => c.theme === t).map(pick);
    if (xs.length > 0) out.set(t, mean(xs));
  }
  return out;
}

// ---------- predictors ----------

function readScore(table: ScoreTable, club: string, theme: StudyThemeId, label: string): number | undefined {
  const v = table[club]?.[theme];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${label} score for ${club} / ${theme} must be a finite number`);
  return v;
}

function readPopularity(scores: Scores, theme: StudyThemeId): number | undefined {
  const v = scores.nationalPopularity[theme];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`national popularity for ${theme} must be a finite number`);
  return v;
}

interface Standardised {
  z: Map<string, number>;
  flat: Set<StudyThemeId>;
  raw: Map<StudyThemeId, number[]>;
}

/** Step 4: z within theme across every club present in the table for that theme (A2), population SD. */
function standardise(table: ScoreTable, label: string): Standardised {
  const clubs = Object.keys(table).sort();
  const out: Standardised = { z: new Map(), flat: new Set(), raw: new Map() };
  for (const t of THEME_IDS) {
    const scored = clubs.flatMap((c) => {
      const v = readScore(table, c, t, label);
      return v === undefined ? [] : [{ club: c, v }];
    });
    const values = scored.map((s) => s.v);
    out.raw.set(t, values);
    if (values.length === 0) continue;
    if (populationSd(values) === 0) out.flat.add(t);
    zScores(values).forEach((z, i) => out.z.set(comboKey(scored[i].club, t), z));
  }
  return out;
}

/** Steps 2–4: the missing-data rule, centring and the predictor values of every kept combination. */
function keepCombos(combos: readonly Combo[], scores: Scores): { kept: Kept[]; dropped: number; qloo: Standardised; llm: Standardised; liftMean: Map<StudyThemeId, number> } {
  const qloo = standardise(scores.qloo, "qloo");
  const llm = standardise(scores.llm, "llm");
  const liftMean = themeMeans(combos, (c) => c.lift);
  const liftR2Mean = themeMeans(combos, (c) => c.liftR2);
  const kept: Kept[] = [];
  for (const c of combos) {
    const k = comboKey(c.club, c.theme);
    const qz = qloo.z.get(k);
    const lz = llm.z.get(k);
    const pop = readPopularity(scores, c.theme);
    if (qz === undefined || lz === undefined || pop === undefined) continue;
    kept.push({
      ...c, qz, lz, pop,
      centred: c.lift - liftMean.get(c.theme)!,
      centredR2: c.liftR2 - liftR2Mean.get(c.theme)!,
      qCall: qloo.flat.has(c.theme) ? null : qz,
      lCall: llm.flat.has(c.theme) ? null : lz,
    });
  }
  return { kept, dropped: combos.length - kept.length, qloo, llm, liftMean };
}

// ---------- pairs and accuracy ----------

interface Pair {
  a: Kept;
  b: Kept;
}
type Call = (c: Kept) => number | null;
type Outcome = (c: Kept) => number;

/** Step 5: clubs with two or more kept themes, each with every unordered pair of its themes. */
function clubPairs(kept: readonly Kept[]): Map<string, Pair[]> {
  const byClub = new Map<string, Kept[]>();
  for (const c of kept) byClub.set(c.club, [...(byClub.get(c.club) ?? []), c]);
  const out = new Map<string, Pair[]>();
  for (const [club, list] of byClub) {
    if (list.length < 2) continue;
    const pairs: Pair[] = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) pairs.push({ a: list[i], b: list[j] });
    out.set(club, pairs);
  }
  return out;
}

const scorePair = (p: Pair, call: Call, outcome: Outcome): number => pairScore(call(p.a), call(p.b), outcome(p.a), outcome(p.b));
const sumScores = (pairs: readonly Pair[], call: Call, outcome: Outcome): number => pairs.reduce((s, p) => s + scorePair(p, call, outcome), 0);
const accuracy = (pairs: readonly Pair[], call: Call, outcome: Outcome): number => sumScores(pairs, call, outcome) / pairs.length;

const qCall: Call = (c) => c.qCall;
const lCall: Call = (c) => c.lCall;
const centred: Outcome = (c) => c.centred;
const centredR2: Outcome = (c) => c.centredR2;
const rawLift: Outcome = (c) => c.lift;

// ---------- step 7: club bootstrap of the pairwise accuracies ----------

interface ClubTally {
  pairs: number;
  qloo: number;
  llm: number;
  qlooR2: number;
}

function tally(pairs: readonly Pair[]): ClubTally {
  return { pairs: pairs.length, qloo: sumScores(pairs, qCall, centred), llm: sumScores(pairs, lCall, centred), qlooR2: sumScores(pairs, qCall, centredR2) };
}

interface PairStats {
  h1: number;
  llm: number;
  diff: number;
  r1: number;
  r2: number;
}

function pairStats(tallies: readonly ClubTally[]): PairStats {
  let n = 0;
  let q = 0;
  let l = 0;
  let q2 = 0;
  let clubMeans = 0;
  for (const t of tallies) {
    n += t.pairs;
    q += t.qloo;
    l += t.llm;
    q2 += t.qlooR2;
    clubMeans += t.qloo / t.pairs;
  }
  return { h1: q / n, llm: l / n, diff: q / n - l / n, r1: clubMeans / tallies.length, r2: q2 / n };
}

/** Resample clubs with replacement, `reps` times; every statistic uses the same draws (paired). */
function resample<T>(items: readonly T[], reps: number, seed: number, stat: (draw: T[]) => void): void {
  const rng = mulberry32(seed);
  const m = items.length;
  for (let r = 0; r < reps; r++) stat(Array.from({ length: m }, () => items[Math.floor(rng() * m)]));
}

const interval = (estimate: number, draws: readonly number[]): Interval => ({
  estimate, lo: percentile(draws, LOWER_PERCENTILE), hi: percentile(draws, UPPER_PERCENTILE),
});

function pairBootstrap(tallies: readonly ClubTally[], reps: number, seed: number): Record<keyof PairStats, Interval> {
  const draws: Record<keyof PairStats, number[]> = { h1: [], llm: [], diff: [], r1: [], r2: [] };
  resample(tallies, reps, seed, (d) => {
    const s = pairStats(d);
    for (const k of Object.keys(draws) as (keyof PairStats)[]) draws[k].push(s[k]);
  });
  const est = pairStats(tallies);
  return { h1: interval(est.h1, draws.h1), llm: interval(est.llm, draws.llm), diff: interval(est.diff, draws.diff), r1: interval(est.r1, draws.r1), r2: interval(est.r2, draws.r2) };
}

const hypothesis = (accuracyInterval: Interval): Hypothesis => ({ accuracy: accuracyInterval, ...verdictFor(accuracyInterval) });

// ---------- H3: pooled night-level OLS ----------

interface NightRow {
  theme: StudyThemeId;
  lift: number;
  qz: number;
  lz: number;
  pop: number;
}

interface Association {
  coefficient: number;
  partialCorrelation: number;
}

/** Theme fixed effects: one dummy per theme present (they span the intercept). Without them: an intercept. */
function controls(rows: readonly NightRow[], themeEffects: boolean): number[][] {
  if (!themeEffects) return rows.map(() => [1]);
  const present = THEME_IDS.filter((t) => rows.some((r) => r.theme === t));
  return rows.map((r) => present.map((t) => (r.theme === t ? 1 : 0)));
}

/** OLS of lift on controls + x: the coefficient on x, and the partial correlation of lift and x given the controls. */
function associate(ctrl: number[][], liftResiduals: number[] | null, x: number[], lift: number[]): Association | null {
  const full = ols(ctrl.map((c, i) => [...c, x[i]]), lift);
  const xOnControls = ols(ctrl, x);
  if (full === null || xOnControls === null || liftResiduals === null) return null;
  const partialCorrelation = pearson(liftResiduals, xOnControls.residuals);
  if (!Number.isFinite(partialCorrelation)) return null;
  return { coefficient: full.coefficients[full.coefficients.length - 1], partialCorrelation };
}

interface H3Fits {
  qloo: Association | null;
  llm: Association | null;
  pop: Association | null;
}

function h3Fits(rows: readonly NightRow[]): H3Fits {
  const lift = rows.map((r) => r.lift);
  const fe = controls(rows, true);
  const intercept = controls(rows, false);
  const liftOnFe = ols(fe, lift)?.residuals ?? null;
  const liftOnIntercept = ols(intercept, lift)?.residuals ?? null;
  return {
    qloo: associate(fe, liftOnFe, rows.map((r) => r.qz), lift),
    llm: associate(fe, liftOnFe, rows.map((r) => r.lz), lift),
    pop: associate(intercept, liftOnIntercept, rows.map((r) => r.pop), lift),
  };
}

function pooledFit(estimate: Association | null, draws: readonly (Association | null)[], nights: number): PooledFit {
  const valid = draws.filter((d): d is Association => d !== null);
  const usable = estimate !== null && valid.length > 0;
  return {
    nights,
    coefficient: usable ? interval(estimate.coefficient, valid.map((d) => d.coefficient)) : null,
    partialCorrelation: usable ? interval(estimate.partialCorrelation, valid.map((d) => d.partialCorrelation)) : null,
    degenerateDraws: draws.length - valid.length,
  };
}

/** H3: resample clubs (all clubs with kept nights) and take every night of each drawn club, with multiplicity. */
function h3(kept: readonly Kept[], reps: number, seed: number): StudyResults["h3"] {
  const rowsByClub = new Map<string, NightRow[]>();
  for (const c of kept) {
    const rows = c.nights.map((n) => ({ theme: c.theme, lift: n.lift, qz: c.qz, lz: c.lz, pop: c.pop }));
    rowsByClub.set(c.club, [...(rowsByClub.get(c.club) ?? []), ...rows]);
  }
  const clubs = [...rowsByClub.values()];
  const all = clubs.flat();
  const draws: { [K in keyof H3Fits]: (Association | null)[] } = { qloo: [], llm: [], pop: [] };
  resample(clubs, reps, seed, (d) => {
    const f = h3Fits(d.flat());
    draws.qloo.push(f.qloo);
    draws.llm.push(f.llm);
    draws.pop.push(f.pop);
  });
  const est = h3Fits(all);
  return {
    qloo: pooledFit(est.qloo, draws.qloo, all.length),
    llm: pooledFit(est.llm, draws.llm, all.length),
    nationalPopularityContext: pooledFit(est.pop, draws.pop, all.length),
  };
}

// ---------- descriptives, diagnostics, bins ----------

/**
 * National popularity on the centred outcome. It is one number per theme, so it has no across-club
 * variation within any theme; under the A5 rule it makes no call, and every pair is a tie (A3).
 */
function popularityCentred(kept: readonly Kept[], pairs: readonly Pair[]): number {
  const flat = new Set(THEME_IDS.filter((t) => new Set(kept.filter((c) => c.theme === t).map((c) => c.pop)).size <= 1));
  const acc = accuracy(pairs, (c) => (flat.has(c.theme) ? null : c.pop), centred);
  if (acc !== 0.5) throw new Error(`National popularity on the centred outcome must be 0.5 by construction, got ${acc}`);
  return acc;
}

/**
 * Spearman of national popularity against each theme's mean lift (A3 b). The theme mean is the centring constant,
 * the mean club-theme lift over every club that ran the theme (Amendment 3), not only the kept combinations.
 */
function popularitySpearman(liftMean: ReadonlyMap<StudyThemeId, number>, scores: Scores): { rho: number | null; themes: number } {
  const themes = THEME_IDS.filter((t) => liftMean.has(t) && readPopularity(scores, t) !== undefined);
  const themeMeanLift = themes.map((t) => liftMean.get(t)!);
  const rho = themes.length >= 2 ? spearman(themes.map((t) => scores.nationalPopularity[t]), themeMeanLift) : Number.NaN;
  return { rho: Number.isFinite(rho) ? rho : null, themes: themes.length };
}

function themeDiagnostics(t: StudyThemeId, combos: readonly Combo[], kept: readonly Kept[], pairs: readonly Pair[], q: Standardised, l: Standardised): ThemeDiagnostics {
  const keptHere = kept.filter((c) => c.theme === t);
  const withTheme = pairs.filter((p) => p.a.theme === t || p.b.theme === t);
  const qRaw = q.raw.get(t) ?? [];
  const lRaw = l.raw.get(t) ?? [];
  return {
    clubsRan: combos.filter((c) => c.theme === t).length,
    clubsKept: keptHere.length,
    nightsKept: keptHere.reduce((s, c) => s + c.nights.length, 0),
    clubsScored: qRaw.length,
    qlooSd: qRaw.length ? populationSd(qRaw) : null,
    qlooDistinct: new Set(qRaw).size,
    llmScored: lRaw.length,
    llmSd: lRaw.length ? populationSd(lRaw) : null,
    llmDistinct: new Set(lRaw).size,
    pairs: withTheme.length,
    qlooAccuracy: withTheme.length ? accuracy(withTheme, qCall, centred) : null,
  };
}

/** Five equal-count bins of kept club-theme combinations by Qloo z (an aggregate scatter summary). */
function binByQlooZ(kept: readonly Kept[]): Bin[] {
  const sorted = [...kept].sort((a, b) => a.qz - b.qz || byClubThenTheme(a, b));
  const groups: Kept[][] = Array.from({ length: BINS }, () => []);
  sorted.forEach((c, i) => groups[Math.floor((i * BINS) / sorted.length)].push(c));
  return groups.filter((g) => g.length > 0).map((g) => ({
    n: g.length, zMin: g[0].qz, zMax: g[g.length - 1].qz, meanZ: mean(g.map((c) => c.qz)), meanCentredLift: mean(g.map((c) => c.centred)),
  }));
}

// ---------- the analysis ----------

function checkOptions(opts: AnalyzeOptions): void {
  if (!Number.isInteger(opts.seed)) throw new Error("seed must be an integer");
  if (!Number.isInteger(opts.reps) || opts.reps < 1) throw new Error("reps must be a positive integer");
}

export function analyze(nights: readonly ThemeNight[], scores: Scores, opts: AnalyzeOptions): StudyResults {
  checkOptions(opts);
  const combos = groupCombos(nights);
  const { kept, dropped, qloo, llm, liftMean } = keepCombos(combos, scores);
  const byClub = clubPairs(kept);
  const pairs = [...byClub.values()].flat();
  if (pairs.length === 0) throw new Error("No within-club pairs after the missing-data rule: nothing to analyse");
  const boot = pairBootstrap([...byClub.values()].map(tally), opts.reps, opts.seed);
  const spear = popularitySpearman(liftMean, scores);
  return {
    h1: hypothesis(boot.h1),
    h2: { llmAccuracy: boot.llm, difference: boot.diff, beats: boot.diff.lo > 0 },
    h3: h3(kept, opts.reps, opts.seed),
    r1: { accuracy: boot.r1 },
    r2: hypothesis(boot.r2),
    descriptive: {
      raw: {
        qloo: accuracy(pairs, qCall, rawLift),
        llm: accuracy(pairs, lCall, rawLift),
        nationalPopularity: accuracy(pairs, (c) => c.pop, rawLift),
        nationalPopularityCentred: popularityCentred(kept, pairs),
        spearmanPopularityVsThemeMeanLift: spear.rho,
        themesInSpearman: spear.themes,
      },
    },
    diagnostics: {
      droppedCombos: dropped,
      combos: kept.length,
      pairs: pairs.length,
      clubsWithPairs: byClub.size,
      nights: kept.reduce((s, c) => s + c.nights.length, 0),
      nightsInput: nights.length,
      flatThemes: { qloo: THEME_IDS.filter((t) => qloo.flat.has(t)), llm: THEME_IDS.filter((t) => llm.flat.has(t)) },
      perTheme: Object.fromEntries(THEME_IDS.map((t) => [t, themeDiagnostics(t, combos, kept, pairs, qloo, llm)])) as Record<StudyThemeId, ThemeDiagnostics>,
    },
    binned: binByQlooZ(kept),
    meta: {
      seed: opts.seed,
      reps: opts.reps,
      passLine: { ...PASS_LINE },
      interval: "club bootstrap, 2.5th and 97.5th percentiles",
      pulledAt: scores.pulledAt,
      commit: opts.commit ?? null,
    },
  };
}

// ---------- input validation (pure; used by the CLI on data/derived/scores.json) ----------

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

function parseTable(v: unknown, label: string): ScoreTable {
  if (!isRec(v)) throw new Error(`scores.${label} must be an object of clubs`);
  const out: ScoreTable = {};
  for (const [club, row] of Object.entries(v)) {
    if (!isRec(row)) throw new Error(`scores.${label}[${JSON.stringify(club)}] must be an object of themes`);
    const themes: Partial<Record<StudyThemeId, number>> = {};
    for (const [theme, score] of Object.entries(row)) {
      if (!isThemeId(theme)) throw new Error(`unknown theme ${theme} in scores.${label}[${JSON.stringify(club)}]`);
      if (typeof score !== "number" || !Number.isFinite(score)) throw new Error(`scores.${label}[${JSON.stringify(club)}].${theme} must be a finite number`);
      themes[theme] = score;
    }
    out[club] = themes;
  }
  return out;
}

export function parseScores(raw: unknown): Scores {
  if (!isRec(raw)) throw new Error("scores must be an object");
  if (typeof raw.pulledAt !== "string") throw new Error("scores.pulledAt must be an ISO timestamp string");
  const pop = raw.nationalPopularity;
  if (!isRec(pop)) throw new Error("scores.nationalPopularity must be an object");
  for (const k of Object.keys(pop)) if (!isThemeId(k)) throw new Error(`unknown theme ${k} in scores.nationalPopularity`);
  const nationalPopularity = {} as Record<StudyThemeId, number>;
  for (const t of THEME_IDS) {
    const v = pop[t];
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`scores.nationalPopularity.${t} must be a finite number`);
    nationalPopularity[t] = v;
  }
  return { pulledAt: raw.pulledAt, qloo: parseTable(raw.qloo, "qloo"), llm: parseTable(raw.llm, "llm"), nationalPopularity };
}
