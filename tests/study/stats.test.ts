import { describe, expect, it } from "vitest";
import { averageRanks, mean, mulberry32, ols, pearson, percentile, populationSd, spearman, zScores } from "../../src/study/stats";

describe("mulberry32", () => {
  it("is deterministic per seed, differs across seeds and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 2000 }, () => a());
    expect(Array.from({ length: 2000 }, () => b())).toEqual(xs);
    expect(mulberry32(43)()).not.toBe(xs[0]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(Math.abs(mean(xs) - 0.5)).toBeLessThan(0.03);
  });
});

describe("mean, population SD and z-scores", () => {
  it("uses the population SD (divides by n) on a known example", () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(xs)).toBe(5);
    expect(populationSd(xs)).toBe(2);
    expect(zScores(xs)).toEqual([-1.5, -0.5, -0.5, -0.5, 0, 0, 1, 2]);
  });
  it("gives SD exactly 0 and all-zero z when every value is identical, even where the float mean is inexact", () => {
    const xs = [0.1, 0.1, 0.1];
    expect(mean(xs)).not.toBe(0.1); // 0.30000000000000004 / 3: the trap this guards against
    expect(populationSd(xs)).toBe(0);
    expect(zScores(xs)).toEqual([0, 0, 0]);
  });
  it("refuses empty input", () => {
    expect(() => mean([])).toThrow();
    expect(() => populationSd([])).toThrow();
  });
});

describe("percentile (linear interpolation between closest ranks)", () => {
  it("matches hand-computed values on unsorted input", () => {
    const xs = [4, 1, 3, 2];
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile(xs, 50)).toBe(2.5);
    expect(percentile(xs, 100)).toBe(4);
    expect(percentile(xs, 2.5)).toBeCloseTo(1.075, 12);
    expect(percentile(xs, 97.5)).toBeCloseTo(3.925, 12);
    expect(xs).toEqual([4, 1, 3, 2]);
  });
});

describe("ranks, Pearson and Spearman", () => {
  it("gives tied values their average rank", () => {
    expect(averageRanks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(averageRanks([5, 5, 5])).toEqual([2, 2, 2]);
  });
  it("computes Spearman as Pearson on average ranks (known example with ties)", () => {
    // ranks x = [1, 2.5, 2.5, 4], y = [1, 3, 2, 4]: rho = 4.5 / sqrt(4.5 * 5) = sqrt(0.9)
    expect(spearman([1, 2, 2, 3], [1, 3, 2, 4])).toBeCloseTo(Math.sqrt(0.9), 12);
    expect(spearman([1, 2, 3, 4, 5], [2, 4, 8, 16, 32])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4, 5], [9, 7, 5, 3, 1])).toBeCloseTo(-1, 12);
  });
  it("computes Pearson on a known example", () => {
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [2, 1, 4, 3])).toBeCloseTo(0.6, 12);
  });
});

describe("ols (QR least squares)", () => {
  it("recovers planted coefficients exactly on noiseless data", () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 20; i++) {
      const a = i % 4;
      const b = (i * 7) % 5;
      X.push([1, a, b]);
      y.push(2 - 0.5 * a + 3 * b);
    }
    const fit = ols(X, y);
    expect(fit).not.toBeNull();
    expect(fit!.coefficients[0]).toBeCloseTo(2, 10);
    expect(fit!.coefficients[1]).toBeCloseTo(-0.5, 10);
    expect(fit!.coefficients[2]).toBeCloseTo(3, 10);
    expect(Math.max(...fit!.residuals.map(Math.abs))).toBeLessThan(1e-10);
  });
  it("returns null for a rank-deficient design", () => {
    const X = [[1, 2], [1, 2], [1, 2], [1, 2]];
    expect(ols(X, [1, 2, 3, 4])).toBeNull();
    const collinear = [[1, 0, 1], [1, 1, 0], [1, 0, 1], [1, 1, 0]];
    expect(ols(collinear, [1, 2, 3, 4])).toBeNull();
  });
});
