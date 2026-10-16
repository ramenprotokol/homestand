// Turns the full analysis output (study/results/results-2025.json) into the aggregates-only study/results.json
// for the app's Study page. It asserts that nothing per-club, per-night or per-game is carried over.
import { readFileSync, writeFileSync } from "node:fs";
import type { StudyResults } from "../src/study/analysis";
import { parseClubList } from "../src/study/analysis";

const r = JSON.parse(readFileSync("study/results/results-2025.json", "utf8")) as StudyResults;
const freezeCommit = process.argv[2];
const scoresSha256 = process.argv[3];
if (!freezeCommit || !scoresSha256) throw new Error("usage: tsx study/export.ts <freeze commit> <scores.json sha256>");

const out = {
  verdict: r.h1.verdict,
  seed: r.meta.seed,
  draws: r.meta.reps,
  pulledAt: r.meta.pulledAt,
  freezeCommit,
  scoresSha256,
  passLine: r.meta.passLine,
  counts: { nights: r.diagnostics.nights, nightsInput: r.diagnostics.nightsInput, combos: r.diagnostics.combos, droppedCombos: r.diagnostics.droppedCombos, pairs: r.diagnostics.pairs, clubsWithPairs: r.diagnostics.clubsWithPairs },
  h1: r.h1,
  h2: r.h2,
  rawLiftAccuracy: r.descriptive.raw,
  h3: r.h3,
  robustness: { r1: r.r1, r2: r.r2 },
  perTheme: r.diagnostics.perTheme,
  flatThemes: r.diagnostics.flatThemes,
  binnedByQlooZ: r.binned,
};

const text = `${JSON.stringify(out, null, 2)}\n`;
// Aggregates only: no club name anywhere, no per-night/per-game/per-club keys, and the binned summary is Amendment 3's five bins.
const clubs = parseClubList(JSON.parse(readFileSync("data/derived/clubs-2025.json", "utf8")));
for (const c of clubs) if (text.includes(c)) throw new Error(`results contain a club name: ${c}`);
if (/"(club|city|date|gamePk|attendance|nights?List|lift|liftR2)"\s*:/.test(text)) throw new Error("results contain a per-club or per-night key");
if (out.binnedByQlooZ.length !== 5 || out.binnedByQlooZ.some((b) => Object.keys(b).sort().join() !== "meanCentredLift,meanZ,n,zMax,zMin")) throw new Error("binned summary is not Amendment 3's five bins");
writeFileSync("study/results.json", text);
console.log(`wrote study/results.json (${text.length} bytes, aggregates only)`);
