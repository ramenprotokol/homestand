import { describe, expect, it } from "vitest";
import { parseCalendar } from "../../src/app/calendar/csv";
import { syntheticDiscoveryReference } from "../../src/app/discovery";
import { SAMPLE_MARKETS } from "../../src/app/markets";
import { sampleCsv } from "../../src/app/samples";
import { activeLibrary } from "../../src/app/themes/ids";
import { analyze, proposeSwaps, type Deps } from "../../src/worker/agent";
import { memoryKv } from "../../src/worker/ports";
import { SYNTHETIC_REFERENCE } from "../../src/worker/reference";
import { syntheticQlooFetch } from "../../src/worker/synthetic";

// Every affinity squeezed into 0.900 to 0.9006 and a reference that sits at 0.9 with a spread of 0.0002: towns still differ in units of that spread (so labels are
// Strong or Weak), but no raw gap can reach 0.01, so every one is only a lean.
const tiny = { ...SYNTHETIC_REFERENCE, themes: Object.fromEntries(Object.entries(SYNTHETIC_REFERENCE.themes).map(([k, v]) => [k, { ...v, mean: 0.9, sd: 0.0002 }])) };
const squeezed: typeof fetch = async (input, init) => {
  const res = await syntheticQlooFetch(input, init);
  const body = (await res.json()) as { results?: { entities?: Array<{ query?: { affinity?: number } }> } };
  for (const e of body.results?.entities ?? []) if (e.query && typeof e.query.affinity === "number") e.query.affinity = 0.9 + (e.query.affinity - 0.42) * 0.001;
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
};
const deps = (reference = SYNTHETIC_REFERENCE, qloo: typeof fetch = syntheticQlooFetch): Deps => ({
  kv: memoryKv(), ai: null, mode: "live", qlooFetch: qloo, qlooBase: "https://qloo.test", qlooKey: "k", library: activeLibrary({}, true), reference,
  now: () => new Date("2026-10-20T12:00:00.000Z"), qlooDailyCap: 1500, aiDailyCap: 0, qlooDelayMs: 0, discoveryRef: syntheticDiscoveryReference(),
});
const m = SAMPLE_MARKETS[0]!;
const market = { label: m.label, lon: m.lon, lat: m.lat };
const rows = parseCalendar(sampleCsv(m.id)).rows;

describe("the Worker marks slight leans", () => {
  it("marks no lean slight when the gaps are large, and every lean slight when they are tiny", async () => {
    const big = await analyze(deps(), { market, rows });
    // Only the two offline themes whose readings barely differ between towns (COMPRESSED_ENTITIES) can be a slight lean in the ordinary data.
    expect(Object.values(big.themes).filter((t) => t.slight).every((t) => t.themeId === "super-mario" || t.themeId === "taylor-swift")).toBe(true);
    const a = await analyze(deps(tiny, squeezed), { market, rows });
    const leaning = Object.values(a.themes).filter((t) => t.label === "leans-in" || t.label === "leans-away");
    expect(leaning.length).toBeGreaterThan(0);
    for (const t of leaning) {
      expect(t.slight).toBe(true);
      expect(Math.abs(t.gap!)).toBeLessThan(0.01);
    }
    for (const t of Object.values(a.themes).filter((x) => x.label === "average")) expect(t.slight).toBeUndefined();
    expect(a.nights.filter((n) => n.label === "leans-away" || n.label === "leans-in").every((n) => n.slight === true)).toBe(true);
    expect(a.trace.some((s) => /only a slight lean/.test(s.text))).toBe(true);
  });
  it("offers swaps for slight Weak nights as optional", async () => {
    const d = deps(tiny, squeezed);
    const a = await analyze(d, { market, rows });
    const nights = a.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.resolution.kind === "classic" || n.resolution.kind === "ambiguous" ? null : n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    const p = await proposeSwaps(d, { market, nights, allowDuplicates: false });
    expect(p.proposals.length).toBeGreaterThan(0);
    expect(p.proposals.every((x) => x.optional === true)).toBe(true);
    expect(p.unfixed).toEqual([]);
  });
});
