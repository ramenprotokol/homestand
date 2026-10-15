import type { SearchHit } from "../qloo/client";

export interface NameSpec {
  names: string[];
  year?: number;
}

/** Case, punctuation and diacritics insensitive. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** First candidate whose normalised name matches and, when a year is required, whose release year equals it. */
export function pickEntity(candidates: SearchHit[], spec: NameSpec): SearchHit | null {
  const wanted = new Set(spec.names.map(normalizeName));
  return candidates.find((c) => wanted.has(normalizeName(c.name)) && (spec.year === undefined || c.releaseYear === spec.year)) ?? null;
}

/** Per entity, the affinity at each ballpark (null = Qloo returned none). */
export type AffinityTable = Record<string, Array<number | null>>;

export interface ShapeEvaluation {
  pass: boolean;
  /** A4 (1): numeric affinity at >= 95% of ballparks for every entity. */
  coverage: boolean;
  /** A4 (2): more than one distinct value per entity. */
  varies: boolean;
  missing: string[];
  flat: string[];
}

export function evaluateShape(table: AffinityTable): ShapeEvaluation {
  const missing: string[] = [];
  const flat: string[] = [];
  for (const [id, values] of Object.entries(table)) {
    const nums = values.filter((v): v is number => v !== null);
    if (nums.length < Math.ceil(0.95 * values.length)) missing.push(id);
    if (new Set(nums).size <= 1) flat.push(id);
  }
  const coverage = missing.length === 0;
  const varies = flat.length === 0;
  return { pass: coverage && varies, coverage, varies, missing, flat };
}

export interface RadiusResult {
  radiusM: number;
  evaluation: ShapeEvaluation;
}

/** Smallest radius that passes A4 (1) and (2); the ladder is ascending. */
export function chooseRadius(results: RadiusResult[]): number | null {
  return [...results].sort((x, y) => x.radiusM - y.radiusM).find((r) => r.evaluation.pass)?.radiusM ?? null;
}

/** A4 (4): the locality fallback applies only if POINT failed (1) at every radius tried. */
export function needsLocalityFallback(results: RadiusResult[]): boolean {
  return results.length > 0 && results.every((r) => !r.evaluation.coverage);
}

const mean = (xs: Array<number | null>): number | null => {
  const n = xs.filter((v): v is number => v !== null);
  return n.length ? n.reduce((s, v) => s + v, 0) / n.length : null;
};

/** Mean affinity of the entities Qloo resolved with a value. */
export const bundleScore = mean;

/** Mean of the bundle entities' popularity values (Amendment 1, A1). */
export const nationalPopularity = mean;

/** Largest absolute difference; Infinity if one side has a value the other lacks. */
export function maxAbsDiff(a: Array<number | null>, b: Array<number | null>): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === null && y === null) continue;
    if (x === null || y === null) return Infinity;
    max = Math.max(max, Math.abs(x - y));
  }
  return max;
}
