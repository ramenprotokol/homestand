// Turns the saved raw pull files into the `Scores` table the pre-registered analysis reads. Pure: file access is injected.
import { affinityRowsFromBody, type QlooType } from "../qloo/client";
import type { Scores, ScoreTable } from "./analysis";
import {
  QLOO_TYPES, THEME_IDS, bundleAffinity, keptIdsOfType, nationalPopularityFromReadings, parseLlmInteger,
  type EntityReading, type PopularityResult,
} from "./kept-bundles";
import type { StudyThemeId } from "./themes";

export interface ClubRow {
  club: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
}

/** One saved LLM call: every reply received for the request (first try, then at most one identical retry). */
export interface LlmRecord {
  replies: unknown[];
}

export interface BuildInput {
  clubs: readonly ClubRow[];
  pulledAt: string;
  readQloo: (club: string, type: QlooType) => unknown;
  readLlm: (club: string, theme: StudyThemeId) => LlmRecord;
}

export interface BuildOutput {
  scores: Scores;
  popularity: PopularityResult;
  missing: { qloo: Record<StudyThemeId, number>; llm: Record<StudyThemeId, number> };
  /** Club-theme LLM scores that needed the single retry, and that were still non-integer after it. */
  llmRetried: number;
  llmNonInteger: number;
}

const zero = (): Record<StudyThemeId, number> => Object.fromEntries(THEME_IDS.map((t) => [t, 0])) as Record<StudyThemeId, number>;

export function buildScores(input: BuildInput): BuildOutput {
  const qloo: ScoreTable = {};
  const llm: ScoreTable = {};
  const missing = { qloo: zero(), llm: zero() };
  const readingsByClub: Map<string, EntityReading>[] = [];
  let llmRetried = 0;
  let llmNonInteger = 0;

  for (const c of input.clubs) {
    const readings = new Map<string, EntityReading>();
    for (const type of QLOO_TYPES) {
      const rows = affinityRowsFromBody(input.readQloo(c.club, type), keptIdsOfType(type));
      for (const r of rows) readings.set(r.entityId, { affinity: r.affinity, popularity: r.popularity });
    }
    readingsByClub.push(readings);
    qloo[c.club] = {};
    llm[c.club] = {};
    for (const theme of THEME_IDS) {
      const q = bundleAffinity(theme, readings);
      if (q === null) missing.qloo[theme]++;
      else qloo[c.club]![theme] = q;

      const rec = input.readLlm(c.club, theme);
      if (rec.replies.length > 1) llmRetried++;
      const first = parseLlmInteger(rec.replies[0]);
      // Amendment 5: the retry is used only when the first reply was non-integer; a second non-integer means missing.
      const value = first ?? (rec.replies.length > 1 ? parseLlmInteger(rec.replies[1]) : null);
      if (value === null) {
        missing.llm[theme]++;
        llmNonInteger++;
      } else llm[c.club]![theme] = value;
    }
  }

  const popularity = nationalPopularityFromReadings(readingsByClub);
  return { scores: { pulledAt: input.pulledAt, qloo, llm, nationalPopularity: popularity.perTheme }, popularity, missing, llmRetried, llmNonInteger };
}
