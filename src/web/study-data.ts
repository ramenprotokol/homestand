import type { Bin, Interval, StudyResults, ThemeDiagnostics } from "../study/analysis";
import { STUDY_THEMES, type StudyThemeId } from "../study/themes";

// `study/results.json` is produced by `npm run study:analyze` after the full pull. The glob keeps the build working
// while the file does not exist yet (the glob is simply empty).
const files = import.meta.glob("../../study/results.json", { eager: true, import: "default" }) as Record<string, StudyResults>;

export interface StudyView {
  /** The real file is not published yet. */
  pending: boolean;
  /** Numbers are the made-up fixture below, shown only in dev and in the e2e build. */
  synthetic: boolean;
  results: StudyResults | null;
}

const iv = (estimate: number, lo: number, hi: number): Interval => ({ estimate, lo, hi });

/** SYNTHETIC. Every number here is invented to exercise the page. Never shown in a production build. */
function fixture(): StudyResults {
  const perTheme = Object.fromEntries(
    STUDY_THEMES.map((t, i): [StudyThemeId, ThemeDiagnostics] => [
      t.id,
      { clubsRan: 40 + i, clubsKept: 38 + i, nightsKept: 44 + i, clubsScored: 38 + i, qlooSd: 0.04, qlooDistinct: 38 + i, llmScored: 38 + i, llmSd: 1.1, llmDistinct: 6, pairs: 60 + i * 3, qlooAccuracy: 0.46 + (i % 5) * 0.03 },
    ]),
  ) as Record<StudyThemeId, ThemeDiagnostics>;
  const binned: Bin[] = [-1.2, -0.6, 0, 0.6, 1.2].map((z, i) => ({ n: 40, zMin: z - 0.3, zMax: z + 0.3, meanZ: z, meanCentredLift: -0.02 + i * 0.01 }));
  const pooled = { nights: 380, coefficient: iv(0.01, -0.02, 0.04), partialCorrelation: iv(0.03, -0.05, 0.11), degenerateDraws: 0 };
  return {
    h1: { accuracy: iv(0.531, 0.481, 0.581), pass: false, verdict: "CALL STANDS" },
    h2: { llmAccuracy: iv(0.512, 0.462, 0.562), difference: iv(0.019, -0.03, 0.07), beats: false },
    h3: { qloo: pooled, llm: pooled, nationalPopularityContext: pooled },
    r1: { accuracy: iv(0.528, 0.47, 0.58) },
    r2: { accuracy: iv(0.527, 0.47, 0.58), pass: false, verdict: "CALL STANDS" },
    descriptive: { raw: { qloo: 0.53, llm: 0.51, nationalPopularity: 0.5, nationalPopularityCentred: 0.5, spearmanPopularityVsThemeMeanLift: 0.1, themesInSpearman: 9 } },
    diagnostics: { droppedCombos: 4, combos: 360, pairs: 543, clubsWithPairs: 89, nights: 380, nightsInput: 385, flatThemes: { qloo: [], llm: [] }, perTheme },
    binned,
    meta: { seed: 20261030, reps: 10000, passLine: { accuracyAtLeast: 0.55, lowerBoundAbove: 0.5 }, interval: "95%", pulledAt: "SYNTHETIC", commit: null },
  };
}

export function loadStudy(): StudyView {
  const real = Object.values(files)[0];
  if (real) return { pending: false, synthetic: false, results: real };
  if (import.meta.env.DEV || import.meta.env.VITE_STUDY_FIXTURE === "1") return { pending: true, synthetic: true, results: fixture() };
  return { pending: true, synthetic: false, results: null };
}
