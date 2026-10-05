import { Matrix, QrDecomposition } from "ml-matrix";

export interface BaselineRow {
  club: string;
  weekday: number;
  month: number;
  fireworks: boolean;
  giveaway: boolean;
  attendance: number;
}

export interface BaselineFit {
  columns: string[];
  coefficients: number[];
  residuals: number[];
  rSquared: number;
}

/** An additional regressor, appended after `giveaway` (e.g. the robustness baseline's other-promos count). */
export interface ExtraRegressor<R extends BaselineRow> {
  name: string;
  value: (row: R) => number;
}

const sortedUnique = <T>(xs: T[]): T[] => [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export function fitBaseline<R extends BaselineRow>(rows: R[], extra: ReadonlyArray<ExtraRegressor<R>> = []): BaselineFit {
  const clubs = sortedUnique(rows.map((r) => r.club)).slice(1);
  const weekdays = sortedUnique(rows.map((r) => r.weekday)).slice(1);
  const months = sortedUnique(rows.map((r) => r.month)).slice(1);
  const columns = [
    "intercept",
    ...clubs.map((c) => `club:${c}`),
    ...weekdays.map((d) => `wd:${d}`),
    ...months.map((m) => `m:${m}`),
    "fireworks",
    "giveaway",
    ...extra.map((e) => e.name),
  ];
  const duplicate = columns.find((c, i) => columns.indexOf(c) !== i);
  if (duplicate !== undefined) throw new Error(`Duplicate baseline column: ${duplicate}`);
  if (rows.length < columns.length) throw new Error("Not enough rows to fit the baseline");

  const X = rows.map((r) => [
    1,
    ...clubs.map((c) => (r.club === c ? 1 : 0)),
    ...weekdays.map((d) => (r.weekday === d ? 1 : 0)),
    ...months.map((m) => (r.month === m ? 1 : 0)),
    r.fireworks ? 1 : 0,
    r.giveaway ? 1 : 0,
    ...extra.map((e) => e.value(r)),
  ]);
  const y = rows.map((r) => Math.log(r.attendance));
  const Xm = new Matrix(X);
  const beta = new QrDecomposition(Xm).solve(Matrix.columnVector(y)).getColumn(0);
  const fitted = Xm.mmul(Matrix.columnVector(beta)).getColumn(0);
  const residuals = y.map((v, i) => v - fitted[i]);
  const mean = y.reduce((s, v) => s + v, 0) / y.length;
  const ssTot = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  return { columns, coefficients: beta, residuals, rSquared: ssTot === 0 ? 1 : 1 - ssRes / ssTot };
}
