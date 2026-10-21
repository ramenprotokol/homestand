import { describe, expect, it } from "vitest";
import type { AnalyzeResponse } from "../../src/app/api-types";
import { parseCalendar } from "../../src/app/calendar/csv";
import { syntheticDiscoveryReference } from "../../src/app/discovery";
import { exampleCsv } from "../../src/app/samples";
import { activeLibrary } from "../../src/app/themes/ids";
import type { Deps } from "../../src/worker/agent";
import { memoryLimiter } from "../../src/worker/limits";
import { memoryKv, type KvPort } from "../../src/worker/ports";
import { spyCounters } from "./counters";
import { SYNTHETIC_REFERENCE } from "../../src/worker/reference";
import { route, type RouterDeps } from "../../src/worker/router";
import { signMarket } from "../../src/worker/sign";
import { syntheticQlooFetch } from "../../src/worker/synthetic";

// The free plans: KV allows 1,000 writes and 100,000 reads a day; the counter Durable Object allows 100,000 requests and 100,000 rows written a day.
// KV holds only saved results; every counter and gate is in the Durable Object. This counts both for one new-city Check then Fix, and for a visit to a
// sample that is already saved (live mode with a mocked Qloo, so the counters run), and keeps them under a budget.
const SIGNING_KEY = "test-signing-key-0123456789abcdef";
const ORIGIN = "http://127.0.0.1:5173";

function countingKv(): KvPort & { puts: string[]; gets: number } {
  const inner = memoryKv();
  const kv = { puts: [] as string[], gets: 0, get: async (k: string) => (kv.gets++, inner.get(k)), put: async (k: string, v: string, o?: { expirationTtl?: number }) => (kv.puts.push(k), inner.put(k, v, o)) };
  return kv;
}

const post = (path: string, body: unknown): Request => new Request(`https://api.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN } });

const goodWhy = (f: { town: string; planned: string; proposed: string }): string => `People in ${f.town} like ${f.proposed} more than ${f.planned}, compared with their other themes.`;

describe("KV writes for one new city", () => {
  for (const withModel of [false, true]) it(`stays within the budget (${withModel ? "with" : "without"} the model)`, async () => {
    const kv = countingKv();
    const counters = spyCounters();
    let qlooCalls = 0;
    const agent: Deps = {
      kv,
      counters,
      ai: withModel ? { run: async (_m: string, input: unknown) => { const msgs = (input as { messages: Array<{ content: string }> }).messages; return /swap/.test(msgs[0]!.content) ? { response: JSON.stringify((JSON.parse(msgs[1]!.content) as Array<{ id: string; town: string; planned: string; proposed: string }>).map((f) => ({ id: f.id, why: goodWhy(f) }))) } : { response: "{}" }; } } : null,
      mode: "live", qlooFetch: async (i, init) => (qlooCalls++, syntheticQlooFetch(i, init)), qlooBase: "https://qloo.test", qlooKey: "k", library: activeLibrary({}, true), reference: SYNTHETIC_REFERENCE,
      now: () => new Date("2026-11-03T12:00:00.000Z"), qlooDailyCap: 1500, aiDailyCap: 400, qlooDelayMs: 0, discoveryRef: syntheticDiscoveryReference(),
    };
    const deps: RouterDeps = { agent, allowedOrigins: [ORIGIN], geocodeFetch: async () => new Response("{}"), clientId: async () => "judge", limiter: memoryLimiter(1), signingKey: SIGNING_KEY };
    const place = { label: "Fresno, CA", lon: -119.78707, lat: 36.74773 };
    const market = { ...place, sig: await signMarket(SIGNING_KEY, place) };
    const rows = parseCalendar(exampleCsv("baseball", "2026-11-03")).rows;
    const a = await route(post("/api/analyze", { market, rows }), deps);
    expect(a.status).toBe(200);
    const out = (await a.json()) as AnalyzeResponse;
    const nights = out.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    const p = await route(post("/api/propose", { market, nights, allowDuplicates: false }), deps);
    expect(p.status).toBe(200);
    const doCalls = counters.takes.length + counters.marks.length;
    console.log(`new city ${withModel ? "with" : "without"} model: KV writes ${kv.puts.length} (${kv.puts.join(", ")}), KV reads ${kv.gets}; counter steps (Durable Object requests, one row written each) ${doCalls}; Qloo calls ${qlooCalls}`);
    expect(kv.puts.length).toBeLessThanOrEqual(withModel ? 3 : 2); // the saved scores, the saved family titles, and (with the model) the saved wording
    expect(counters.takes.filter((t) => t.key.startsWith("cap:qloo:")).length).toBe(2); // library, then family titles
    expect(doCalls).toBeLessThanOrEqual(withModel ? 7 : 5);
  });
});

describe("a visit to a sample that is already saved", () => {
  it("makes no counter call and no KV write", async () => {
    const kv = countingKv();
    const counters = spyCounters();
    const agent: Deps = {
      kv, counters, ai: null, mode: "live", qlooFetch: syntheticQlooFetch, qlooBase: "https://qloo.test", qlooKey: "k", library: activeLibrary({}, true), reference: SYNTHETIC_REFERENCE,
      now: () => new Date("2026-11-03T12:00:00.000Z"), qlooDailyCap: 1500, aiDailyCap: 400, qlooDelayMs: 0, discoveryRef: syntheticDiscoveryReference(),
    };
    const deps: RouterDeps = { agent, allowedOrigins: [ORIGIN], geocodeFetch: async () => new Response("{}"), clientId: async () => "judge", limiter: memoryLimiter(10), signingKey: SIGNING_KEY };
    const biloxi = { label: "Biloxi, MS sample club", lon: -88.88531, lat: 30.39603 };
    const rows = parseCalendar(exampleCsv("baseball", "2026-11-03")).rows;
    const first = await route(post("/api/analyze", { market: biloxi, rows }), deps);
    expect(first.status).toBe(200);
    const out = (await first.json()) as AnalyzeResponse;
    const nights = out.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    expect((await route(post("/api/propose", { market: biloxi, nights, allowDuplicates: false }), deps)).status).toBe(200);
    const putsBefore = kv.puts.length;
    const takesBefore = counters.takes.length + counters.marks.length;
    const readsBefore = kv.gets;
    for (let i = 0; i < 3; i++) {
      expect((await route(post("/api/analyze", { market: biloxi, rows }), deps)).status).toBe(200);
      expect((await route(post("/api/propose", { market: biloxi, nights, allowDuplicates: false }), deps)).status).toBe(200);
    }
    console.log(`sample visit (3 repeat visits): KV writes ${kv.puts.length - putsBefore}, KV reads ${(kv.gets - readsBefore) / 3} each, counter steps ${counters.takes.length + counters.marks.length - takesBefore}`);
    expect(kv.puts.length - putsBefore).toBe(0);
    expect(counters.takes.length + counters.marks.length - takesBefore).toBe(0);
  });
});
