import statsFile from "../data/reference-stats.json";
import syntheticFile from "../data/reference-stats.synthetic.json";
import { copyFor, type Kind } from "../kind";

export type FitLabel = "leans-in" | "average" | "leans-away" | "not-scored" | "classic" | "found";

export const FIT_WORDS: Record<FitLabel, string> = {
  "leans-in": "Strong fit",
  average: "Average fit",
  "leans-away": "Weak fit",
  "not-scored": "No data",
  classic: "Proven promo (not graded)",
  found: "Local favorite",
};

/** The label as a person reads it: the same words for a club and a venue. */
export const fitWord = (fit: FitLabel): string => FIT_WORDS[fit];

/** What each rating means, in one plain line (the legend, and the first thing a newcomer reads). Always "compared with this town's other themes". */
const FIT_MEANING_CLUB: Record<FitLabel, string> = {
  "leans-in": "People here like it more than this town's other themes.",
  average: "People here like it about as much as this town's other themes.",
  "leans-away": "People here like it less than this town's other themes.",
  "not-scored": "We have no data for this name, so it stays as planned.",
  classic: "A tried-and-true promo. We leave it alone.",
  found: "People in this town like it more than people in most towns do.",
};

/** The same lines for a venue say "acts" where a club says "themes". */
export const fitMeaning = (fit: FitLabel, kind?: Kind): string => (kind === "venue" ? FIT_MEANING_CLUB[fit].replace("other themes", "other acts").replace("this name", "this act") : FIT_MEANING_CLUB[fit]);
export const FIT_MEANING = FIT_MEANING_CLUB;

/** z at or beyond these cut-offs is a Strong fit / a Weak fit. */
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

export function fitFor(score: number | null, ref: RefStat | undefined, kind?: Kind): Fit {
  if (score === null) return { label: "not-scored", z: null, reason: "Qloo had no data for part of this theme in this town." };
  if (!ref || ref.n < MIN_REF_N) return { label: "not-scored", z: null, reason: "There is no comparison data for this theme yet." };
  const z = zScore(score, ref);
  if (z === null) return { label: "not-scored", z: null, reason: `${copyFor(kind).markets.replace(/^./, (c) => c.toUpperCase())} barely differ on this theme, so there is nothing to compare.` };
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

/** How this town compares with other towns overall, in plain words (shown only under "Show the numbers"). */
export function marketLevelSentence(meanZ: number | null, kind?: Kind): string {
  if (meanZ === null) return "";
  const level = meanZ <= -0.25 ? "lower than usual" : meanZ >= 0.25 ? "higher than usual" : "about the same as usual";
  return `Compared with other ${copyFor(kind).markets}, this ${copyFor(kind).place} scores ${level} on most ${kind === "venue" ? "acts" : "themes"}.`;
}

/** The one plain line that says what a rating means for this theme, always against the town's own other themes. */
export function comparisonSentence(themeLabel: string, label: FitLabel, city = "This town", kind?: Kind): string {
  const others = kind === "venue" ? "its other acts" : "its other themes";
  switch (label) {
    case "leans-in":
      return `${city} likes ${themeLabel} more than ${others}.`;
    case "leans-away":
      return `${city} likes ${themeLabel} less than ${others}.`;
    case "average":
      return `${city} likes ${themeLabel} about as much as ${others}.`;
    default:
      return "";
  }
}

/** The same line, from the size of the gap: "Biloxi likes Star Wars much less than its other themes." */
export function fitLine(themeLabel: string, city: string, index: number | null, kind?: Kind): string {
  const band = pullBand(index);
  if (band === null) return "";
  const how = band === "well below" ? "much less than" : band === "below" ? "less than" : band === "about" ? "about as much as" : band === "above" ? "more than" : "much more than";
  return `${city} likes ${themeLabel} ${how} ${kind === "venue" ? "its other acts" : "its other themes"}.`;
}

/** How the method works, in plain words. Shown only under "Show the numbers". */
export const methodWords = (kind?: Kind): string =>
  `We ask Qloo how strongly people near this ${copyFor(kind).place} like each thing in a theme, and compare that with 40 other ${copyFor(kind).markets}. ` +
  "Then we compare each theme with this town's own average. A theme clearly above that average (by at least half the usual gap between towns) is a Strong fit. Clearly below is a Weak fit. In between is an Average fit. " +
  "It describes local taste. It does not say a theme will raise attendance.";

export const METHOD_WORDS = methodWords("club");

/** "a strong fit here": the plain reading of an index. */
export function fitPhrase(index: number | null): string {
  const b = pullBand(index);
  if (b === null) return "not compared";
  return b === "about" ? "an average fit here" : b === "above" || b === "well above" ? "a strong fit here" : "a weak fit here";
}

/**
 * When the label (against this town's other themes) and the comparison with other towns point opposite ways, say so in plain words, so a Strong fit
 * never sits beside "well below most towns" unexplained. Empty when they agree (or the theme is average either way).
 */
export function bridgeSentence(fit: FitLabel | "pick", z: number | null, city: string): string {
  if (z === null) return "";
  if (fit === "leans-in" && z <= -Z_CUT) return `Below most towns, but strong for ${city}'s usual taste.`;
  if (fit === "leans-away" && z >= Z_CUT) return `Above most towns, but weak for ${city}'s usual taste.`;
  return "";
}

export const CLASSIC_REASON = "Proven promos (fireworks, giveaways, heritage nights) aren't graded, because they aren't a pop-culture taste. They stay as planned.";
export const classicReason = (kind?: Kind): string => (kind === "venue" ? "Proven promos (fireworks, symphony nights, local showcases) aren't graded, because they aren't a music taste. They stay as planned." : CLASSIC_REASON);

/**
 * What the study found, in plain words. Shown on the landing page, the Why panel, The Study and the memo.
 * The numbers are the published ones (study/results.json); tests/app/score.test.ts keeps them in step.
 */
export const AUDIT_LINE = "It doesn't predict ticket sales. We tested that on 385 real 2025 nights: local taste picked the bigger crowd 49 times in 100, about a coin flip.";

/** How a score compares with the 40 other towns, from its z, in plain words (only under "Show the numbers"). */
export function vsMarketsWords(z: number | null, kind?: Kind): string {
  const m = copyFor(kind).markets;
  if (z === null) return "not compared";
  if (z <= -2 * Z_CUT) return `well below most ${m}`;
  if (z <= -Z_CUT) return `below most ${m}`;
  if (z < Z_CUT) return `about typical for ${m}`;
  if (z < 2 * Z_CUT) return `above most ${m}`;
  return `well above most ${m}`;
}

/** Why a theme everyone scores near the top can still rate below average: the small gaps between towns are what is compared. Shown only when that gap is tiny. */
export const NEAR_TOP_NOTE = "Nearly every town scores this near the top, so the small differences between towns are what matter.";

/** "Fit" in plain words from the sign and size of the index (z against the town's own average). */
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
