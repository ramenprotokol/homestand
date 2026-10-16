import type { Bin, Interval, Verdict } from "../study/analysis";
import { STUDY_THEMES } from "../study/themes";

// `study/results.json` is the aggregates-only file written by `npm run study:analyze` then study/export.ts. The glob keeps
// the build working if the file is ever absent (the glob is simply empty).
const files = import.meta.glob("../../study/results.json", { eager: true, import: "default" }) as Record<string, PublishedResults>;

/** The parts of study/results.json the page reads. */
export interface PublishedResults {
  verdict: Verdict;
  counts: { nights: number; nightsInput: number; combos: number; droppedCombos: number; pairs: number; clubsWithPairs: number };
  h1: { accuracy: Interval; pass: boolean; verdict: Verdict };
  h2: { llmAccuracy: Interval; difference: Interval; beats: boolean };
  rawLiftAccuracy: { qloo: number; llm: number; nationalPopularity: number; nationalPopularityCentred: number };
  perTheme: Record<string, { pairs: number; qlooAccuracy: number | null; llmDistinct: number }>;
  flatThemes: { qloo: string[]; llm: string[] };
  binnedByQlooZ: Bin[];
}

export interface StudyView {
  /** The real file is not published yet. */
  pending: boolean;
  /** Numbers are the made-up fixture below, shown only in dev and in the e2e build. */
  synthetic: boolean;
  results: PublishedResults | null;
}

const iv = (estimate: number, lo: number, hi: number): Interval => ({ estimate, lo, hi });

/** SYNTHETIC. Every number here is invented to exercise the page. Never shown in a production build. */
function fixture(): PublishedResults {
  const perTheme = Object.fromEntries(STUDY_THEMES.map((t, i) => [t.id, { pairs: 60 + i * 3, qlooAccuracy: 0.46 + (i % 5) * 0.03, llmDistinct: 2 }]));
  const binnedByQlooZ: Bin[] = [-1.2, -0.6, 0, 0.6, 1.2].map((z, i) => ({ n: 40, zMin: z - 0.3, zMax: z + 0.3, meanZ: z, meanCentredLift: -0.02 + i * 0.01 }));
  return {
    verdict: "CALL STANDS",
    counts: { nights: 380, nightsInput: 385, combos: 360, droppedCombos: 4, pairs: 543, clubsWithPairs: 89 },
    h1: { accuracy: iv(0.531, 0.481, 0.581), pass: false, verdict: "CALL STANDS" },
    h2: { llmAccuracy: iv(0.512, 0.462, 0.562), difference: iv(0.019, -0.03, 0.07), beats: false },
    rawLiftAccuracy: { qloo: 0.53, llm: 0.51, nationalPopularity: 0.5, nationalPopularityCentred: 0.5 },
    perTheme, flatThemes: { qloo: [], llm: [] }, binnedByQlooZ,
  };
}

export function loadStudy(): StudyView {
  const real = Object.values(files)[0];
  if (real) return { pending: false, synthetic: false, results: real };
  if (import.meta.env.DEV || import.meta.env.VITE_STUDY_FIXTURE === "1") return { pending: true, synthetic: true, results: fixture() };
  return { pending: true, synthetic: false, results: null };
}
