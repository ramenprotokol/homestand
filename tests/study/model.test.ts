import { describe, expect, it } from "vitest";
import { fitBaseline, type BaselineRow } from "../../src/study/model";

function synthetic(themeLift = 0): { rows: BaselineRow[]; themed: boolean[] } {
  const clubs = { Alpha: 3000, Bravo: 5000, Charlie: 8000 };
  const wd = [1.0, 0.8, 0.8, 0.85, 0.9, 1.2, 1.3];
  const months = { 5: 0.9, 6: 1.0, 7: 1.1 };
  const rows: BaselineRow[] = [];
  const themed: boolean[] = [];
  for (const [club, base] of Object.entries(clubs)) {
    for (const [m, mf] of Object.entries(months)) {
      for (let d = 0; d < 7; d++) {
        for (const fireworks of [false, true]) {
          for (const giveaway of [false, true]) {
            const isThemed = d === 5 && !fireworks && !giveaway && club === "Bravo";
            const att = base * wd[d] * mf * (fireworks ? 1.2 : 1) * (giveaway ? 1.1 : 1) * (isThemed ? Math.exp(themeLift) : 1);
            rows.push({ club, weekday: d, month: Number(m), fireworks, giveaway, attendance: att });
            themed.push(isThemed);
          }
        }
      }
    }
  }
  return { rows, themed };
}

describe("fitBaseline", () => {
  it("recovers multiplicative effects exactly on noiseless data", () => {
    const { rows } = synthetic();
    const fit = fitBaseline(rows);
    const coef = (name: string) => fit.coefficients[fit.columns.indexOf(name)];
    expect(fit.columns[0]).toBe("intercept");
    expect(coef("fireworks")).toBeCloseTo(Math.log(1.2), 9);
    expect(coef("giveaway")).toBeCloseTo(Math.log(1.1), 9);
    expect(coef("club:Bravo")).toBeCloseTo(Math.log(5000 / 3000), 9);
    expect(coef("wd:6")).toBeCloseTo(Math.log(1.3), 9);
    expect(coef("m:7")).toBeCloseTo(Math.log(1.1 / 0.9), 9);
    expect(Math.max(...fit.residuals.map(Math.abs))).toBeLessThan(1e-9);
    expect(fit.rSquared).toBeCloseTo(1, 9);
  });
  it("puts an unmodelled theme lift into the residuals of the themed nights", () => {
    const { rows, themed } = synthetic(0.25);
    const fit = fitBaseline(rows);
    const themedRes = fit.residuals.filter((_, i) => themed[i]);
    const otherRes = fit.residuals.filter((_, i) => !themed[i]);
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    expect(mean(themedRes)).toBeGreaterThan(0.15);
    expect(Math.abs(mean(otherRes))).toBeLessThan(0.01);
  });
  it("appends extra regressors after giveaway and recovers a planted coefficient", () => {
    const { rows } = synthetic();
    const promoRows = rows.map((r, i) => {
      const promos = (i * 7) % 4;
      return { ...r, promos, attendance: r.attendance * Math.exp(0.05 * promos) };
    });
    const fit = fitBaseline(promoRows, [{ name: "promos", value: (r) => r.promos }]);
    expect(fit.columns.slice(-3)).toEqual(["fireworks", "giveaway", "promos"]);
    expect(fit.coefficients[fit.columns.indexOf("promos")]).toBeCloseTo(0.05, 9);
    expect(fit.coefficients[fit.columns.indexOf("fireworks")]).toBeCloseTo(Math.log(1.2), 9);
    expect(Math.max(...fit.residuals.map(Math.abs))).toBeLessThan(1e-9);
  });
  it("is unchanged when extra is omitted or empty", () => {
    const { rows } = synthetic(0.25);
    const plain = fitBaseline(rows);
    expect(fitBaseline(rows, [])).toEqual(plain);
    expect(plain.columns).not.toContain("promos");
    expect(plain.columns.at(-1)).toBe("giveaway");
  });
  it("refuses an extra column whose name is already taken", () => {
    expect(() => fitBaseline(synthetic().rows, [{ name: "giveaway", value: () => 1 }])).toThrow("Duplicate baseline column: giveaway");
  });
  it("refuses to fit with fewer rows than columns", () => {
    expect(() => fitBaseline(synthetic().rows.slice(0, 2))).toThrow("Not enough rows to fit the baseline");
  });
});
