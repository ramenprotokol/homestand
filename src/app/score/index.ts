import statsFile from "../data/reference-stats.json";
import syntheticFile from "../data/reference-stats.synthetic.json";

export type FitLabel = "leans-in" | "average" | "leans-away" | "not-scored" | "classic" | "found";

export const FIT_WORDS: Record<FitLabel, string> = {
  "leans-in": "Leans in",
  average: "About average",
  "leans-away": "Leans away",
  "not-scored": "Not scored",
  classic: "Classic night",
  found: "Found by Qloo",
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

/** Fewer scored themes than this and a market's own average is too thin to compare against. */
export const MIN_THEMES_FOR_CENTRE = 5;

export interface Centred {
  /** Mean z over every scored theme at the market; null when too few themes were scored. */
  mean: number | null;
  count: number;
  /** index_t = z_t - mean, in the order given; null where z is null (not scored themes never enter the mean). */
  indices: Array<number | null>;
}

/**
 * Within-market centring. Some markets sit lower or higher on almost every entity, so plain z against other markets
 * measures the market's overall level. Subtracting the market's own mean z leaves what stands out inside the market,
 * the same within-club comparison the study's H1 makes.
 */
export function centre(zs: ReadonlyArray<number | null>): Centred {
  const scored = zs.filter((z): z is number => z !== null);
  if (scored.length < MIN_THEMES_FOR_CENTRE) return { mean: null, count: scored.length, indices: zs.map(() => null) };
  const mean = scored.reduce((s, z) => s + z, 0) / scored.length;
  return { mean, count: scored.length, indices: zs.map((z) => (z === null ? null : z - mean)) };
}

/** How the market compares with other ballpark markets overall, in plain words. */
export function marketLevelSentence(meanZ: number | null): string {
  if (meanZ === null) return "";
  const level = meanZ <= -0.25 ? "lower than usual" : meanZ >= 0.25 ? "higher than usual" : "about the same as usual";
  return `Compared with other ballpark markets, this market scores ${level} on most themes.`;
}

/** The theme against this market's own average, in plain words. */
export function comparisonSentence(themeLabel: string, label: FitLabel): string {
  switch (label) {
    case "leans-in":
      return `Against its own average, ${themeLabel} stands out above.`;
    case "leans-away":
      return `Against its own average, ${themeLabel} stands out below.`;
    case "average":
      return `Against its own average, ${themeLabel} is about in line.`;
    default:
      return "";
  }
}

export const METHOD_WORDS =
  "We ask Qloo how strongly people near this ballpark lean toward each thing in a theme, and compare that with 40 other ballpark markets. " +
  "Then we compare each theme with this market's own average lean, the same within-market comparison The Study uses. " +
  "A theme clearly above its own average (by at least half the usual spread between markets) is \"Leans in\". Clearly below is \"Leans away\". In between is \"About average\". " +
  "It describes local taste. It does not say a theme will raise attendance.";

/** "stands out above this market's average (+1.1)": the cited comparison, in plain words plus the number. */
export function vsAverage(index: number | null): string {
  if (index === null) return "not compared";
  const words = index >= Z_CUT ? "stands out above this market's average" : index <= -Z_CUT ? "sits below this market's average" : "is about in line with this market's average";
  return `${words} (${index >= 0 ? "+" : "-"}${Math.abs(index).toFixed(1)})`;
}

export const CLASSIC_REASON = "Classic promos aren't a pop-culture taste, so Qloo doesn't score them. They stay as planned.";

/**
 * What the study found, in plain words. Shown on the landing page, the Why panel, The Study and the memo.
 * The numbers are the published ones (study/results.json); tests/app/score.test.ts keeps them in step.
 */
export const AUDIT_LINE = "It doesn't predict ticket sales. We tested that on 385 real 2025 nights: local taste picked the bigger crowd 49 times in 100, about a coin flip.";

/** How a score compares with the 40 reference ballpark markets, from its z, in plain words. */
export function vsMarketsWords(z: number | null): string {
  if (z === null) return "not compared";
  if (z <= -2 * Z_CUT) return "well below most ballpark markets";
  if (z <= -Z_CUT) return "below most ballpark markets";
  if (z < Z_CUT) return "about typical for ballpark markets";
  if (z < 2 * Z_CUT) return "above most ballpark markets";
  return "well above most ballpark markets";
}

/** Why a theme everyone scores near the top can still sit below average: the small gaps between markets are what is compared. */
export const NEAR_TOP_NOTE = "Nearly every market scores this near the top, so the small differences between markets are what matter.";

/** "Local pull" in plain words from the sign and size of the index (z against the market's own average). */
export function pullWords(index: number | null): string {
  const band = pullBand(index);
  return band === null ? "not compared" : band === "about" ? "about this town's usual" : `${band} this town's usual`;
}

/** The band alone: "well below", "below", "about", "above" or "well above". */
export function pullBand(index: number | null): "well below" | "below" | "about" | "above" | "well above" | null {
  if (index === null) return null;
  if (index <= -2 * Z_CUT) return "well below";
  if (index <= -Z_CUT) return "below";
  if (index < Z_CUT) return "about";
  if (index < 2 * Z_CUT) return "above";
  return "well above";
}
