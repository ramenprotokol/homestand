import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCalendar } from "../../src/app/calendar/csv";
import { syntheticDiscoveryReference } from "../../src/app/discovery";
import { SAMPLE_MARKETS } from "../../src/app/markets";
import { exampleCsv, sampleCsv } from "../../src/app/samples";
import { SYNTHETIC_REFERENCE } from "../../src/worker/reference";
import { activeLibrary } from "../../src/app/themes/ids";
import { analyze, proposeSwaps, type Deps } from "../../src/worker/agent";
import { memoryKv } from "../../src/worker/ports";
import { syntheticQlooFetch } from "../../src/worker/synthetic";

// Club runs must not change when new features are added. This runs the four baseball samples (and "Load an example" at two
// markets) end to end on the synthetic data (analyze, then propose) and compares every band, swap, alternate, angle,
// unfixed night and step-log line with a snapshot recorded before venue mode was added.
const FILE = process.env.CLUB_BASELINE_FILE ? new URL(`file://${process.env.CLUB_BASELINE_FILE}`) : new URL("../fixtures/club-baseline.json", import.meta.url);

function deps(): Deps {
  return {
    kv: memoryKv(), ai: null, mode: "live", qlooFetch: syntheticQlooFetch, qlooBase: "https://qloo.test", qlooKey: "k", library: activeLibrary({}, true), reference: SYNTHETIC_REFERENCE,
    now: () => new Date("2026-10-15T12:00:00.000Z"), qlooDailyCap: 1000, aiDailyCap: 0, qlooDelayMs: 0, discoveryRef: syntheticDiscoveryReference(),
  };
}

async function run(marketId: string, csv: string): Promise<unknown> {
  const m = SAMPLE_MARKETS.find((x) => x.id === marketId)!;
  const market = { label: m.label, lon: m.lon, lat: m.lat };
  const d = deps();
  const a = await analyze(d, { market, rows: parseCalendar(csv).rows });
  const nights = a.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.resolution.kind === "classic" ? null : (n.resolution.kind === "ambiguous" ? null : n.themeId), sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
  const p = await proposeSwaps(d, { market, nights, allowDuplicates: false });
  const p2 = await proposeSwaps(deps(), { market, nights, allowDuplicates: true });
  const strip = <T extends { caps?: unknown }>(x: T): Omit<T, "caps"> => ({ ...x, caps: undefined });
  const summary = {
    bands: a.nights.map((n) => `${n.date} ${n.theme}: ${n.label}`),
    swaps: p.proposals.map((x) => `${x.date} ${x.fromThemeId} > ${x.toThemeId}${x.discovered ? " (discovered)" : ""}${x.kind ? ` (${x.kind})` : ""} | alt ${x.alternates.map((y) => y.toThemeId).join(",")}`),
    angles: p.angles.map((x) => x.text),
    unfixed: p.unfixed.map((x) => `${x.date} ${x.reason}`),
  };
  const full = {
    nights: a.nights.map((n) => [n.date, n.theme, n.themeId, n.label, n.z]), themes: a.themes, analyzeTrace: a.trace.map((t) => t.text),
    propose: strip(p), proposeRepeats: strip(p2),
  };
  return { hash: createHash("sha256").update(JSON.stringify(full)).digest("hex"), summary };
}

// The example now starts at the next season, so the snapshot fixes "today" at the date that gives its original Friday, April 9, 2027.
const EXAMPLE_DAY = "2027-03-22";

async function all(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const id of ["biloxi", "albuquerque", "akron", "portland-me"]) out[id] = await run(id, sampleCsv(id));
  out["example@biloxi"] = await run("biloxi", exampleCsv("baseball", EXAMPLE_DAY));
  out["example@akron"] = await run("akron", exampleCsv("baseball", EXAMPLE_DAY));
  return JSON.parse(JSON.stringify(out)) as Record<string, unknown>;
}

describe("club runs are unchanged", () => {
  it("matches the recorded club snapshot", async () => {
    const now = await all();
    if (process.env.WRITE_CLUB_BASELINE === "1") {
      writeFileSync(FILE, JSON.stringify(now, null, 1) + "\n");
      return;
    }
    expect(now).toEqual(JSON.parse(readFileSync(FILE, "utf8")));
  });
});
