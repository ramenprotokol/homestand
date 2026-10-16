import statsFile from "../data/reference-stats.json";
import syntheticFile from "../data/reference-stats.synthetic.json";

export type FitLabel = "leans-in" | "average" | "leans-away" | "not-scored" | "classic";

export const FIT_WORDS: Record<FitLabel, string> = {
  "leans-in": "Leans in",
  average: "About average",
  "leans-away": "Leans away",
  "not-scored": "Not scored",
  classic: "Classic night",
};

/** z at or beyond these cut-offs is "Leans in" / "Leans away". */
export const Z_CUT = 0.5;

export interface RefStat {
  n: number;
  mean: number;
  sd: number;
}

export interface ReferenceStats {
  synthetic: boolean;
  markets: number;
  pulledAt: string | null;
  themes: Record<string, RefStat>;
}

export const REFERENCE: ReferenceStats = statsFile as ReferenceStats;
/** Made-up aggregates for the offline synthetic mode (local runs and tests only). */
export const SYNTHETIC_REFERENCE: ReferenceStats = syntheticFile as ReferenceStats;

/** Below this a reference SD is treated as flat: there is nothing to compare against. */
const MIN_SD = 1e-6;
/** A reference built from fewer markets than this is too thin to compare against. */
export const MIN_REF_N = 20;

/** Mean affinity of the bundle. The bundle is fixed: if any entity has no affinity the theme has no score at this market. */
export function bundleScore(affinities: ReadonlyArray<number | null>): number | null {
  if (affinities.length === 0 || affinities.some((a) => a === null)) return null;
  return (affinities as number[]).reduce((s, a) => s + a, 0) / affinities.length;
}

export interface Fit {
  label: FitLabel;
  z: number | null;
  /** Why a theme is "Not scored", in plain words. */
  reason?: string;
}

export function zScore(score: number, ref: RefStat): number | null {
  return ref.sd < MIN_SD ? null : (score - ref.mean) / ref.sd;
}

export function labelForZ(z: number): "leans-in" | "average" | "leans-away" {
  if (z >= Z_CUT) return "leans-in";
  if (z <= -Z_CUT) return "leans-away";
  return "average";
}

export function fitFor(score: number | null, ref: RefStat | undefined): Fit {
  if (score === null) return { label: "not-scored", z: null, reason: "Qloo had no reading for part of this theme in this market." };
  if (!ref || ref.n < MIN_REF_N) return { label: "not-scored", z: null, reason: "There is no reference set for this theme yet." };
  const z = zScore(score, ref);
  if (z === null) return { label: "not-scored", z: null, reason: "Ballpark markets barely differ on this theme, so there is nothing to compare." };
  return { label: labelForZ(z), z };
}

/** The comparison with typical ballpark markets, in plain words. */
export function comparisonSentence(themeLabel: string, label: FitLabel): string {
  switch (label) {
    case "leans-in":
      return `This market leans toward ${themeLabel} more than most ballpark markets.`;
    case "leans-away":
      return `This market leans toward ${themeLabel} less than most ballpark markets.`;
    case "average":
      return `This market's taste for ${themeLabel} is about the same as most ballpark markets.`;
    default:
      return "";
  }
}

export const METHOD_WORDS =
  "We ask Qloo how strongly people near this ballpark lean toward each thing in the theme, then compare that with 40 other ballpark markets. " +
  "Higher than most (about half a standard step or more) is \"Leans in\". Lower than most by the same amount is \"Leans away\". In between is \"About average\". " +
  "It describes local taste. It does not say a theme will raise attendance; The Study tests that question.";

export const CLASSIC_REASON = "Classic promos aren't a pop-culture taste, so Qloo doesn't score them. They stay as planned.";

/** The pre-registered consequence of H1 not passing (study/PREREGISTRATION.md). Shown on the landing page, the Why panel and The Study. */
export const AUDIT_LINE = "H1 did not pass, so Homestand is a reasoned, cited audit of local taste, not an attendance predictor.";
