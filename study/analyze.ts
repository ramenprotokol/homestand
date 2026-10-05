// Runs the pre-registered analysis (study/PREREGISTRATION.md with Amendment 1) on the real scores.
// Reads data/derived/theme-nights-2025.json and data/derived/scores.json; writes aggregates only to
// study/results/results-2025.json. The seed and the number of bootstrap draws are fixed by the pre-registration.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { analyze, parseScores, type Interval, type PooledFit, type Scores, type StudyResults } from "../src/study/analysis";
import type { ThemeNight } from "../src/study/summary";
import { STUDY_THEMES } from "../src/study/themes";

const NIGHTS = "data/derived/theme-nights-2025.json";
const SCORES = "data/derived/scores.json";
const OUT = "study/results/results-2025.json";
const SEED = 20261030;
const REPS = 10_000;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`Could not read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function readNights(): ThemeNight[] {
  if (!existsSync(NIGHTS)) fail(`${NIGHTS} is missing. Run \`npm run study:build\` first.`);
  const raw: unknown = readJson(NIGHTS);
  const hasLifts = (r: unknown) => typeof r === "object" && r !== null && Number.isFinite(Reflect.get(r, "lift")) && Number.isFinite(Reflect.get(r, "liftR2"));
  if (!Array.isArray(raw) || !raw.every(hasLifts)) fail(`${NIGHTS} has no robustness lift (liftR2). Re-run \`npm run study:build\`.`);
  return raw as ThemeNight[];
}

function readScores(): Scores {
  if (!existsSync(SCORES)) {
    fail(
      `No scores yet: ${SCORES} is missing.\n` +
        "The pre-registered analysis runs only after the full Qloo and LLM pull (see study/PREREGISTRATION.md).\n" +
        "Nothing was analysed and nothing was written.",
    );
  }
  try {
    return parseScores(readJson(SCORES));
  } catch (e) {
    fail(`${SCORES} is not in the expected format: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function gitCommit(): string | null {
  try {
    const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const sha = git(["rev-parse", "HEAD"]);
    const dirty = git(["status", "--porcelain", "--untracked-files=no"]) !== "";
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return null;
  }
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(100 * x).toFixed(1)}%`);
const ci = (i: Interval) => `${pct(i.estimate)} [95% CI ${pct(i.lo)} to ${pct(i.hi)}]`;
const num = (x: number | null, d = 3) => (x === null ? "n/a" : x.toFixed(d));
const fitLine = (f: PooledFit) =>
  f.coefficient === null || f.partialCorrelation === null
    ? `not estimable (rank-deficient design), ${f.nights} nights`
    : `coef ${num(f.coefficient.estimate, 4)} [${num(f.coefficient.lo, 4)}, ${num(f.coefficient.hi, 4)}] · partial r ${num(f.partialCorrelation.estimate)} [${num(f.partialCorrelation.lo)}, ${num(f.partialCorrelation.hi)}] · ${f.nights} nights` +
      (f.degenerateDraws ? ` · ${f.degenerateDraws} degenerate draws left out` : "");

function print(r: StudyResults): void {
  const d = r.diagnostics;
  const raw = r.descriptive.raw;
  console.log(`Homestand study, 2025 season · scores pulled ${r.meta.pulledAt} · commit ${r.meta.commit ?? "unknown"}`);
  console.log(`Seed ${r.meta.seed}, ${r.meta.reps} club-bootstrap draws · ${d.nights} nights, ${d.combos} club-theme combinations (${d.droppedCombos} dropped for a missing score), ${d.pairs} pairs across ${d.clubsWithPairs} clubs\n`);
  console.log(`H1 (confirmatory) Qloo pairwise accuracy, theme-centred lift: ${ci(r.h1.accuracy)}`);
  console.log(`   pass line: >= 55% and lower bound > 50% · pass: ${r.h1.pass ? "yes" : "no"} · VERDICT: ${r.h1.verdict}\n`);
  console.log(`H2 (secondary) LLM accuracy: ${ci(r.h2.llmAccuracy)}`);
  console.log(`   Qloo minus LLM: ${ci(r.h2.difference)} · Qloo beats the LLM: ${r.h2.beats ? "yes" : "no"}\n`);
  console.log("H3 (secondary) pooled OLS of night lift on the predictor:");
  console.log(`   Qloo z, theme fixed effects: ${fitLine(r.h3.qloo)}`);
  console.log(`   LLM z, theme fixed effects:  ${fitLine(r.h3.llm)}`);
  console.log(`   National popularity, no theme effects (context only): ${fitLine(r.h3.nationalPopularityContext)}\n`);
  console.log(`R1 (robustness) per-club-weighted Qloo accuracy: ${ci(r.r1.accuracy)}`);
  console.log(`R2 (robustness) H1 on the other-promos baseline: ${ci(r.r2.accuracy)} · ${r.r2.verdict}\n`);
  console.log(`Descriptive, raw (uncentred) lift accuracy: Qloo ${pct(raw.qloo)} · LLM ${pct(raw.llm)} · national popularity ${pct(raw.nationalPopularity)} (theme-level baseline, about 9 effective data points)`);
  console.log(`   national popularity on the centred outcome: ${pct(raw.nationalPopularityCentred)} (no call by construction)`);
  console.log(`   Spearman, national popularity vs theme mean lift: ${num(raw.spearmanPopularityVsThemeMeanLift)} over ${raw.themesInSpearman} themes\n`);
  console.log("Per theme (descriptive, no inference): clubs kept · nights · Qloo SD / distinct values · pairs · Qloo accuracy");
  for (const t of STUDY_THEMES) {
    const p = d.perTheme[t.id];
    console.log(`   ${t.label.padEnd(15)} ${String(p.clubsKept).padStart(3)} · ${String(p.nightsKept).padStart(3)} · ${num(p.qlooSd)} / ${p.qlooDistinct} · ${String(p.pairs).padStart(3)} · ${pct(p.qlooAccuracy)}`);
  }
  if (d.flatThemes.qloo.length || d.flatThemes.llm.length) console.log(`   flat (no across-club variation, pairs scored 0.5): Qloo [${d.flatThemes.qloo.join(", ")}] · LLM [${d.flatThemes.llm.join(", ")}]`);
  console.log("\nQloo z, five equal-count bins: n · mean z · mean centred lift");
  for (const b of r.binned) console.log(`   ${String(b.n).padStart(3)} · ${num(b.meanZ, 2).padStart(6)} · ${num(b.meanCentredLift, 4)}`);
}

const scores = readScores();
const results = analyze(readNights(), scores, { seed: SEED, reps: REPS, commit: gitCommit() });
mkdirSync("study/results", { recursive: true });
writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`);
print(results);
console.log(`\nWrote ${OUT} (aggregates only).`);
