# Homestand Plan 1 · Foundation + Study Data Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Homestand repo and build the pipeline for The Study, the part that doesn't need the Qloo key yet:
- fetch 2025 MiLB schedules (local only, never committed);
- parse them into theme nights;
- classify study themes;
- fit the attendance baseline and compute each night's residual lift;
- summarise the sample.

**Architecture:**
- **Pure TypeScript modules** in `src/study/` (`parse.ts`, `themes.ts`, `model.ts`, `summary.ts`), all tested with Vitest.
- **Two small CLIs**, run with `tsx`: `study/fetch.ts` writes raw JSON to `data/raw/` and `study/build.ts` writes derived JSON to `data/derived/`. Both folders are gitignored, because MLB data must never be committed (spec section 4, `DATA_RIGHTS.md`).
- **Linear algebra** uses `ml-matrix` (QR least squares).

**Tech Stack:** Node 22, TypeScript 6, Vite 8, Vitest 5, ESLint 10, ml-matrix, tsx.

## Global Constraints

- Repo `~/RamenProtocol/homestand` (git identity is ramenprotokol automatically; never change git config), branch `hs-plan-1`. **Never** push, deploy or publish. Never read or write outside the repo (npm cache excepted).
- **MLB data is never committed.**
  - `data/raw/` and `data/derived/` are gitignored.
  - Tests use small hand-written fixtures shaped like the API, with fictional clubs and promos.
  - Only code and, later, aggregate study results are committed.
- The 9 study themes, ids exactly: `star-wars`, `princess`, `bluey`, `harry-potter`, `margaritaville`, `dinosaur`, `country`, `marvel`, `wrestling`.
- **Baseline model** (amended 2026-10-05 after the parser review, before pre-registration):
  - Outcome: `ln(attendance)` for 2025 regular-season (`gameType` "R") home games that meet all of these:
    - official finals (`status.codedGameState === "F"`, which includes rain-shortened "Completed Early" games), with attendance > 0;
    - not double-headers;
    - not rescheduled;
    - not played with `reverseHomeAwayStatus`;
    - played at the club's most-used venue.
  - Regressors:
    - intercept;
    - club fixed effects (the first club alphabetically is the reference);
    - weekday dummies (reference: the lowest weekday present, 0 = Sunday);
    - month dummies (reference: the lowest month present);
    - `fireworks`: any promo name matches `/firework/i`, OR any promo description matches `/\b(post-?game|postgame) fireworks\b|\bfireworks (show|spectacular|extravaganza|display|night)\b/i`. A description that ties fireworks to a named weekday (`weekday … fireworks` within 40 characters, in one sentence) counts only on that weekday;
    - `giveaway`: any promo `offerType` contains `Giveaway`, OR any promo name matches `/\bgiveaway\b/i`.
  - A night's **residual lift** is `ln(att) − fitted`.
- Commit trailer for implementer commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `LICENSE` (MIT, "Copyright (c) 2026 Ramen Protocol"), `README.md` (stub), `.github/workflows/checks.yml`, `tests/smoke.test.ts`, `src/index.ts`
- Modify: `.gitignore` (append `data/raw/` and `data/derived/`)

- [ ] **Step 1: Branch.** Run `git checkout -b hs-plan-1`.
- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "homestand",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "A season-planning agent for Minor League promotions directors: theme nights scored against what the ballpark's own market loves.",
  "license": "MIT",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "study:fetch": "tsx study/fetch.ts",
    "study:build": "tsx study/build.ts"
  },
  "engines": { "node": ">=22.13" },
  "repository": { "type": "git", "url": "git+https://github.com/ramenprotokol/homestand.git" },
  "homepage": "https://github.com/ramenprotokol/homestand"
}
```

- [ ] **Step 3: Install**

Run: `npm install ml-matrix && npm install -D typescript@^6.0.3 vite@^8.3.1 vitest@^5.0.2 eslint@^10.11.0 @eslint/js@^10.0.1 typescript-eslint@^8.71.0 @types/node@^22 tsx`
Expected: installs without errors.

- [ ] **Step 4: Write the configs.**
  - **`tsconfig.json`** is the same as tip-the-room's, with `"types": ["node"]` and `"include": ["src", "tests", "study", "vite.config.ts"]`.
  - **`vite.config.ts`**:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { hmr: false },
  test: { include: ["tests/**/*.test.ts"], exclude: ["tests/gpu/**", "node_modules/**"], testTimeout: 30_000 },
});
```

  - **`eslint.config.js`**:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "data/**", "test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
```

  - **`.github/workflows/checks.yml`**: the same as `~/RamenProtocol/tip-the-room/.github/workflows/checks.yml`. Copy it.
  - **`.gitignore`**: append

```
# MLB data: never commit (see DATA_RIGHTS.md)
data/raw/
data/derived/
```

- [ ] **Step 5: Smoke test.** `src/index.ts` contains `export const APP_NAME = "Homestand";`, and `tests/smoke.test.ts` asserts it equals `"Homestand"`. Add a minimal `index.html` (title "Homestand", loads `/src/index.ts`) so `npm run build` works.
- [ ] **Step 6: Verify.** Run `npm run typecheck && npm run lint && npm test && npm run build`. All succeed.
- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts eslint.config.js LICENSE README.md .github/workflows/checks.yml .gitignore index.html src/index.ts tests/smoke.test.ts
git commit -m "chore: scaffold Homestand (Vite, TS, Vitest, ESLint, CI); MLB data folders gitignored

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Parse MiLB schedules into nights

**Files:**
- Create: `src/study/parse.ts`
- Test: `tests/study/parse.test.ts`, `tests/fixtures/schedule-sample.json` (hand-written, fictional)

**Interfaces:**
- Produces:
  - `interface Night { gamePk: number; sportId: number; clubId: number; club: string; date: string; weekday: number; month: number; attendance: number; doubleHeader: boolean; promoNames: string[]; promoTypes: string[]; fireworks: boolean; giveaway: boolean; city: string | null; state: string | null; lat: number | null; lon: number | null }`
  - `parseSchedule(raw: unknown, sportId: number): Night[]`
  - `mergeNights(lists: Night[][]): Night[]` (dedupes by `gamePk`, keeping the first; sorted by `date` then `gamePk`)
- Rules:
  - Keep only games whose `status.detailedState === "Final"` and whose `gameInfo.attendance` is a positive number.
  - `weekday` comes from `officialDate` at 12:00 UTC (`getUTCDay()`, 0 = Sunday), and `month` is 1–12.
  - `doubleHeader` is `doubleHeader !== "N"`.
  - The club is the **home** team.
  - Missing optional fields become `null` or `[]`. Malformed input (not an object, or no `dates` array) returns `[]`. It never throws.

- [ ] **Step 1: Write the fixture** `tests/fixtures/schedule-sample.json`

```json
{
  "dates": [
    { "games": [
      { "gamePk": 1, "officialDate": "2025-06-07", "doubleHeader": "N", "status": { "detailedState": "Final" },
        "teams": { "home": { "team": { "id": 900, "name": "Riverbend Otters" } } },
        "venue": { "location": { "city": "Riverbend", "stateAbbrev": "OH", "defaultCoordinates": { "latitude": 40.1, "longitude": -82.9 } } },
        "gameInfo": { "attendance": 6120 },
        "promotions": [
          { "name": "Bluey Night", "offerType": "Theme Days" },
          { "name": "Postgame Fireworks", "offerType": "Day of Game Highlights" },
          { "name": "Bobblehead Giveaway", "offerType": "Giveaway" }
        ] },
      { "gamePk": 2, "officialDate": "2025-06-08", "doubleHeader": "Y", "status": { "detailedState": "Final" },
        "teams": { "home": { "team": { "id": 900, "name": "Riverbend Otters" } } },
        "gameInfo": { "attendance": 3000 } },
      { "gamePk": 3, "officialDate": "2025-06-09", "doubleHeader": "N", "status": { "detailedState": "Postponed" },
        "teams": { "home": { "team": { "id": 901, "name": "Lakeside Herons" } } },
        "gameInfo": { "attendance": 0 } },
      { "gamePk": 4, "officialDate": "2025-06-10", "doubleHeader": "N", "status": { "detailedState": "Final" },
        "teams": { "home": { "team": { "id": 901, "name": "Lakeside Herons" } } },
        "gameInfo": {} }
    ] }
  ]
}
```

- [ ] **Step 2: Write the failing test** `tests/study/parse.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mergeNights, parseSchedule } from "../../src/study/parse";

const sample: unknown = JSON.parse(readFileSync(new URL("../fixtures/schedule-sample.json", import.meta.url), "utf8"));

describe("parseSchedule", () => {
  it("keeps Final games with attendance and reads promos, flags and location", () => {
    const nights = parseSchedule(sample, 12);
    expect(nights.map((n) => n.gamePk)).toEqual([1, 2]);
    const n = nights[0];
    expect(n).toMatchObject({
      sportId: 12, clubId: 900, club: "Riverbend Otters", date: "2025-06-07", weekday: 6, month: 6,
      attendance: 6120, doubleHeader: false, fireworks: true, giveaway: true,
      city: "Riverbend", state: "OH", lat: 40.1, lon: -82.9,
    });
    expect(n.promoNames).toEqual(["Bluey Night", "Postgame Fireworks", "Bobblehead Giveaway"]);
    expect(nights[1]).toMatchObject({ doubleHeader: true, promoNames: [], fireworks: false, giveaway: false, city: null, lat: null });
  });
  it("returns [] for malformed input and never throws", () => {
    expect(parseSchedule(null, 11)).toEqual([]);
    expect(parseSchedule({ dates: "nope" }, 11)).toEqual([]);
    expect(parseSchedule({ dates: [{ games: [{ gamePk: "x" }] }] }, 11)).toEqual([]);
  });
});

describe("mergeNights", () => {
  it("dedupes by gamePk keeping the first, sorted by date then gamePk", () => {
    const a = parseSchedule(sample, 12);
    const merged = mergeNights([a, a]);
    expect(merged.map((n) => n.gamePk)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 3: Run it and see it fail.** Run `npx vitest run tests/study/parse.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 4: Implement** `src/study/parse.ts`

```ts
export interface Night {
  gamePk: number;
  sportId: number;
  clubId: number;
  club: string;
  date: string;
  weekday: number;
  month: number;
  attendance: number;
  doubleHeader: boolean;
  promoNames: string[];
  promoTypes: string[];
  fireworks: boolean;
  giveaway: boolean;
  city: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const rec = (v: unknown): Rec => (isRec(v) ? v : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseGame(g: unknown, sportId: number): Night | null {
  if (!isRec(g)) return null;
  const gamePk = num(g.gamePk);
  const date = str(g.officialDate);
  if (gamePk === null || date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (str(rec(g.status).detailedState) !== "Final") return null;
  const attendance = num(rec(g.gameInfo).attendance);
  if (attendance === null || attendance <= 0) return null;
  const team = rec(rec(rec(g.teams).home).team);
  const clubId = num(team.id);
  const club = str(team.name);
  if (clubId === null || club === null) return null;
  const promos = Array.isArray(g.promotions) ? g.promotions.filter(isRec) : [];
  const promoNames = promos.map((p) => str(p.name)).filter((s): s is string => s !== null);
  const promoTypes = promos.map((p) => str(p.offerType)).filter((s): s is string => s !== null);
  const loc = rec(rec(g.venue).location);
  const coords = rec(loc.defaultCoordinates);
  const day = new Date(`${date}T12:00:00Z`);
  return {
    gamePk,
    sportId,
    clubId,
    club,
    date,
    weekday: day.getUTCDay(),
    month: day.getUTCMonth() + 1,
    attendance,
    doubleHeader: str(g.doubleHeader) !== "N",
    promoNames,
    promoTypes,
    fireworks: promoNames.some((n) => /firework/i.test(n)),
    giveaway: promoTypes.some((t) => t.includes("Giveaway")),
    city: str(loc.city),
    state: str(loc.stateAbbrev),
    lat: num(coords.latitude),
    lon: num(coords.longitude),
  };
}

export function parseSchedule(raw: unknown, sportId: number): Night[] {
  if (!isRec(raw) || !Array.isArray(raw.dates)) return [];
  const out: Night[] = [];
  for (const d of raw.dates) {
    const games = rec(d).games;
    if (!Array.isArray(games)) continue;
    for (const g of games) {
      const n = parseGame(g, sportId);
      if (n) out.push(n);
    }
  }
  return out;
}

export function mergeNights(lists: Night[][]): Night[] {
  const byPk = new Map<number, Night>();
  for (const list of lists) for (const n of list) if (!byPk.has(n.gamePk)) byPk.set(n.gamePk, n);
  return [...byPk.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.gamePk - b.gamePk));
}
```

- [ ] **Step 5: Run it and see it pass.** Run `npx vitest run tests/study/parse.test.ts`, then `npm run typecheck && npm run lint && npm test`.
- [ ] **Step 6: Commit**

```bash
git add src/study/parse.ts tests/study/parse.test.ts tests/fixtures/schedule-sample.json
git commit -m "feat(study): parse MiLB schedules into theme-night records

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Classify study themes

**Files:**
- Create: `src/study/themes.ts`
- Test: `tests/study/themes.test.ts`

**Interfaces:**
- Produces:
  - `type StudyThemeId = "star-wars" | "princess" | "bluey" | "harry-potter" | "margaritaville" | "dinosaur" | "country" | "marvel" | "wrestling"`
  - `STUDY_THEMES: ReadonlyArray<{ id: StudyThemeId; label: string; pattern: RegExp }>` (in that order)
  - `classifyThemes(promoNames: string[]): StudyThemeId[]` (unique, in `STUDY_THEMES` order)

- [ ] **Step 1: Write the failing test** `tests/study/themes.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { STUDY_THEMES, classifyThemes } from "../../src/study/themes";

describe("classifyThemes", () => {
  it("has the nine study themes in order", () => {
    expect(STUDY_THEMES.map((t) => t.id)).toEqual(["star-wars", "princess", "bluey", "harry-potter", "margaritaville", "dinosaur", "country", "marvel", "wrestling"]);
  });
  it.each([
    [["Star Wars Night"], ["star-wars"]],
    [["May the 4th Be With You"], ["star-wars"]],
    [["Princess & Superhero Night"], ["princess"]],
    [["Bluey Day"], ["bluey"]],
    [["Wizarding Night"], ["harry-potter"]],
    [["Harry Potter Night presented by X"], ["harry-potter"]],
    [["Margaritaville Night"], ["margaritaville"]],
    [["Jimmy Buffett Tribute"], ["margaritaville"]],
    [["Dino Day"], ["dinosaur"]],
    [["Jurassic Night"], ["dinosaur"]],
    [["Country Night"], ["country"]],
    [["Country Music Night"], ["country"]],
    [["Marvel Super Hero Night"], ["marvel"]],
    [["Spider-Man Night"], ["marvel"]],
    [["Wrestling Night"], ["wrestling"]],
    [["WWE Legends Appearance"], ["wrestling"]],
  ])("%j → %j", (names, expected) => {
    expect(classifyThemes(names)).toEqual(expected);
  });
  it("ignores unrelated promos and near-misses", () => {
    expect(classifyThemes(["Postgame Fireworks", "Bobblehead Giveaway", "Wizard of Oz Night", "Country Club Night", "Dinner Night"])).toEqual([]);
  });
  it("returns each theme once, in canonical order", () => {
    expect(classifyThemes(["Bluey Night", "Star Wars Night", "Bluey Meet & Greet"])).toEqual(["star-wars", "bluey"]);
  });
});
```

- [ ] **Step 2: Run it and see it fail.** Run `npx vitest run tests/study/themes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `src/study/themes.ts`

```ts
export type StudyThemeId =
  | "star-wars" | "princess" | "bluey" | "harry-potter" | "margaritaville"
  | "dinosaur" | "country" | "marvel" | "wrestling";

export const STUDY_THEMES: ReadonlyArray<{ id: StudyThemeId; label: string; pattern: RegExp }> = [
  { id: "star-wars", label: "Star Wars", pattern: /\bstar wars\b|\bmay the (4th|fourth)\b|\bjedi\b|\bmandalorian\b/i },
  { id: "princess", label: "Princess", pattern: /\bprincess(es)?\b/i },
  { id: "bluey", label: "Bluey", pattern: /\bbluey\b/i },
  { id: "harry-potter", label: "Harry Potter", pattern: /\bharry potter\b|\bhogwarts\b|\bwizarding\b/i },
  { id: "margaritaville", label: "Margaritaville", pattern: /\bmargaritaville\b|\bjimmy buffett\b|\bparrot ?heads?\b/i },
  { id: "dinosaur", label: "Dinosaur", pattern: /\bdino(saur)?s?\b|\bjurassic\b/i },
  { id: "country", label: "Country", pattern: /\bcountry (music )?(night|day)\b/i },
  { id: "marvel", label: "Marvel", pattern: /\bmarvel\b|\bavengers\b|\bspider-?man\b/i },
  { id: "wrestling", label: "Wrestling", pattern: /\bwrestl(ing|er|ers)\b|\bwwe\b/i },
];

export function classifyThemes(promoNames: string[]): StudyThemeId[] {
  return STUDY_THEMES.filter((t) => promoNames.some((n) => t.pattern.test(n))).map((t) => t.id);
}
```

- [ ] **Step 4: Run it and see it pass.** Then `npm run typecheck && npm run lint && npm test`.
- [ ] **Step 5: Commit**

```bash
git add src/study/themes.ts tests/study/themes.test.ts
git commit -m "feat(study): keyword rules for the nine study themes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Attendance baseline and residual lift

**Files:**
- Create: `src/study/model.ts`
- Test: `tests/study/model.test.ts`

**Interfaces:**
- Consumes: `ml-matrix` (`Matrix`, `QrDecomposition`).
- Produces:
  - `interface BaselineRow { club: string; weekday: number; month: number; fireworks: boolean; giveaway: boolean; attendance: number }`
  - `interface BaselineFit { columns: string[]; coefficients: number[]; residuals: number[]; rSquared: number }`
  - `fitBaseline(rows: BaselineRow[]): BaselineFit`. Columns in this order: `intercept`, `club:<name>` (all clubs except the first in sorted order), `wd:<n>` (all weekdays present except the lowest), `m:<n>` (all months present except the lowest), `fireworks`, `giveaway`. It throws `Error("Not enough rows to fit the baseline")` if rows < columns. `residuals[i]` is `ln(att_i) − fitted_i`, in input order.

- [ ] **Step 1: Write the failing test** `tests/study/model.test.ts`

```ts
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
  it("refuses to fit with fewer rows than columns", () => {
    expect(() => fitBaseline(synthetic().rows.slice(0, 2))).toThrow("Not enough rows to fit the baseline");
  });
});
```

- [ ] **Step 2: Run it and see it fail.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `src/study/model.ts`

```ts
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

const sortedUnique = <T>(xs: T[]): T[] => [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export function fitBaseline(rows: BaselineRow[]): BaselineFit {
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
  ];
  if (rows.length < columns.length) throw new Error("Not enough rows to fit the baseline");

  const X = rows.map((r) => [
    1,
    ...clubs.map((c) => (r.club === c ? 1 : 0)),
    ...weekdays.map((d) => (r.weekday === d ? 1 : 0)),
    ...months.map((m) => (r.month === m ? 1 : 0)),
    r.fireworks ? 1 : 0,
    r.giveaway ? 1 : 0,
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
```

- [ ] **Step 4: Run it and see it pass.** Then `npm run typecheck && npm run lint && npm test`.
- [ ] **Step 5: Commit**

```bash
git add src/study/model.ts tests/study/model.test.ts
git commit -m "feat(study): attendance baseline (club, weekday, month, fireworks, giveaway) and residual lift

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sample summary + fetch and build CLIs (run locally)

**Files:**
- Create: `src/study/summary.ts`, `study/fetch.ts`, `study/build.ts`
- Test: `tests/study/summary.test.ts`

**Interfaces:**
- Consumes: `Night`, `parseSchedule` and `mergeNights` (parse.ts), `classifyThemes` and `StudyThemeId` (themes.ts), `fitBaseline` (model.ts).
- Produces:
  - `interface ThemeNight { gamePk: number; club: string; date: string; theme: StudyThemeId; lift: number; lat: number | null; lon: number | null; city: string | null; state: string | null }`
  - `themeNights(nights: Night[], residualByPk: Map<number, number>): ThemeNight[]`. This is one row per (night, theme) for nights with exactly ONE study theme; nights with two or more study themes are excluded.
  - `summarize(rows: ThemeNight[]): { perTheme: Record<StudyThemeId, { nights: number; clubs: number }>; total: number; clubsWithTwoPlusThemes: number; withinClubPairs: number }`. A within-club pair is two **different** themes run by the same club, using each club's theme set: for k distinct themes that is k·(k−1)/2 pairs.

- [ ] **Step 1: Write the failing test** `tests/study/summary.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { Night } from "../../src/study/parse";
import { summarize, themeNights } from "../../src/study/summary";

const night = (gamePk: number, club: string, promo: string[]): Night => ({
  gamePk, sportId: 12, clubId: 1, club, date: `2025-06-${String(gamePk).padStart(2, "0")}`, weekday: 6, month: 6,
  attendance: 5000, doubleHeader: false, promoNames: promo, promoTypes: [], fireworks: false, giveaway: false,
  city: "X", state: "OH", lat: 40, lon: -80, venueId: 1, rescheduled: false,
});

describe("themeNights and summarize", () => {
  const nights = [
    night(1, "A", ["Bluey Night"]),
    night(2, "A", ["Star Wars Night"]),
    night(3, "A", ["Princess Night"]),
    night(4, "B", ["Bluey Night"]),
    night(5, "B", ["Bluey Night", "Star Wars Night"]),
    night(6, "C", ["Fireworks"]),
  ];
  const residuals = new Map([[1, 0.1], [2, -0.05], [3, 0], [4, 0.2], [5, 0.3], [6, 0]]);
  it("keeps single-theme nights only, carrying the residual lift", () => {
    const rows = themeNights(nights, residuals);
    expect(rows.map((r) => [r.gamePk, r.theme, r.lift])).toEqual([[1, "bluey", 0.1], [2, "star-wars", -0.05], [3, "princess", 0], [4, "bluey", 0.2]]);
  });
  it("counts nights, clubs and within-club pairs", () => {
    const s = summarize(themeNights(nights, residuals));
    expect(s.total).toBe(4);
    expect(s.perTheme.bluey).toEqual({ nights: 2, clubs: 2 });
    expect(s.perTheme["star-wars"]).toEqual({ nights: 1, clubs: 1 });
    expect(s.clubsWithTwoPlusThemes).toBe(1);
    expect(s.withinClubPairs).toBe(3);
  });
});
```

- [ ] **Step 2: Run it and see it fail.** Then implement `src/study/summary.ts`:

```ts
import type { Night } from "./parse";
import { STUDY_THEMES, classifyThemes, type StudyThemeId } from "./themes";

export interface ThemeNight {
  gamePk: number;
  club: string;
  date: string;
  theme: StudyThemeId;
  lift: number;
  lat: number | null;
  lon: number | null;
  city: string | null;
  state: string | null;
}

export function themeNights(nights: Night[], residualByPk: Map<number, number>): ThemeNight[] {
  const out: ThemeNight[] = [];
  for (const n of nights) {
    const themes = classifyThemes(n.promoNames);
    const lift = residualByPk.get(n.gamePk);
    if (themes.length !== 1 || lift === undefined) continue;
    out.push({ gamePk: n.gamePk, club: n.club, date: n.date, theme: themes[0], lift, lat: n.lat, lon: n.lon, city: n.city, state: n.state });
  }
  return out;
}

export function summarize(rows: ThemeNight[]) {
  const perTheme = Object.fromEntries(STUDY_THEMES.map((t) => [t.id, { nights: 0, clubs: 0 }])) as Record<StudyThemeId, { nights: number; clubs: number }>;
  const clubsByTheme = new Map<StudyThemeId, Set<string>>();
  const themesByClub = new Map<string, Set<StudyThemeId>>();
  for (const r of rows) {
    perTheme[r.theme].nights++;
    if (!clubsByTheme.has(r.theme)) clubsByTheme.set(r.theme, new Set());
    clubsByTheme.get(r.theme)!.add(r.club);
    if (!themesByClub.has(r.club)) themesByClub.set(r.club, new Set());
    themesByClub.get(r.club)!.add(r.theme);
  }
  for (const [t, clubs] of clubsByTheme) perTheme[t].clubs = clubs.size;
  let clubsWithTwoPlusThemes = 0;
  let withinClubPairs = 0;
  for (const themes of themesByClub.values()) {
    const k = themes.size;
    if (k >= 2) clubsWithTwoPlusThemes++;
    withinClubPairs += (k * (k - 1)) / 2;
  }
  return { perTheme, total: rows.length, clubsWithTwoPlusThemes, withinClubPairs };
}
```

- [ ] **Step 3: Run it and see it pass.**

- [ ] **Step 4: Write `study/fetch.ts`** (network; not unit-tested). It writes nothing outside `data/raw/`.

```ts
import { mkdirSync, writeFileSync } from "node:fs";

// Minor League levels: 11 Triple-A, 12 Double-A, 13 High-A, 14 Single-A. 2025 regular season.
// Data is MLB Advanced Media's: fetched for individual, non-commercial study on this machine only. Never commit it.
const SPORTS = [11, 12, 13, 14];
const SEASON = 2025;

mkdirSync("data/raw", { recursive: true });
for (const sportId of SPORTS) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=${sportId}&season=${SEASON}&gameType=R&hydrate=game(promotions),gameInfo,venue(location)`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB schedule ${sportId}: HTTP ${res.status}`);
  const body = await res.text();
  writeFileSync(`data/raw/schedule-${SEASON}-${sportId}.json`, body);
  console.log(`sport ${sportId}: ${(body.length / 1e6).toFixed(1)} MB`);
}
```

- [ ] **Step 5: Write `study/build.ts`**, which reads raw, writes derived and prints the summary.

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fitBaseline } from "../src/study/model";
import { mergeNights, parseSchedule } from "../src/study/parse";
import { summarize, themeNights } from "../src/study/summary";

const SPORTS = [11, 12, 13, 14];
const nights = mergeNights(SPORTS.map((s) => parseSchedule(JSON.parse(readFileSync(`data/raw/schedule-2025-${s}.json`, "utf8")), s)))
  .filter((n) => !n.doubleHeader && !n.rescheduled);
// Keep only nights at each club's most-used venue (drops special-venue and borrowed-park games).
const venueCounts = new Map<string, Map<number | null, number>>();
for (const n of nights) {
  const m = venueCounts.get(n.club) ?? new Map<number | null, number>();
  m.set(n.venueId, (m.get(n.venueId) ?? 0) + 1);
  venueCounts.set(n.club, m);
}
const homeVenue = new Map([...venueCounts].map(([club, m]) => [club, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
const homeNights = nights.filter((n) => n.venueId === homeVenue.get(n.club));
const fit = fitBaseline(homeNights);
const residualByPk = new Map(homeNights.map((n, i) => [n.gamePk, fit.residuals[i]]));
const rows = themeNights(homeNights, residualByPk);
mkdirSync("data/derived", { recursive: true });
writeFileSync("data/derived/theme-nights-2025.json", JSON.stringify(rows));
const s = summarize(rows);
console.log(`nights in baseline: ${homeNights.length} (dropped ${nights.length - homeNights.length} away-venue) · clubs: ${new Set(homeNights.map((n) => n.club)).size} · R² ${fit.rSquared.toFixed(3)}`);
console.log(`single-theme study nights: ${s.total} · clubs with 2+ themes: ${s.clubsWithTwoPlusThemes} · within-club pairs: ${s.withinClubPairs}`);
for (const [theme, v] of Object.entries(s.perTheme)) console.log(`  ${theme.padEnd(15)} nights ${String(v.nights).padStart(4)} · clubs ${v.clubs}`);
```

- [ ] **Step 6: Run both locally.** Run `npm run study:fetch && npm run study:build`. Paste the printed summary into your report. Confirm with `git status --short` that `data/` shows nothing to commit (gitignored).
- [ ] **Step 7: Verify and commit.** Run `npm run typecheck && npm run lint && npm test`.

```bash
git add src/study/summary.ts tests/study/summary.test.ts study/fetch.ts study/build.ts
git commit -m "feat(study): sample summary; local fetch and build CLIs (MLB data stays uncommitted)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6 (controller): Pre-registration and data-rights note

Written by the controller (Opus), not an implementer, **before any Qloo score is pulled**:
- `study/PREREGISTRATION.md`: hypotheses, the sample rules from this plan, the model, the predictors (Qloo local affinity, national popularity, an LLM 1–10 rating), the metrics (pooled partial correlation with club-clustered bootstrap CIs; within-club pairwise accuracy), and the pass line (pairwise ≥ 55%, CI excluding 50%, beating the LLM baseline).
- `DATA_RIGHTS.md`: what is fetched, why it is never committed, and what is published (code plus aggregate results only).

Committed with the sample counts printed by Task 5.
