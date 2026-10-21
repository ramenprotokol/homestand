import { describe, expect, it } from "vitest";
import type { ApiError } from "../../src/app/api-types";
import { parseCalendar } from "../../src/app/calendar/csv";
import { syntheticDiscoveryReference } from "../../src/app/discovery";
import { SAMPLE_MARKETS } from "../../src/app/markets";
import { sampleCsv } from "../../src/app/samples";
import { activeLibrary } from "../../src/app/themes/ids";
import { whyShapeOk, type Deps } from "../../src/worker/agent";
import { memoryLimiter, type Limiter } from "../../src/worker/limits";
import { memoryCounters, memoryKv } from "../../src/worker/ports";
import { SYNTHETIC_REFERENCE } from "../../src/worker/reference";
import { route, type RouterDeps } from "../../src/worker/router";
import { signMarket } from "../../src/worker/sign";
import { syntheticQlooFetch } from "../../src/worker/synthetic";
import { spyCounters } from "./counters";

const ORIGIN = "http://127.0.0.1:5173";
const KEY = "test-signing-key-0123456789abcdef";

function harness(over: Partial<RouterDeps> = {}, agentOver: Partial<Deps> = {}) {
  const geocodeCalls: string[] = [];
  const agent: Deps = {
    kv: memoryKv(), ai: null, mode: "live", qlooFetch: syntheticQlooFetch, qlooBase: "https://qloo.test", qlooKey: "k", library: activeLibrary({}, true), reference: SYNTHETIC_REFERENCE,
    now: () => new Date("2026-11-03T12:00:00.000Z"), qlooDailyCap: 1500, aiDailyCap: 400, qlooDelayMs: 0, discoveryRef: syntheticDiscoveryReference(), ...agentOver,
  };
  const deps: RouterDeps = {
    agent, allowedOrigins: [ORIGIN], clientId: async () => "judge", limiter: memoryLimiter(10), signingKey: KEY,
    geocodeFetch: async (input) => {
      geocodeCalls.push(String(input));
      return new Response(JSON.stringify({ results: [{ name: "Tulsa", admin1: "Oklahoma", country_code: "US", latitude: 36.15398, longitude: -95.99278, population: 413066, feature_code: "PPLA2" }] }));
    },
    ...over,
  };
  return { deps, geocodeCalls };
}
const get = (path: string): Request => new Request(`https://api.test${path}`, { headers: { origin: ORIGIN } });
const post = (path: string, body: unknown): Request => new Request(`https://api.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN } });
const fresno = async () => {
  const p = { label: "Fresno, CA", lon: -119.78707, lat: 36.74773 };
  return { ...p, sig: await signMarket(KEY, p) };
};
const biloxi = SAMPLE_MARKETS[0]!;
const rows = parseCalendar(sampleCsv("biloxi")).rows;

describe("the counters are atomic", () => {
  it("never lets two takes pass the same last unit", async () => {
    const c = memoryCounters();
    const results = await Promise.all(Array.from({ length: 10 }, () => c.take("cap:qloo:x", 1, 3, 60)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect((await c.read(["cap:qloo:x"]))[0]).toBe(3);
  });
  it("refuses a take that would pass the cap without using any of it", async () => {
    const c = memoryCounters();
    expect((await c.take("k", 5, 6, 60)).ok).toBe(true);
    expect(await c.take("k", 2, 6, 60)).toEqual({ ok: false, used: 5 });
    expect((await c.take("k", 1, 6, 60)).ok).toBe(true);
  });
  it("lets a marker live only for its time", async () => {
    let t = 0;
    const c = memoryCounters(() => t);
    expect(await c.mark("rc", 10)).toBe(false);
    expect(await c.mark("rc", 10)).toBe(true);
    t = 11_000;
    expect(await c.marked("rc")).toBe(false);
  });
});

describe("health", () => {
  it("is rate limited and says only ok, low or paused", async () => {
    const h = harness({}, { qlooDailyCap: 20 });
    const ok = await route(get("/api/health"), h.deps);
    expect(await ok.json()).toMatchObject({ ok: true, live: "ok" });
    const counters = spyCounters();
    h.deps.agent.counters = counters;
    await counters.take("cap:qloo:2026-11-03", 19, 20, 60);
    // A fresh isolate memory is needed to see the new use; the memo is per counter port, so a new port reads again.
    expect(await (await route(get("/api/health"), h.deps)).json()).toMatchObject({ live: "low" });
    const paused = harness({}, { qlooDailyCap: 20, counters: spyCounters() });
    await paused.deps.agent.counters!.take("cap:qloo:2026-11-03", 20, 20, 60);
    expect(await (await route(get("/api/health"), paused.deps)).json()).toMatchObject({ live: "paused" });
    const limited = harness({ limiter: (async (r) => r !== "health") as Limiter });
    expect((await route(get("/api/health"), limited.deps)).status).toBe(429);
  });
  it("answers from its memory for 45 seconds instead of reading the counters each time", async () => {
    const counters = spyCounters();
    const reads: string[][] = [];
    const real = counters.read;
    counters.read = async (keys) => (reads.push(keys), real(keys));
    const h = harness({}, { counters });
    for (let i = 0; i < 5; i++) await route(get("/api/health"), h.deps);
    expect(reads).toHaveLength(1);
  });
  it("sends the HSTS header on every Worker answer", async () => {
    const res = await route(get("/api/health"), harness().deps);
    expect(res.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
  });
});

describe("the MCP route has its own per-minute limit", () => {
  it("refuses before reading the body", async () => {
    const h = harness({ limiter: (async (r) => r !== "mcp") as Limiter });
    const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    const res = await route(new Request("https://api.test/mcp", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN } }), h.deps);
    expect(res.status).toBe(429);
    expect(((await res.json()) as ApiError).error).toBe("rate-limit");
  });
});

describe("the global per-minute ceiling", () => {
  it("stops a new live city with a friendly message, and does not touch a saved sample", async () => {
    const calls: string[] = [];
    const h = harness({ globalLimit: async (k) => (calls.push(k), false) });
    const res = await route(post("/api/analyze", { market: await fresno(), rows }), h.deps);
    expect(res.status).toBe(429);
    const body = (await res.json()) as ApiError;
    expect(body.error).toBe("busy");
    expect(body.message).toContain("sample calendars");
    expect(calls).toEqual(["pull"]);
    // A sample whose results are not saved yet is a live pull too; once saved, a visit never asks the ceiling.
    const open = harness();
    expect((await route(post("/api/analyze", { market: biloxi, rows }), open.deps)).status).toBe(200);
    const asked: string[] = [];
    open.deps.globalLimit = async (k) => (asked.push(k), false);
    expect((await route(post("/api/analyze", { market: biloxi, rows }), open.deps)).status).toBe(200);
    expect(asked).toEqual([]);
  });
  it("keeps the model quiet (template text) when the model ceiling is hit", async () => {
    const asked: string[] = [];
    const ai = { run: async () => ({ response: "{}" }) };
    const h = harness({ globalLimit: async (k) => (asked.push(k), k !== "model") }, { ai });
    const res = await route(post("/api/analyze", { market: biloxi, rows: [{ date: "2027-04-10", theme: "Zorp Gathering", sponsor: "", locked: false, notes: "" }] }), h.deps);
    expect(res.status).toBe(200);
    expect(asked).toContain("model");
  });
});

describe("city search", () => {
  it("saves a search for a week by its normalised query, and skips the geocoder the second time", async () => {
    const store = new Map<string, { v: string; ttl: number }>();
    const geoCache = { get: async (k: string) => store.get(k)?.v ?? null, put: async (k: string, v: string, ttl: number) => void store.set(k, { v, ttl }) };
    const h = harness({ geoCache });
    const first = (await (await route(get("/api/geocode?q=Tulsa"), h.deps)).json()) as { results: Array<{ label: string; sig: string }> };
    expect(first.results[0]!.label).toBe("Tulsa, OK");
    expect(h.geocodeCalls).toHaveLength(1);
    const second = (await (await route(get("/api/geocode?q=%20%20TULSA%20"), h.deps)).json()) as { results: Array<{ label: string; sig: string }> };
    expect(second.results[0]!.label).toBe("Tulsa, OK");
    expect(second.results[0]!.sig).toBe(first.results[0]!.sig);
    expect(h.geocodeCalls).toHaveLength(1);
    expect([...store.values()][0]!.ttl).toBe(7 * 86400);
    expect([...store.values()][0]!.v).not.toContain("sig");
  });
  it("makes at most three geocoder calls for one search, even for a typo", async () => {
    const h = harness({ geocodeFetch: async (input) => (h2.push(String(input)), new Response(JSON.stringify({ results: [] }))) });
    const h2: string[] = [];
    await route(get("/api/geocode?q=Xqzvbnmwrt"), h.deps);
    expect(h2.length).toBeLessThanOrEqual(3);
    expect(h2.length).toBeGreaterThan(0);
  });
  it("limits searches to 20 a minute per client", async () => {
    const h = harness({ limiter: memoryLimiter(1) });
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) codes.push((await route(get(`/api/geocode?q=Tulsa${"a".repeat(i % 3)}`), h.deps)).status);
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes[20]).toBe(429);
  });
});

describe("a model sentence must not carry markup or a link", () => {
  const ok = "People in Biloxi like Moana more than Elvis, compared with their other themes.";
  it("accepts a plain sentence and rejects angle brackets and addresses", () => {
    expect(whyShapeOk(ok, "Elvis", "Moana", "Biloxi")).toBe(true);
    expect(whyShapeOk(`${ok} <b>Buy</b>`, "Elvis", "Moana", "Biloxi")).toBe(false);
    expect(whyShapeOk(`${ok} See https://example.test`, "Elvis", "Moana", "Biloxi")).toBe(false);
    expect(whyShapeOk(`${ok} Visit www.example.test`, "Elvis", "Moana", "Biloxi")).toBe(false);
  });
});
