import { describe, expect, it } from "vitest";
import type { AnalyzeResponse, ApiError, ProposeResponse, RecheckResponse, MemoResponse } from "../../src/app/api-types";
import { parseCalendar } from "../../src/app/calendar/csv";
import { SYNTHETIC_REFERENCE as REFERENCE } from "../../src/app/score";
import { sampleCsv } from "../../src/app/samples";
import { SAMPLE_MARKETS } from "../../src/app/markets";
import { activeLibrary } from "../../src/app/themes/ids";
import type { Deps } from "../../src/worker/agent";
import { memoryKv, type AiPort } from "../../src/worker/ports";
import { route, type RouterDeps } from "../../src/worker/router";
import { syntheticQlooFetch } from "../../src/worker/synthetic";

const KEY = "SECRET-QLOO-KEY-123";
const ORIGIN = "http://127.0.0.1:5173";

interface Harness {
  deps: RouterDeps;
  kv: ReturnType<typeof memoryKv>;
  qlooUrls: URL[];
  aiCalls: unknown[];
}

function harness(over: Partial<Deps> = {}, ai: AiPort | null = null, qloo: typeof fetch = syntheticQlooFetch): Harness {
  const kv = memoryKv();
  const qlooUrls: URL[] = [];
  const aiCalls: unknown[] = [];
  const wrapped: typeof fetch = async (input, init) => {
    qlooUrls.push(new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url));
    return qloo(input, init);
  };
  const agent: Deps = {
    kv, ai: ai ? { run: async (m, i) => (aiCalls.push(i), ai.run(m, i)) } : null,
    // Live mode with synthetic stand-in IDs and a mocked Qloo: exercises the cache, caps and request shape.
    mode: "live", qlooFetch: wrapped, qlooBase: "https://qloo.test", qlooKey: KEY, library: activeLibrary({}, true), reference: REFERENCE,
    now: () => new Date("2026-10-15T12:00:00.000Z"), qlooDailyCap: 400, aiDailyCap: 150, qlooDelayMs: 0, ...over,
  };
  let ip = "a";
  const deps: RouterDeps = { agent, kv, allowedOrigins: [ORIGIN], geocodeFetch: async () => new Response("{}"), clientId: async () => ip };
  Object.defineProperty(deps, "ip", { set: (v: string) => (ip = v) });
  return { deps, kv, qlooUrls, aiCalls };
}

const post = (path: string, body: unknown, origin: string | null = ORIGIN): Request =>
  new Request(`https://api.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(origin ? { origin } : {}) } });

const biloxi = SAMPLE_MARKETS[0]!;
const market = { label: biloxi.label, lon: biloxi.lon, lat: biloxi.lat };
const rows = parseCalendar(sampleCsv("biloxi")).rows;
const analyzeBody = { market, rows };
const akron = SAMPLE_MARKETS[2]!;
const akronBody = { market: { label: akron.label, lon: akron.lon, lat: akron.lat }, rows: parseCalendar(sampleCsv("akron")).rows };

async function analyzeOk(h: Harness, body: unknown = analyzeBody): Promise<AnalyzeResponse> {
  const res = await route(post("/api/analyze", body), h.deps);
  expect(res.status).toBe(200);
  return (await res.json()) as AnalyzeResponse;
}

describe("health and CORS", () => {
  it("reports mode and caps", async () => {
    const h = harness();
    const res = await route(new Request("https://api.test/api/health"), h.deps);
    expect(await res.json()).toMatchObject({ ok: true, mode: "live", caps: { qlooCap: 400, qlooRemaining: 400 } });
  });
  it("allows listed origins only", async () => {
    const h = harness();
    const ok = await route(post("/api/analyze", {}), h.deps);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const bad = await route(post("/api/analyze", analyzeBody, "https://evil.example"), h.deps);
    expect(bad.status).toBe(403);
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    const pre = await route(new Request("https://api.test/api/analyze", { method: "OPTIONS", headers: { origin: ORIGIN } }), h.deps);
    expect(pre.status).toBe(204);
  });
  it("rejects malformed requests", async () => {
    const h = harness();
    expect((await route(post("/api/analyze", { market: { label: "x", lon: 999, lat: 0 }, rows }), h.deps)).status).toBe(400);
    expect((await route(post("/api/analyze", { market, rows: [{ theme: "x" }] }), h.deps)).status).toBe(400);
    expect((await route(new Request("https://api.test/api/analyze", { method: "POST", body: "{nope", headers: { origin: ORIGIN } }), h.deps)).status).toBe(400);
    expect((await route(post("/api/nothing", { market }), h.deps)).status).toBe(404);
  });
});

describe("analyze", () => {
  it("scores the market with one batched call per entity type, in Amendment 4's request shape", async () => {
    const h = harness();
    const out = await analyzeOk(h);
    expect(h.qlooUrls).toHaveLength(5);
    const byType = new Map(h.qlooUrls.map((u) => [u.searchParams.get("filter.type"), u]));
    expect([...byType.keys()].sort()).toEqual(["urn:entity:artist", "urn:entity:book", "urn:entity:brand", "urn:entity:movie", "urn:entity:tv_show"]);
    for (const u of h.qlooUrls) {
      expect(u.pathname).toBe("/v2/insights");
      expect(u.searchParams.get("signal.location")).toBe(`POINT(${biloxi.lon} ${biloxi.lat})`);
      expect(u.searchParams.get("signal.location.radius")).toBe("80000");
      expect((u.searchParams.get("filter.results.entities") ?? "").split(",").length).toBeLessThanOrEqual(50);
    }
    expect(byType.get("urn:entity:movie")!.searchParams.get("filter.release_year.min")).toBe("1900");
    expect(byType.get("urn:entity:artist")!.searchParams.has("filter.release_year.min")).toBe(false);
    expect(out.themes["bluey"]).toMatchObject({ source: "live" });
    expect(out.nights).toHaveLength(rows.length);
    expect(out.trace.some((s) => s.kind === "qloo" && /Live call/.test(s.detail ?? ""))).toBe(true);
  });

  it("sends take when a type has more than 20 IDs", async () => {
    const big = activeLibrary({}, true).filter((t) => t.entities.some((e) => e.type === "movie"));
    const extra = Array.from({ length: 6 }, (_, i) => ({ ...big[0]!, id: `x${i}`, entities: [{ ...big[0]!.entities[0]!, key: `x:${i}`, id: `SYN-x${i}` }] }));
    const h = harness({ library: [...activeLibrary({}, true), ...extra] });
    await analyzeOk(h);
    const movie = h.qlooUrls.find((u) => u.searchParams.get("filter.type") === "urn:entity:movie")!;
    const n = movie.searchParams.get("filter.results.entities")!.split(",").length;
    expect(n).toBeGreaterThan(20);
    expect(movie.searchParams.get("take")).toBe(String(n));
  });

  it("labels nights: classic, ambiguous, unknown, scored; a classic night carries no z", async () => {
    const out = await analyzeOk(harness());
    const by = (t: string) => out.nights.find((n) => n.theme === t)!;
    expect(by("Fireworks Friday")).toMatchObject({ label: "classic", themeId: null, z: null });
    expect(by("Dinosaurs & Superheroes")).toMatchObject({ resolution: { kind: "ambiguous" }, label: "not-scored" });
    expect(by("Dinosaurs & Superheroes").candidates.sort()).toEqual(["dinosaur", "marvel"]);
    expect(by("Hot Sauce Showdown")).toMatchObject({ resolution: { kind: "unknown" }, label: "not-scored" });
    expect(["leans-in", "average", "leans-away"]).toContain(by("Bluey Day").label);
    expect(by("Bluey Day").z).not.toBeNull();
    expect(by("Bluey Day").weekday).toBe("Saturday");
  });

  it("serves the second request from the cache with no Qloo call, labelled with the recorded date", async () => {
    const h = harness();
    await analyzeOk(h);
    h.qlooUrls.length = 0;
    const again = await analyzeOk(h);
    expect(h.qlooUrls).toHaveLength(0);
    expect(again.recordedOn).toBe("2026-10-15");
    expect(again.themes["bluey"]!.source).toBe("cache");
    expect(again.trace.some((s) => /no new Qloo call/.test(s.text))).toBe(true);
  });

  it("applies the fixed-bundle rule: a missing entity makes the theme Not scored", async () => {
    const out = await analyzeOk(harness({}, null, async (input) => {
      const res = await syntheticQlooFetch(input);
      const body = (await res.json()) as { results: { entities: Array<{ entity_id: string }> } };
      body.results.entities = body.results.entities.filter((e) => e.entity_id !== "SYN-country:wallen");
      return new Response(JSON.stringify(body));
    }));
    expect(out.themes["country"]).toMatchObject({ label: "not-scored", score: null });
    expect(out.themes["country"]!.entities.find((e) => e.name === "Morgan Wallen")!.affinity).toBeNull();
    expect(out.themes["bluey"]!.score).not.toBeNull();
  });

  it("stops at the daily cap: cached markets still work, a cold one gets a clear message", async () => {
    const h = harness({ qlooDailyCap: 7 });
    await analyzeOk(h); // uses 5 of 7
    const cold = await route(post("/api/analyze", { market: { label: "Elsewhere", lon: -100, lat: 40 }, rows }), h.deps);
    expect(cold.status).toBe(429);
    expect(((await cold.json()) as ApiError).error).toBe("capped");
    expect(h.qlooUrls).toHaveLength(5);
    expect((await route(post("/api/analyze", analyzeBody), h.deps)).status).toBe(200);
  });

  it("returns 502 when Qloo fails, without leaking details", async () => {
    const h = harness({}, null, async () => new Response("boom", { status: 500 }));
    const res = await route(post("/api/analyze", analyzeBody), h.deps);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("boom");
  });

  it("never puts the Qloo key in a response", async () => {
    const h = harness();
    const res = await route(post("/api/analyze", analyzeBody), h.deps);
    expect(await res.text()).not.toContain(KEY);
  });

  it("rate-limits per caller", async () => {
    const h = harness();
    let last = 200;
    for (let i = 0; i < 13; i++) last = (await route(post("/api/analyze", analyzeBody), h.deps)).status;
    expect(last).toBe(429);
  });

  it("asks the model only about names the table cannot place, in one call, and never forces a choice", async () => {
    const ai: AiPort = { run: async () => ({ response: '{"0": ["bluey"], "1": []}' }) };
    const h = harness({}, ai);
    const r2 = [{ line: 2, date: "2026-04-10", theme: "Blue Heeler Pups Night", sponsor: "", locked: false, notes: "" }, { line: 3, date: "2026-04-11", theme: "Hot Sauce Showdown", sponsor: "", locked: false, notes: "" }, { line: 4, date: "2026-04-12", theme: "Bluey Day", sponsor: "", locked: false, notes: "" }];
    const res = await route(post("/api/analyze", { market, rows: r2 }), h.deps);
    const out = (await res.json()) as AnalyzeResponse;
    expect(h.aiCalls).toHaveLength(1);
    expect(out.nights[0]).toMatchObject({ themeId: "bluey", resolution: { kind: "theme", method: "model" } });
    expect(out.nights[1]).toMatchObject({ themeId: null, resolution: { kind: "unknown" } });
    expect(out.nights[2]!.resolution).toMatchObject({ method: "alias" });
    expect(out.trace.some((s) => s.kind === "model")).toBe(true);
  });

  it("ignores model ids that are not in the library", async () => {
    const h = harness({}, { run: async () => ({ response: '{"0": ["made-up-theme"]}' }) });
    const res = await route(post("/api/analyze", { market, rows: [{ line: 2, date: "2026-04-10", theme: "Mystery Night", sponsor: "", locked: false, notes: "" }] }), h.deps);
    expect(((await res.json()) as AnalyzeResponse).nights[0]!.resolution.kind).toBe("unknown");
  });
});

describe("propose", () => {
  const planFrom = (out: AnalyzeResponse) => out.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));

  async function proposeOk(h: Harness, over: Record<string, unknown> = {}): Promise<{ out: AnalyzeResponse; p: ProposeResponse }> {
    const out = await analyzeOk(h, akronBody);
    const res = await route(post("/api/propose", { market: akronBody.market, nights: planFrom(out), allowDuplicates: false, ...over }), h.deps);
    expect(res.status).toBe(200);
    return { out, p: (await res.json()) as ProposeResponse };
  }

  it("never swaps a locked night, keeps dates and sponsors, never repeats a theme", async () => {
    const { out, p } = await proposeOk(harness());
    expect(p.proposals.length).toBeGreaterThan(0);
    for (const x of p.proposals) {
      const night = out.nights[x.index]!;
      expect(night.locked).toBe(false);
      expect(night.label).toBe("leans-away");
      expect(x.date).toBe(night.date);
      expect(x.sponsor).toBe(night.sponsor);
      expect(x.whySource).toBe("template");
    }
    const targets = p.proposals.map((x) => x.toThemeId);
    expect(new Set(targets).size).toBe(targets.length);
    const onCalendar = new Set(out.nights.map((n) => n.themeId));
    for (const t of targets) expect(onCalendar.has(t)).toBe(false);
    const lockedAway = out.nights.filter((n) => n.locked && n.label === "leans-away");
    expect(p.angles.map((a) => a.index).sort()).toEqual(lockedAway.map((n) => n.index).filter((i) => p.angles.some((a) => a.index === i)).sort());
    for (const a of p.angles) expect(out.nights[a.index]!.locked).toBe(true);
    expect(p.trace.some((s) => s.kind === "constraint")).toBe(true);
  });

  it("uses grounded model text and drops text with unknown numbers or outcome promises", async () => {
    let calls = 0;
    const ai: AiPort = {
      run: async (_m, input) => {
        const msgs = (input as { messages: Array<{ content: string }> }).messages;
        if (!/swap/.test(msgs[0]!.content)) return { response: "{}" };
        calls++;
        const user = JSON.parse(msgs[1]!.content) as Array<{ id: string }>;
        return { response: JSON.stringify(user.map((f, i) => ({ id: f.id, why: i === 0 ? "A clean, grounded reason about local taste." : i === 1 ? "This lifts the park by 87 percent." : "This swap will boost attendance." }))) };
      },
    };
    const h = harness({}, ai);
    const { p } = await proposeOk(h);
    expect(calls).toBe(1);
    expect(p.proposals.length).toBeGreaterThanOrEqual(3);
    expect(p.proposals[0]!.whySource === "model" || p.proposals[1]!.whySource === "model").toBe(true);
    expect(p.proposals.filter((x) => x.whySource === "model")).toHaveLength(1);
    expect(p.proposals.filter((x) => /boost|87/.test(x.why))).toHaveLength(0);
  });

  it("falls back to templates when the model budget is spent", async () => {
    const h = harness({ aiDailyCap: 0 }, { run: async () => ({ response: "[]" }) });
    const { p } = await proposeOk(h);
    expect(h.aiCalls).toHaveLength(0);
    expect(p.proposals.every((x) => x.whySource === "template")).toBe(true);
    expect(p.trace.some((s) => /budget is spent/.test(s.text))).toBe(true);
  });

  it("survives a failing model", async () => {
    const h = harness({}, { run: async () => { throw new Error("model down"); } });
    const { p } = await proposeOk(h);
    expect(p.proposals.length).toBeGreaterThan(0);
  });

  it("allows repeats only when asked", async () => {
    const strict = await proposeOk(harness());
    const loose = await proposeOk(harness(), { allowDuplicates: true });
    const dup = (xs: ProposeResponse) => xs.proposals.length - new Set(xs.proposals.map((x) => x.toThemeId)).size;
    expect(dup(strict.p)).toBe(0);
    expect(dup(loose.p)).toBeGreaterThanOrEqual(0);
    expect(loose.p.proposals.length).toBeGreaterThanOrEqual(strict.p.proposals.length);
  });
});

describe("recheck and memo", () => {
  it("re-checks one theme live, bypassing the cache, and updates it", async () => {
    const h = harness();
    await analyzeOk(h);
    h.qlooUrls.length = 0;
    const res = await route(post("/api/recheck", { market, themeId: "star-wars" }), h.deps);
    const out = (await res.json()) as RecheckResponse;
    expect(h.qlooUrls.length).toBe(2); // movie + tv_show
    expect(out.theme).toMatchObject({ themeId: "star-wars", source: "live", fetchedAt: "2026-10-15T12:00:00.000Z" });
    expect(out.trace.some((s) => /ignoring the recorded result/.test(s.text))).toBe(true);
    for (const u of h.qlooUrls) expect(u.searchParams.get("filter.results.entities")!.split(",").every((id) => id.startsWith("SYN-star-wars"))).toBe(true);
  });
  it("is switched off, with a clear message, once the daily cap is nearly spent", async () => {
    const h = harness({ qlooDailyCap: 6 });
    await analyzeOk(h);
    const res = await route(post("/api/recheck", { market, themeId: "bluey" }), h.deps);
    expect(res.status).toBe(429);
    expect(((await res.json()) as ApiError).message).toContain("switched off");
    const health = (await (await route(new Request("https://api.test/api/health"), h.deps)).json()) as { caps: { recheckDisabled: boolean } };
    expect(health.caps.recheckDisabled).toBe(true);
  });
  it("rejects an unknown theme", async () => {
    expect((await route(post("/api/recheck", { market, themeId: "nope" }), harness().deps)).status).toBe(400);
  });
  it("builds the memo summary from computed facts", async () => {
    const h = harness();
    const out = await analyzeOk(h);
    const away = out.nights.find((n) => n.label === "leans-away" && !n.locked)!;
    const res = await route(post("/api/memo", { market, swaps: [{ date: away.date, fromThemeId: away.themeId, toThemeId: "paw-patrol" }], nights: out.nights.length, classic: 4 }), h.deps);
    const m = (await res.json()) as MemoResponse;
    expect(m.summary).toContain("1 swap was approved");
    expect(m.summarySource).toBe("template");
    expect(m.swaps[0]).toMatchObject({ date: away.date, fromThemeId: away.themeId });
    expect(m.swaps[0]!.toScore).not.toBeNull();
    expect(m.summary).not.toMatch(/attendance (will|to)/i);
  });
});

describe("geocode", () => {
  it("proxies Open-Meteo and keeps populated places", async () => {
    const h = harness();
    h.deps.geocodeFetch = async (u) => {
      expect(String(u)).toContain("geocoding-api.open-meteo.com/v1/search");
      return new Response(JSON.stringify({ results: [{ name: "Tulsa", admin1: "Oklahoma", country_code: "US", latitude: 36.15, longitude: -95.99, feature_code: "PPLA2" }, { name: "Tulsa Airport", latitude: 1, longitude: 2, feature_code: "AIRP" }] }));
    };
    const res = await route(new Request("https://api.test/api/geocode?q=Tulsa", { headers: { origin: ORIGIN } }), h.deps);
    expect(((await res.json()) as { results: unknown[] }).results).toEqual([{ label: "Tulsa, Oklahoma, US", lon: -95.99, lat: 36.15 }]);
    expect((await route(new Request("https://api.test/api/geocode?q=a"), h.deps)).status).toBe(400);
  });
});
