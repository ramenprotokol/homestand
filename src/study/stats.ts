import { Matrix, QrDecomposition } from "ml-matrix";

/** Seeded PRNG (mulberry32): deterministic uniform numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nonEmpty(xs: readonly number[], what: string): void {
  if (xs.length === 0) throw new Error(`${what} of an empty list`);
}

export function mean(xs: readonly number[]): number {
  nonEmpty(xs, "mean");
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

const allEqual = (xs: readonly number[]): boolean => xs.every((x) => x === xs[0]);

/** Population SD (divides by n). Exactly 0 when every value is identical, whatever the float mean. */
export function populationSd(xs: readonly number[]): number {
  nonEmpty(xs, "SD");
  if (allEqual(xs)) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

/** z-scores with the population SD. When the SD is 0, every z is 0. */
export function zScores(xs: readonly number[]): number[] {
  const sd = populationSd(xs);
  if (sd === 0) return xs.map(() => 0);
  const m = mean(xs);
  return xs.map((x) => (x - m) / sd);
}

/** Percentile p in [0, 100], linear interpolation between closest ranks: h = (n - 1) p / 100. */
export function percentile(xs: readonly number[], p: number): number {
  nonEmpty(xs, "percentile");
  if (p < 0 || p > 100) throw new Error(`percentile out of range: ${p}`);
  const sorted = [...xs].sort((a, b) => a - b);
  const h = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** 1-based ranks; tied values share the average of the ranks they span. */
export function averageRanks(xs: readonly number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const ranks = new Array<number>(xs.length);
  for (let start = 0; start < order.length; ) {
    let end = start;
    while (end + 1 < order.length && order[end + 1].x === order[start].x) end++;
    const rank = (start + end) / 2 + 1;
    for (let k = start; k <= end; k++) ranks[order[k].i] = rank;
    start = end + 1;
  }
  return ranks;
}

/** Pearson correlation. NaN if either side has no variation. */
export function pearson(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length) throw new Error("pearson: lengths differ");
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? Number.NaN : sxy / Math.sqrt(sxx * syy);
}

/** Spearman rank correlation: Pearson on average ranks (ties share their mean rank). */
export function spearman(xs: readonly number[], ys: readonly number[]): number {
  return pearson(averageRanks(xs), averageRanks(ys));
}

export interface OlsFit {
  coefficients: number[];
  residuals: number[];
}

// A column is treated as collinear when the part of it outside the span of the earlier columns
// (its QR pivot) is this small relative to the column's own length.
const RANK_TOLERANCE = 1e-9;

/** Ordinary least squares via QR (ml-matrix). Returns null when the design is rank-deficient. */
export function ols(X: readonly (readonly number[])[], y: readonly number[]): OlsFit | null {
  if (X.length !== y.length) throw new Error("ols: X and y lengths differ");
  if (X.length === 0 || X.length < X[0].length) return null;
  const Xm = new Matrix(X.map((row) => [...row]));
  const qr = new QrDecomposition(Xm);
  const r = qr.upperTriangularMatrix;
  const columnLength = (k: number) => Math.sqrt(X.reduce((s, row) => s + row[k] ** 2, 0));
  const collinear = (k: number) => Math.abs(r.get(k, k)) <= RANK_TOLERANCE * columnLength(k);
  if (!qr.isFullRank() || Array.from({ length: r.columns }, (_, k) => k).some(collinear)) return null;
  const coefficients = qr.solve(Matrix.columnVector([...y])).getColumn(0);
  const fitted = Xm.mmul(Matrix.columnVector(coefficients)).getColumn(0);
  return { coefficients, residuals: y.map((v, i) => v - fitted[i]) };
}
