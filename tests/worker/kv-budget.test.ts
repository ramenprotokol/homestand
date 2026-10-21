import { describe, expect, it } from "vitest";
import type { AnalyzeResponse } from "../../src/app/api-types";
import { parseCalendar } from "../../src/app/calendar/csv";
import { syntheticDiscoveryReference } from "../../src/app/discovery";
import { exampleCsv } from "../../src/app/samples";
import { activeLibrary } from "../../src/app/themes/ids";
import type { Deps } from "../../src/worker/agent";
import { memoryLimiter } from "../../src/worker/limits";
import { memoryKv, type KvPort } from "../../src/worker/ports";
import { SYNTHETIC_REFERENCE } from "../../src/worker/reference";
import { route, type RouterDeps } from "../../src/worker/router";
import { signMarket } from "../../src/worker/sign";
import { syntheticQlooFetch } from "../../src/worker/synthetic";

// The free Cloudflare KV plan allows 1,000 writes a day, so one new city has to cost very few. This counts the writes of one
// new-city Check then Fix (live mode with a mocked Qloo, so the usage counters run) and keeps them under a budget.
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
    let qlooCalls = 0;
    const agent: Deps = {
      kv,
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
    console.log(`KV writes: ${kv.puts.length} (${kv.puts.join(", ")}); KV reads: ${kv.gets}; Qloo calls: ${qlooCalls}`);
    console.log(`KV writes: ${kv.puts.length}`);
    expect(kv.puts.length).toBeLessThanOrEqual(withModel ? 9 : 5);
  });
});
