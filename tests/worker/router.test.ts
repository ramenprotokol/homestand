import { describe, expect, it } from "vitest";
import type { AnalyzeResponse, ApiError, ProposeResponse, RecheckResponse } from "../../src/app/api-types";
import { parseCalendar } from "../../src/app/calendar/csv";
import { SYNTHETIC_REFERENCE as REFERENCE } from "../../src/app/score";
import { sampleCsv } from "../../src/app/samples";
import { SAMPLE_MARKETS } from "../../src/app/markets";
import { syntheticDiscoveryReference } from "../../src/app/discovery";
import { activeLibrary, COMMITTED_IDS } from "../../src/app/themes/ids";
import type { Deps } from "../../src/worker/agent";
import { memoryKv, type AiPort } from "../../src/worker/ports";
import { memoryLimiter } from "../../src/worker/limits";
import { route, type RouterDeps } from "../../src/worker/router";
import { signMarket } from "../../src/worker/sign";
import { syntheticQlooFetch } from "../../src/worker/synthetic";

const KEY = "SECRET-QLOO-KEY-123";
const SIGNING_KEY = "test-signing-key-0123456789abcdef";
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
    now: () => new Date("2026-10-15T12:00:00.000Z"), qlooDailyCap: 400, aiDailyCap: 150, qlooDelayMs: 0, discoveryRef: syntheticDiscoveryReference(), ...over,
  };
  let ip = "a";
  const deps: RouterDeps = { agent, allowedOrigins: [ORIGIN], geocodeFetch: async () => new Response("{}"), clientId: async () => ip, limiter: memoryLimiter(1, () => agent.now().getTime()), signingKey: SIGNING_KEY };
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
    const elsewhere = { label: "Elsewhere, KS", lon: -100, lat: 40 };
    const cold = await route(post("/api/analyze", { market: { ...elsewhere, sig: await signMarket(SIGNING_KEY, elsewhere) }, rows }), h.deps);
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

  it("name matching has no template text: when the budget is spent those names stay unscored, and the log says so", async () => {
    const h = harness({ aiDailyCap: 0 }, { run: async () => ({ response: "{}" }) });
    const out = await analyzeOk(h, { market, rows: [{ line: 2, date: "2027-04-10", theme: "Mystery Night", sponsor: "", locked: false, notes: "" }] });
    expect(out.trace.some((t) => t.text === "Matching unrecognised theme names: today's shared model budget is spent, so those names stay unscored.")).toBe(true);
    expect(out.nights[0]!.label).toBe("not-scored");
  });

  it("ignores model ids that are not in the library", async () => {
    const h = harness({}, { run: async () => ({ response: '{"0": ["made-up-theme"]}' }) });
    const res = await route(post("/api/analyze", { market, rows: [{ line: 2, date: "2026-04-10", theme: "Mystery Night", sponsor: "", locked: false, notes: "" }] }), h.deps);
    expect(((await res.json()) as AnalyzeResponse).nights[0]!.resolution.kind).toBe("unknown");
  });
});

describe("market-centred labels", () => {
  const library = activeLibrary({}, true);
  const evenRef = { synthetic: false, markets: 40, pulledAt: null, themes: Object.fromEntries(library.map((t) => [t.id, { n: 40, mean: 0.7, sd: 0.1 }])) };
  const flat = (value: (id: string) => number): typeof fetch => async (input) => {
    const ids = (new URL(String(input)).searchParams.get("filter.results.entities") ?? "").split(",");
    return new Response(JSON.stringify({ results: { entities: ids.map((id) => ({ entity_id: id, name: id, query: { affinity: value(id) } })) } }));
  };

  it("a market that is far above typical on every theme is About average on all of them", async () => {
    const out = await analyzeOk(harness({ reference: evenRef }, null, flat(() => 0.95)));
    const scored = Object.values(out.themes).filter((t) => t.z !== null);
    expect(scored.length).toBe(library.length);
    for (const t of scored) {
      expect(t.z).toBeCloseTo(2.5, 6);
      expect(t.marketMeanZ).toBeCloseTo(2.5, 6);
      expect(t.index).toBeCloseTo(0, 6);
      expect(t.label).toBe("average");
    }
  });

  it("one theme that stands out inside a low market is Leans in; the rest are not Leans away", async () => {
    const out = await analyzeOk(harness({ reference: evenRef }, null, flat((id) => (id === "SYN-bluey:tv" ? 0.75 : 0.5))));
    expect(out.themes["bluey"]!.label).toBe("leans-in");
    expect(out.themes["bluey"]!.z).toBeCloseTo(0.5, 6); // still above typical in plain z
    expect(out.themes["bluey"]!.marketMeanZ!).toBeLessThan(-1.8);
    for (const [id, t] of Object.entries(out.themes)) if (id !== "bluey") expect(t.label).toBe("average");
  });

  it("leaves not-scored themes out of the market average", async () => {
    const out = await analyzeOk(harness({ reference: evenRef }, null, async (input) => {
      const res = await flat(() => 0.9)(input);
      const body = (await res.json()) as { results: { entities: Array<{ entity_id: string }> } };
      body.results.entities = body.results.entities.filter((e) => e.entity_id !== "SYN-bluey:tv");
      return new Response(JSON.stringify(body));
    }));
    expect(out.themes["bluey"]).toMatchObject({ label: "not-scored", index: null });
    expect(out.themes["star-wars"]!.scoredThemes).toBe(library.length - 1);
  });

  it("a re-check recomputes every index, since the market's own average moves", async () => {
    let level = 0.5;
    const h = harness({ reference: evenRef }, null, async (input) => flat((id) => (id === "SYN-bluey:tv" ? 0.5 : level))(input));
    const before = await analyzeOk(h);
    level = 0.9;
    const res = await route(post("/api/recheck", { market, themeId: "star-wars" }), h.deps);
    const out = (await res.json()) as RecheckResponse;
    expect(Object.keys(out.themes).length).toBe(Object.keys(before.themes).length);
    expect(out.themes["star-wars"]!.index).not.toBeCloseTo(before.themes["star-wars"]!.index!, 3);
    expect(out.themes["star-wars"]).toMatchObject({ source: "live" });
  });
});

describe("recognised names with no live Qloo id", () => {
  it("says it recognises PAW Patrol but has no scores, and keeps that apart from unknown text", async () => {
    const live = activeLibrary(COMMITTED_IDS, false);
    expect(live.some((t) => t.id === "paw-patrol")).toBe(false);
    const h = harness({ library: live });
    const rows = [
      { date: "2026-05-02", theme: "PAW Patrol Day", sponsor: "", locked: false, notes: "" },
      { date: "2026-05-09", theme: "Rubber Duck Regatta", sponsor: "", locked: false, notes: "" },
      { date: "2026-05-16", theme: "Star Wars Night", sponsor: "", locked: false, notes: "" },
    ];
    const out = await analyzeOk(h, { market, rows });
    expect(out.nights[0]).toMatchObject({ themeId: null, label: "not-scored", recognisedAs: "PAW Patrol" });
    expect(out.nights[1]).toMatchObject({ themeId: null, label: "not-scored", recognisedAs: null });
    expect(out.nights[2]!.recognisedAs).toBeNull();
    expect(out.trace.some((t) => t.text.includes('"PAW Patrol Day" is a theme we recognise (PAW Patrol), but we have no Qloo scores for it yet, so it is left alone.'))).toBe(true);
    expect(out.trace.some((t) => t.text.includes('"Rubber Duck Regatta" is not a theme we can place'))).toBe(true);
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
        const user = JSON.parse(msgs[1]!.content) as Array<{ id: string; town: string; planned: string; proposed: string }>;
        return { response: JSON.stringify(user.map((f, i) => ({ id: f.id, why: i === 0 ? `People in ${f.town} like ${f.proposed} more than ${f.planned}, compared with their other themes.` : i === 1 ? "This lifts the park by 87 percent." : "This swap will boost attendance." }))) };
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

  const aiWith = (why: (i: number, f: { town: string; planned: string; proposed: string }) => string): AiPort => ({
    run: async (_m, input) => {
      const msgs = (input as { messages: Array<{ content: string }> }).messages;
      if (!/swap/.test(msgs[0]!.content)) return { response: "{}" };
      const user = JSON.parse(msgs[1]!.content) as Array<{ id: string; town: string; planned: string; proposed: string }>;
      return { choices: [{ message: { content: JSON.stringify(user.map((f, i) => ({ id: f.id, why: why(i, f) }))) } }] };
    },
  });

  it("rejects a model reason that talks about the sponsor, and adds the fixed sentence to a good one", async () => {
    const bad = "Star Trek fits the market better than Margaritaville, but the sponsor does not stay for that night.";
    const { p } = await proposeOk(harness({}, aiWith((i, f) => (i === 0 ? bad : `People in ${f.town} like ${f.proposed} more than ${f.planned}, compared with their other themes.`))));
    const library = p.proposals.filter((x) => !x.discovered);
    expect(library.some((x) => /sponsor does not stay/.test(x.why))).toBe(false);
    expect(library[0]!.whySource).toBe("template");
    expect(p.trace.some((s) => /went beyond the taste comparison/.test(s.text))).toBe(true);
    const good = library.find((x) => x.whySource === "model")!;
    expect(good.why).toMatch(/ The date (and sponsor )?(stay|stays) the same\.$/);
    for (const x of library) expect(x.why).not.toMatch(/does not stay|tickets|attendance|revenue/i);
  });

  it("rejects model reasons that say 'prefer' or overclaim, and keeps the plain like-more-than wording", async () => {
    const { p } = await proposeOk(harness({}, aiWith((i, f) => (i === 0 ? "People prefer Pro wrestling over Star Wars." : i === 1 ? "Fans here favour this one, and it is the best pick." : `People in ${f.town} like ${f.proposed} more than ${f.planned}, compared with their other themes.`))));
    const library = p.proposals.filter((x) => !x.discovered);
    expect(library.some((x) => /prefer|favou?r|best/i.test(x.why))).toBe(false);
    expect(library.filter((x) => x.whySource === "model").every((x) => /like .+ more than .+, compared with their other themes/.test(x.why))).toBe(true);
    expect(p.trace.filter((s) => /went beyond the taste comparison/.test(s.text)).length).toBeGreaterThanOrEqual(2);
  });

  it("asks the model for short reasons: a small token budget and no sponsor or date facts", async () => {
    const seen: Array<{ max_tokens: number; user: string }> = [];
    const ai: AiPort = { run: async (_m, input) => { const i = input as { max_tokens: number; messages: Array<{ content: string }> }; if (/swap/.test(i.messages[0]!.content)) seen.push({ max_tokens: i.max_tokens, user: i.messages[1]!.content }); return {}; } };
    await proposeOk(harness({}, ai));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.max_tokens).toBeLessThanOrEqual(300);
    expect(seen[0]!.user).not.toMatch(/sponsor|date|20\d\d/i);
  });

  describe("discovery", () => {
    // The synthetic pool has mean 0.7 and sd 0.1 for every title, so a reading of 0.9 is z = 2 and 0.76 is z = 0.6.
    const poolFetch = (read: (id: string, type: string) => number, young?: Array<{ entity_id: string; name: string }>): typeof fetch => async (input, init) => {
      const u = new URL(String(input));
      if (u.searchParams.has("filter.tags")) return new Response(JSON.stringify({ results: { entities: young ?? [] } }));
      const ids = (u.searchParams.get("filter.results.entities") ?? "").split(",");
      if (ids[0]?.startsWith("SYN-D-")) return new Response(JSON.stringify({ results: { entities: ids.map((id) => ({ entity_id: id, name: id, query: { affinity: read(id, u.searchParams.get("filter.type") ?? "") } })) } }));
      return syntheticQlooFetch(input, init);
    };

    it("scores the fixed pool at the market in two calls, ranks by z, caches, and never breaks Fix when Qloo fails", async () => {
      const h = harness({}, null, poolFetch((id) => (id === "SYN-D-movie-3" ? 0.9 : id === "SYN-D-movie-1" ? 0.76 : id === "SYN-D-tv_show-2" ? 0.85 : 0.7)));
      const { p } = await proposeOk(h);
      const poolCalls = h.qlooUrls.filter((u) => (u.searchParams.get("filter.results.entities") ?? "").startsWith("SYN-D-"));
      expect(poolCalls).toHaveLength(2);
      for (const u of poolCalls) {
        expect(u.searchParams.get("signal.location")).toMatch(/^POINT\(/);
        expect(u.searchParams.get("filter.results.entities")!.split(",").every((id) => id.startsWith("SYN-D-"))).toBe(true);
        expect(u.searchParams.has("filter.tags")).toBe(false); // the pool is fixed, so no tags are needed
      }
      // The under-25 call is gone: nothing asks for a demographic.
      expect(h.qlooUrls.filter((u) => u.searchParams.has("filter.tags") || u.searchParams.has("signal.demographics.age"))).toHaveLength(0);
      expect(p.discovery!.movies[0]).toMatchObject({ entityId: "SYN-D-movie-3", z: expect.closeTo(1.795, 5) });
      expect(p.discovery!.movies[1]!.z).toBeCloseTo(0.395, 5); // 0.6 against the 40 markets, less this market's own pool average (0.205)
      expect(p.discovery!.shows[0]).toMatchObject({ entityId: "SYN-D-tv_show-2" });
      expect(p.discovery).not.toHaveProperty("young");
      expect(p.discovery!.scored).toBe(20);
      expect(p.discovery!.poolSize).toBe(20);
      expect(p.trace.some((s) => /Asked Qloo about \d+ family-friendly animated movies near Akron/.test(s.text) && /Qloo had local data for 10 of 10/.test(s.detail ?? ""))).toBe(true);
      h.qlooUrls.length = 0;
      const again = await proposeOk(h);
      expect(h.qlooUrls.filter((u) => (u.searchParams.get("filter.results.entities") ?? "").startsWith("SYN-D-"))).toHaveLength(0);
      expect(again.p.trace.some((s) => /saved family-title scores/.test(s.text))).toBe(true);

      const broken = harness({}, null, async (input, init) => ((new URL(String(input)).searchParams.get("filter.results.entities") ?? "").startsWith("SYN-D-") ? new Response("no", { status: 400 }) : syntheticQlooFetch(input, init)));
      const res = await proposeOk(broken);
      expect(res.p.discovery).toBeNull();
      expect(res.p.proposals.length).toBeGreaterThan(0);
    });

    it("lists ideas from popularity 0.90 up but offers a swap only from 0.97, and leaves out less known titles", async () => {
      const ref = syntheticDiscoveryReference();
      const pops: Record<string, number> = { "SYN-D-movie-0": 0.99, "SYN-D-movie-1": 0.93, "SYN-D-movie-2": 0.85 };
      ref.pool = ref.pool.map((p) => ({ ...p, popularity: pops[p.entityId] ?? 0.99 }));
      const h = harness({ discoveryRef: ref }, null, poolFetch((id) => (id.startsWith("SYN-D-movie-") && Number(id.slice(12)) <= 2 ? 0.9 : 0.7)));
      const { p } = await proposeOk(h);
      const names = p.discovery!.movies.map((m) => m.entityId);
      expect(names).toContain("SYN-D-movie-0");
      expect(names).toContain("SYN-D-movie-1"); // 0.93: fine as an idea
      expect(names).not.toContain("SYN-D-movie-2"); // 0.85: not well known enough even to list
      const offered = p.proposals.flatMap((x) => (x.discovered ? [x.discovered.entityId] : []));
      expect(offered).not.toContain("SYN-D-movie-1"); // 0.93 is below the 0.97 a swap needs
      expect(offered).not.toContain("SYN-D-movie-2");
    });

    it("offers a discovered title only when it stands out here, to a kids or family night the library cannot fix, with the date and sponsor kept", async () => {
      // Every library theme is average except the planned kids night, so nothing in the library can replace it.
      const lib = activeLibrary({}, true);
      const flatRef = { synthetic: false, markets: 40, pulledAt: null, themes: Object.fromEntries(lib.map((t) => [t.id, { n: 40, mean: 0.7, sd: 0.1 }])) };
      const fetchWith = (read: (id: string) => number): typeof fetch => async (input, init) => {
        const u = new URL(String(input));
        const ids = (u.searchParams.get("filter.results.entities") ?? "").split(",");
        if (u.searchParams.has("filter.tags") || ids[0]?.startsWith("SYN-D-")) return poolFetch(read)(input, init);
        return new Response(JSON.stringify({ results: { entities: ids.map((id) => ({ entity_id: id, name: id, query: { affinity: id === "SYN-bluey:tv" ? 0.3 : 0.7 } })) } }));
      };
      const body = { market: akronBody.market, rows: [1, 2, 3, 4, 5, 6].map((n) => ({ date: `2027-05-${String(n + 10).padStart(2, "0")}`, theme: n === 1 ? "Bluey Day" : n === 2 ? "Elvis Night" : n === 3 ? "Beatles Night" : n === 4 ? "Star Wars Night" : n === 5 ? "Princess Day" : "Fireworks Friday", sponsor: n === 1 ? "Sunrise Dental" : "", locked: false, notes: "" })) };
      const run = async (read: (id: string) => number): Promise<{ p: ProposeResponse; index: number; date: string }> => {
        const h = harness({ reference: flatRef }, null, fetchWith(read));
        const a = (await (await route(post("/api/analyze", body), h.deps)).json()) as AnalyzeResponse;
        const night = a.nights.find((n) => n.themeId === "bluey")!;
        expect(night.label).toBe("leans-away");
        const res = await route(post("/api/propose", { market: body.market, nights: planFrom(a), allowDuplicates: false }), h.deps);
        return { p: (await res.json()) as ProposeResponse, index: night.index, date: night.date };
      };
      // No title stands out: the night is not handed a discovered title. (A library theme at the town's usual can still be its best option.)
      const quiet = await run(() => 0.6);
      const q = quiet.p.proposals.find((x) => x.index === quiet.index);
      expect(q?.discovered).toBeUndefined();
      expect(q?.kind).toBe("best-option");
      // One title stands out (z = 2): it is offered, and the one at z = 0.4 is not.
      const loud = await run((id) => (id === "SYN-D-movie-4" ? 0.9 : id === "SYN-D-movie-5" ? 0.74 : 0.7));
      const x = loud.p.proposals.find((q) => q.index === loud.index)!;
      expect(x.discovered).toMatchObject({ type: "movie", entityId: "SYN-D-movie-4" });
      expect(x.toThemeId).toBe("qloo:SYN-D-movie-4");
      expect(x.to).toEqual({ label: "found", z: null, score: null });
      expect(x.date).toBe(loud.date);
      expect(x.sponsor).toBe("Sunrise Dental");
      expect(x.why).toBe(`People in Akron like ${x.discovered!.name} more than people in most towns do.`);
      expect(loud.p.unfixed.find((q) => q.index === loud.index)).toBeUndefined();
    });
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

describe("recheck", () => {
  it("re-checks one theme live, bypassing the cache, and updates it", async () => {
    const h = harness();
    await analyzeOk(h);
    h.qlooUrls.length = 0;
    const res = await route(post("/api/recheck", { market, themeId: "star-wars" }), h.deps);
    const out = (await res.json()) as RecheckResponse;
    expect(h.qlooUrls.length).toBe(2); // movie + tv_show
    expect(out.theme).toMatchObject({ themeId: "star-wars", source: "live", fetchedAt: "2026-10-15T12:00:00.000Z" });
    expect(out.trace.some((s) => /ignoring the saved result/.test(s.text))).toBe(true);
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
});

describe("geocode", () => {
  it("proxies Open-Meteo and keeps populated places", async () => {
    const h = harness();
    h.deps.geocodeFetch = async (u) => {
      expect(String(u)).toContain("geocoding-api.open-meteo.com/v1/search");
      return new Response(JSON.stringify({ results: [{ name: "Tulsa", admin1: "Oklahoma", country_code: "US", latitude: 36.15, longitude: -95.99, feature_code: "PPLA2" }, { name: "Tulsa Airport", latitude: 1, longitude: 2, feature_code: "AIRP" }] }));
    };
    const res = await route(new Request("https://api.test/api/geocode?q=Tulsa", { headers: { origin: ORIGIN } }), h.deps);
    expect(((await res.json()) as { results: unknown[] }).results).toEqual([{ label: "Tulsa, OK", lon: -95.99, lat: 36.15, sig: await signMarket(SIGNING_KEY, { label: "Tulsa, OK", lon: -95.99, lat: 36.15 }) }]);
    expect((await route(new Request("https://api.test/api/geocode?q=a"), h.deps)).status).toBe(400);
  });

  const geo = (h: Harness): Promise<Response> => route(new Request("https://api.test/api/geocode?q=Tulsa", { headers: { origin: ORIGIN } }), h.deps);
  const okBody = JSON.stringify({ results: [{ name: "Tulsa", admin1: "Oklahoma", country_code: "US", latitude: 36.15, longitude: -95.99, feature_code: "PPLA2" }] });

  it("keeps only the US and Canada, writes labels like Tulsa, OK, and drops duplicates", async () => {
    const h = harness();
    const r = (name: string, admin1: string, cc: string, lat: number) => ({ name, admin1, country_code: cc, latitude: lat, longitude: -90, feature_code: "PPL" });
    h.deps.geocodeFetch = async () => new Response(JSON.stringify({ results: [r("Tulsa", "Oklahoma", "US", 36.1), r("Tulsa", "Gujarat", "IN", 21.5), r("Tulsa", "Oklahoma", "US", 36.2), r("Calgary", "Alberta", "CA", 51), r("Tulsa", "Punjab", "PK", 33)] }));
    const res = await geo(h);
    expect(((await res.json()) as { results: Array<{ label: string }> }).results.map((x) => x.label)).toEqual(["Tulsa, OK", "Calgary, AB"]);
  });

  it("calls geocodeFetch without the deps object as this (Workers throw Illegal invocation otherwise)", async () => {
    const h = harness();
    h.deps.geocodeFetch = function (this: unknown): Promise<Response> {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(okBody));
    } as typeof fetch;
    const res = await geo(h);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { results: unknown[] }).results).toHaveLength(1);
  });

  it("retries once on a network error or a 5xx, then gives up with a 502", async () => {
    const h = harness();
    let calls = 0;
    h.deps.geocodeFetch = async () => {
      calls++;
      if (calls === 1) throw new TypeError("network");
      return new Response(okBody);
    };
    expect((await geo(h)).status).toBe(200);
    expect(calls).toBe(2);

    const h2 = harness();
    let calls2 = 0;
    h2.deps.geocodeFetch = async () => {
      calls2++;
      return new Response("down", { status: 503 });
    };
    expect((await geo(h2)).status).toBe(502);
    expect(calls2).toBe(2);

    const h3 = harness();
    let calls3 = 0;
    h3.deps.geocodeFetch = async () => {
      calls3++;
      return new Response("nope", { status: 404 });
    };
    expect((await geo(h3)).status).toBe(502);
    expect(calls3).toBe(1);
  });
});

// ---------- security ----------

const signed = async (m: { label: string; lon: number; lat: number }) => ({ ...m, sig: await signMarket(SIGNING_KEY, m) });
const analyzeWith = (h: Harness, m: unknown) => route(post("/api/analyze", { market: m, rows }), h.deps);

describe("markets must come from the search", () => {
  it("accepts a searched place, rejects a tampered or unsigned one, and lets the sample clubs through without a signature", async () => {
    const h = harness();
    const tulsa = await signed({ label: "Tulsa, OK", lon: -95.99, lat: 36.15 });
    expect((await analyzeWith(h, tulsa)).status).toBe(200);
    for (const bad of [{ ...tulsa, lon: tulsa.lon + 0.001 }, { ...tulsa, label: "Tulsa, KS" }, { ...tulsa, sig: "0".repeat(64) }, { label: tulsa.label, lon: tulsa.lon, lat: tulsa.lat }]) {
      const res = await analyzeWith(h, bad);
      expect(res.status).toBe(400);
      expect(((await res.json()) as ApiError).error).toBe("bad-market");
    }
    expect((await analyzeWith(h, market)).status).toBe(200);
    // propose and recheck are guarded the same way
    expect((await route(post("/api/propose", { market: { ...tulsa, lat: 0 }, nights: [{ index: 0, date: "2026-05-01", themeId: null, sponsor: "", locked: false, notes: "" }], allowDuplicates: false }), h.deps)).status).toBe(400);
    expect((await route(post("/api/recheck", { market: { ...tulsa, lat: 0 }, themeId: "bluey" }), h.deps)).status).toBe(400);
  });

  it("fails closed for searched places when the signing key is missing, but still serves the sample clubs", async () => {
    const h = harness();
    h.deps.signingKey = null;
    const tulsa = await signed({ label: "Tulsa, OK", lon: -95.99, lat: 36.15 });
    expect((await analyzeWith(h, tulsa)).status).toBe(400);
    expect((await analyzeWith(h, market)).status).toBe(200);
  });

  it("signs every geocode hit, and the signature verifies", async () => {
    const h = harness();
    h.deps.agent.mode = "synthetic";
    const res = await route(new Request("https://api.test/api/geocode?q=Tulsa", { headers: { origin: ORIGIN } }), h.deps);
    const hit = ((await res.json()) as { results: Array<{ label: string; lon: number; lat: number; sig: string }> }).results[0]!;
    expect(hit.sig).toMatch(/^[0-9a-f]{64}$/);
    h.deps.agent.mode = "live";
    expect((await analyzeWith(h, hit)).status).toBe(200);
  });

  it("strips control characters from the label", async () => {
    const h = harness();
    const m = { label: "Tul\u0000sa\r\nOK", lon: -95.99, lat: 36.15 };
    const clean = { label: "TulsaOK", lon: m.lon, lat: m.lat };
    const res = await analyzeWith(h, { ...m, sig: await signMarket(SIGNING_KEY, clean) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as AnalyzeResponse).market.label).toBe("TulsaOK");
  });
});

describe("per-client daily quotas", () => {
  const city = (i: number) => signed({ label: `City ${i}, KS`, lon: -100 + i * 0.5, lat: 38 });

  it("allows 6 new-city pulls a day per client, never counts sample clubs or cached cities, and is per client", async () => {
    const h = harness();
    for (let i = 0; i < 6; i++) expect((await analyzeWith(h, await city(i))).status).toBe(200);
    const seventh = await analyzeWith(h, await city(6));
    expect(seventh.status).toBe(429);
    const body = (await seventh.json()) as ApiError;
    expect(body.error).toBe("quota");
    expect(body.message).toContain("sample clubs still work");
    // sample clubs and a city already pulled are still fine
    expect((await analyzeWith(h, market)).status).toBe(200);
    expect((await analyzeWith(h, await city(0))).status).toBe(200);
    // another client has its own allowance
    (h.deps as unknown as { ip: string }).ip = "b";
    expect((await analyzeWith(h, await city(6))).status).toBe(200);
  });

  it("allows 10 live re-checks a day per client", async () => {
    const h = harness();
    h.deps.limiter = memoryLimiter(10, () => h.deps.agent.now().getTime()); // the per-minute limit is a separate guard
    const ids = activeLibrary({}, true).map((t) => t.id).slice(0, 11);
    await analyzeOk(h);
    const statuses: number[] = [];
    for (const themeId of ids) statuses.push((await route(post("/api/recheck", { market, themeId }), h.deps)).status);
    expect(statuses.slice(0, 10).every((x) => x === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("model answers are cached", () => {
  const names = (...t: string[]) => t.map((theme, i) => ({ line: i + 2, date: `2026-04-${10 + i}`, theme, sponsor: "", locked: false, notes: "" }));

  it("a repeat of the same unknown names costs no model call, whatever their order", async () => {
    const ai: AiPort = { run: async () => ({ response: '{"0": [], "1": []}' }) };
    const h = harness({}, ai);
    await route(post("/api/analyze", { market, rows: names("Blue Heeler Pups Night", "Mystery Night") }), h.deps);
    expect(h.aiCalls).toHaveLength(1);
    await route(post("/api/analyze", { market, rows: names("mystery  night", "Blue Heeler Pups Night") }), h.deps);
    expect(h.aiCalls).toHaveLength(1);
    await route(post("/api/analyze", { market, rows: names("Another Mystery") }), h.deps);
    expect(h.aiCalls).toHaveLength(2);
  });

  it("the same swaps ask the model for reasons once, and keep the answer for that town", async () => {
    const ai: AiPort = {
      run: async (_m, input) => {
        const msgs = (input as { messages: Array<{ content: string }> }).messages;
        if (!/swap/.test(msgs[0]!.content)) return { response: "{}" };
        const user = JSON.parse(msgs[1]!.content) as Array<{ id: string; town: string; planned: string; proposed: string }>;
        return { response: JSON.stringify(user.map((f) => ({ id: f.id, why: `People in ${f.town} like ${f.proposed} more than ${f.planned}, compared with their other themes.` }))) };
      },
    };
    const h = harness({}, ai);
    const out = await analyzeOk(h, akronBody);
    const plan = out.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    const swapCalls = () => h.aiCalls.filter((c) => /swap/.test((c as { messages: Array<{ content: string }> }).messages[0]!.content)).length;
    const first = (await (await route(post("/api/propose", { market: akronBody.market, nights: plan, allowDuplicates: false }), h.deps)).json()) as ProposeResponse;
    expect(swapCalls()).toBe(1);
    expect(first.proposals.some((p) => p.whySource === "model")).toBe(true);
    const second = (await (await route(post("/api/propose", { market: akronBody.market, nights: plan, allowDuplicates: false }), h.deps)).json()) as ProposeResponse;
    expect(swapCalls()).toBe(1);
    expect(second.proposals.map((p) => p.why)).toEqual(first.proposals.map((p) => p.why));
    expect(second.trace.some((t) => /used saved model wording for \d+ of \d+ \(no model call\)/.test(t.text))).toBe(true);
  });
});

describe("saved reasons are only ever real model wording", () => {
  const planFor = (out: AnalyzeResponse) => out.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
  const GOOD = (proposed: string, planned: string, town = "Akron"): string => `People in ${town} like ${proposed} more than ${planned}, compared with their other themes.`;
  const swapCalls = (h: Harness) => h.aiCalls.filter((c) => /swap/.test((c as { messages: Array<{ content: string }> }).messages[0]!.content)) as Array<{ messages: Array<{ content: string }> }>;
  const factsOf = (c: { messages: Array<{ content: string }> }) => JSON.parse(c.messages[1]!.content) as Array<{ id: string; planned: string; proposed: string }>;
  const goodAi: AiPort = {
    run: async (_m, input) => {
      const msgs = (input as { messages: Array<{ content: string }> }).messages;
      if (!/swap/.test(msgs[0]!.content)) return { response: "{}" };
      return { response: JSON.stringify((JSON.parse(msgs[1]!.content) as Array<{ id: string; town: string; planned: string; proposed: string }>).map((f) => ({ id: f.id, why: GOOD(f.proposed, f.planned, f.town) }))) };
    },
  };
  const whyKeys = (h: Harness) => [...h.kv.data.keys()].filter((k) => k.startsWith("ai:why:"));

  it("never saves template text, a failure or a rejected reply, so the next visit asks the model again", async () => {
    for (const reply of [{}, { response: "not json at all" }, { response: JSON.stringify([{ id: "1", why: "But the sponsor does not stay." }]) }]) {
      const h = harness({}, { run: async (_m, input) => ((input as { messages: Array<{ content: string }> }).messages[0]!.content.includes("swap") ? reply : { response: "{}" }) });
      const out = await analyzeOk(h, akronBody);
      const first = (await (await route(post("/api/propose", { market: akronBody.market, nights: planFor(out), allowDuplicates: false }), h.deps)).json()) as ProposeResponse;
      expect(first.proposals.filter((x) => !x.discovered && !x.kind).every((x) => x.whySource === "template")).toBe(true);
      expect(whyKeys(h)).toEqual([]);
      expect(first.trace.some((t) => /Template text is used for \d+ swaps?: the model gave no usable wording/.test(t.text))).toBe(true);
      expect(first.trace.some((t) => /used saved model wording/.test(t.text))).toBe(false);
      await route(post("/api/propose", { market: akronBody.market, nights: planFor(out), allowDuplicates: false }), h.deps);
      expect(swapCalls(h)).toHaveLength(2); // asked again, not served a stored template
    }
  });

  it("saves each validated pair on its own, and a partial hit asks the model only for the missing pairs", async () => {
    const h = harness({}, goodAi);
    const out = await analyzeOk(h, akronBody);
    const body = { market: akronBody.market, nights: planFor(out), allowDuplicates: false };
    const first = (await (await route(post("/api/propose", body), h.deps)).json()) as ProposeResponse;
    const modelPairs = first.proposals.filter((x) => x.whySource === "model").length;
    expect(modelPairs).toBeGreaterThanOrEqual(3);
    expect(whyKeys(h)).toHaveLength(modelPairs);
    expect(first.trace.some((t) => /used saved model wording/.test(t.text))).toBe(false);
    const askedFirst = factsOf(swapCalls(h)[0]!);
    expect(askedFirst).toHaveLength(modelPairs);
    // Forget one pair: only that one is asked about, the rest come from the saved wording.
    h.kv.data.delete(whyKeys(h)[0]!);
    const second = (await (await route(post("/api/propose", body), h.deps)).json()) as ProposeResponse;
    expect(swapCalls(h)).toHaveLength(2);
    expect(factsOf(swapCalls(h)[1]!)).toHaveLength(1);
    expect(second.trace.some((t) => new RegExp(`used saved model wording for ${modelPairs - 1} of ${modelPairs}, so the model is asked only for the other 1`).test(t.text))).toBe(true);
    // Every reason is still real model wording, and the third visit is free.
    expect(second.proposals.filter((x) => !x.discovered && !x.kind).every((x) => x.whySource === "model" && /like .+ more than/.test(x.why))).toBe(true);
    await route(post("/api/propose", body), h.deps);
    expect(swapCalls(h)).toHaveLength(2);
  });
});

describe("recheck once a day per market and theme", () => {
  it("returns the saved answer within a day, with no Qloo call, and writes the marker with a 24 hour life", async () => {
    const h = harness();
    await analyzeOk(h);
    const puts: Array<[string, number | undefined]> = [];
    const put = h.deps.agent.kv.put.bind(h.deps.agent.kv);
    h.deps.agent.kv.put = async (k, v, o) => (puts.push([k, o?.expirationTtl]), put(k, v, o));
    h.qlooUrls.length = 0;
    const first = (await (await route(post("/api/recheck", { market, themeId: "bluey" }), h.deps)).json()) as RecheckResponse;
    expect(first.withinDay).toBeUndefined();
    expect(h.qlooUrls.length).toBeGreaterThan(0);
    expect(puts.find(([k]) => k.startsWith("rc:v1:"))![1]).toBe(86400);
    h.qlooUrls.length = 0;
    const again = (await (await route(post("/api/recheck", { market, themeId: "bluey" }), h.deps)).json()) as RecheckResponse;
    expect(again.withinDay).toBe(true);
    expect(h.qlooUrls).toHaveLength(0);
    expect(again.trace.some((t) => /within the last day/.test(t.text))).toBe(true);
    // a different theme is a separate re-check
    expect(((await (await route(post("/api/recheck", { market, themeId: "star-wars" }), h.deps)).json()) as RecheckResponse).withinDay).toBeUndefined();
  });
});

describe("closed doors", () => {
  it("has no memo route", async () => {
    const h = harness();
    const res = await route(post("/api/memo", { market, swaps: [], nights: 1, classic: 0 }), h.deps);
    expect(res.status).toBe(404);
  });

  it("rejects an oversized body early, by declared length and by streaming, without reading it all", async () => {
    const h = harness();
    const declared = new Request("https://api.test/api/analyze", { method: "POST", body: "{}", headers: { origin: ORIGIN, "content-type": "application/json", "content-length": "5000000" } });
    expect((await route(declared, h.deps)).status).toBe(413);
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(100_000));
      },
      cancel() {
        cancelled = true;
      },
    });
    const chunked = new Request("https://api.test/api/analyze", { method: "POST", body: stream, headers: { origin: ORIGIN, "content-type": "application/json" }, duplex: "half" } as RequestInit);
    expect((await route(chunked, h.deps)).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
  });

  it("refuses __proto__ and other non-library theme ids", async () => {
    const h = harness();
    for (const themeId of ["__proto__", "constructor", "toString", "nope"]) {
      const res = await route(post("/api/propose", { market, nights: [{ index: 0, date: "2026-05-01", themeId, sponsor: "", locked: false, notes: "" }], allowDuplicates: false }), h.deps);
      expect(res.status, themeId).toBe(400);
    }
    expect((await route(post("/api/recheck", { market, themeId: "__proto__" }), h.deps)).status).toBe(400);
  });

  it("answers with nosniff and a locked-down CSP", async () => {
    const res = await route(post("/api/analyze", analyzeBody), harness().deps);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it("keeps upstream error text out of the trace, and out of the response", async () => {
    const h = harness({}, null, async (input, init) => ((new URL(String(input)).searchParams.get("filter.results.entities") ?? "").startsWith("SYN-D-") ? new Response("SECRET-UPSTREAM-BODY", { status: 400 }) : syntheticQlooFetch(input, init)));
    const out = await analyzeOk(h, akronBody);
    const plan = out.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    const res = await route(post("/api/propose", { market: akronBody.market, nights: plan, allowDuplicates: false }), h.deps);
    const text = await res.text();
    expect(text).not.toContain("SECRET-UPSTREAM-BODY");
    expect(text).toContain("were not available right now");
  });

  it("fails closed when the usage counters cannot be written: no live Qloo call, and an honest answer", async () => {
    const h = harness();
    h.deps.agent.kv.put = async () => {
      throw new Error("KV put() limit exceeded for the day");
    };
    const res = await route(post("/api/analyze", analyzeBody), h.deps);
    expect(res.status).toBe(503);
    expect(((await res.json()) as ApiError).error).toBe("counters");
    expect(h.qlooUrls).toHaveLength(0);
  });

  it("says the counters are unavailable (not that the new-city allowance is used up) when a new city's counter cannot be written", async () => {
    const h = harness();
    const geo = { label: "Fresno, CA", lon: -119.78707, lat: 36.74773, sig: await signMarket(SIGNING_KEY, { label: "Fresno, CA", lon: -119.78707, lat: 36.74773 }) };
    h.deps.agent.kv.put = async () => {
      throw new Error("KV put() limit exceeded for the day");
    };
    const res = await route(post("/api/analyze", { market: geo, rows }), h.deps);
    expect(res.status).toBe(503);
    const body = (await res.json()) as ApiError;
    expect(body.error).toBe("counters");
    expect(body.message).not.toMatch(/new cities/);
    expect(h.qlooUrls).toHaveLength(0);
  });

  it("fails closed when the counters cannot be read, and still serves what is recorded", async () => {
    const h = harness();
    await analyzeOk(h); // records the scores
    const get = h.deps.agent.kv.get.bind(h.deps.agent.kv);
    h.deps.agent.kv.get = async (k: string) => {
      if (k.startsWith("cap:") || k.startsWith("q:v1:")) throw new Error("KV get failed");
      return get(k);
    };
    h.qlooUrls.length = 0;
    const out = await analyzeOk(h); // served from the recorded scores, no live call
    expect(out.caps.qlooRemaining).toBe(0);
    expect(h.qlooUrls).toHaveLength(0);
    // A market with nothing recorded gets no live call either.
    const cold = await route(post("/api/analyze", akronBody), h.deps);
    expect(cold.status).toBe(503);
    expect(h.qlooUrls).toHaveLength(0);
  });
});

describe("KV writes per visit (the free plan allows about 1,000 a day)", () => {
  async function visit(h: Harness): Promise<void> {
    const out = await analyzeOk(h, akronBody);
    const plan = out.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    expect((await route(post("/api/propose", { market: akronBody.market, nights: plan, allowDuplicates: false }), h.deps)).status).toBe(200);
  }
  it("a visit to a warm sample club writes nothing; the first visit writes a handful", async () => {
    const ai: AiPort = { run: async (_m, input) => {
      const msgs = (input as { messages: Array<{ content: string }> }).messages;
      if (!/swap/.test(msgs[0]!.content)) return { response: "{}" };
      const user = JSON.parse(msgs[1]!.content) as Array<{ id: string; town: string; planned: string; proposed: string }>;
      return { response: JSON.stringify(user.map((f) => ({ id: f.id, why: `People in ${f.town} like ${f.proposed} more than ${f.planned}, compared with their other themes.` }))) };
    } };
    const h = harness({}, ai);
    const puts: string[] = [];
    const put = h.deps.agent.kv.put.bind(h.deps.agent.kv);
    h.deps.agent.kv.put = async (k, v, o) => (puts.push(k.split(":")[0]!), put(k, v, o));
    await visit(h);
    const cold = puts.length;
    expect(cold).toBeLessThanOrEqual(16); // each reason pair is saved on its own, once
    puts.length = 0;
    await visit(h);
    expect(puts).toEqual([]); // everything is read from the saved answers: no scores, ideas or model calls to record
  });
});

describe("taste graph angles for locked nights", () => {
  const lib = activeLibrary({}, true);
  const flatRef = { synthetic: false, markets: 40, pulledAt: null, themes: Object.fromEntries(lib.map((t) => [t.id, { n: 40, mean: 0.7, sd: 0.1 }])) };
  const rowsLocked = [{ date: "2027-05-15", theme: "Star Trek Day", sponsor: "Harbor Credit Union", locked: true, notes: "" }, { date: "2027-05-22", theme: "Elvis Night", sponsor: "", locked: false, notes: "" }, { date: "2027-05-29", theme: "Beatles Night", sponsor: "", locked: false, notes: "" }, { date: "2027-06-05", theme: "Bluey Day", sponsor: "", locked: false, notes: "" }, { date: "2027-06-12", theme: "Taylor Swift Night", sponsor: "", locked: false, notes: "" }, { date: "2027-06-19", theme: "Princess Day", sponsor: "", locked: false, notes: "" }];

  it("ranks same-kind themes by affinity among fans of the locked theme: one Qloo call, cached, and named in the log", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const u = new URL(String(input));
      const ids = (u.searchParams.get("filter.results.entities") ?? "").split(",");
      const interests = u.searchParams.get("signal.interests.entities");
      const aff = (id: string): number => (interests ? (id === "SYN-batman:film" ? 0.99 : id === "SYN-top-gun:film" ? 0.8 : 0.5) : id === "SYN-star-trek:film" ? 0.3 : 0.7);
      if (u.searchParams.has("filter.tags")) return new Response(JSON.stringify({ results: { entities: [] } }));
      return new Response(JSON.stringify({ results: { entities: ids.map((id) => ({ entity_id: id, name: id, query: { affinity: aff(id) } })) } }));
    };
    const h = harness({ reference: flatRef }, null, fetchImpl);
    const body = { market: akronBody.market, rows: rowsLocked };
    const a = (await (await route(post("/api/analyze", body), h.deps)).json()) as AnalyzeResponse;
    const night = a.nights.find((n) => n.themeId === "star-trek")!;
    expect(night.label).toBe("leans-away");
    const plan = a.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    h.qlooUrls.length = 0;
    const p = (await (await route(post("/api/propose", { market: body.market, nights: plan, allowDuplicates: false }), h.deps)).json()) as ProposeResponse;
    const withInterests = h.qlooUrls.filter((u) => u.searchParams.has("signal.interests.entities"));
    expect(withInterests).toHaveLength(1); // one call for the one locked night
    expect(withInterests[0]!.searchParams.get("signal.interests.entities")).toBe("SYN-star-trek:film");
    expect(withInterests[0]!.searchParams.get("filter.type")).toBe("urn:entity:movie");
    expect(withInterests[0]!.searchParams.get("signal.location")).toMatch(/^POINT\(/);
    const cands = withInterests[0]!.searchParams.get("filter.results.entities")!.split(",");
    expect(cands).not.toContain("SYN-star-trek:film");
    expect(cands).toContain("SYN-star-wars:film"); // the asked set is fixed (every movie theme); the audience band is applied to the answer afterwards
    expect(p.angles[0]!.options!.some((o) => o.toThemeId === "star-wars")).toBe(false);
    expect(p.angles).toHaveLength(1);
    expect(p.angles[0]!.toThemeId).toBe("batman");
    expect(p.angles[0]!.text).toContain("Fans of Star Trek near Akron also like Batman, so if Harbor Credit Union is open to it, a small Batman touch");
    expect(p.trace.some((s) => /Asked Qloo what fans of Star Trek near Akron also like/.test(s.text))).toBe(true);
    // Cached: the same answer with no new call.
    h.qlooUrls.length = 0;
    const again = (await (await route(post("/api/propose", { market: body.market, nights: plan, allowDuplicates: false }), h.deps)).json()) as ProposeResponse;
    expect(h.qlooUrls.filter((u) => u.searchParams.has("signal.interests.entities"))).toHaveLength(0);
    expect(again.angles[0]!.text).toBe(p.angles[0]!.text);
    expect(again.trace.some((s) => /saved taste graph for fans of Star Trek/.test(s.text))).toBe(true);
  });

  it("asks with a single candidate, and widens to the same audience of any kind when the same-kind set is empty", async () => {
    const all = activeLibrary({}, true);
    const sub = all.filter((t) => ["marvel", "barbie", "bluey", "taylor-swift", "elvis", "beatles"].includes(t.id));
    const ref = { synthetic: false, markets: 40, pulledAt: null, themes: Object.fromEntries(sub.map((t) => [t.id, { n: 40, mean: 0.7, sd: 0.1 }])) };
    const fetchImpl: typeof fetch = async (input) => {
      const u = new URL(String(input));
      if (u.searchParams.has("filter.tags")) return new Response(JSON.stringify({ results: { entities: [] } }));
      const ids = (u.searchParams.get("filter.results.entities") ?? "").split(",");
      const interests = u.searchParams.get("signal.interests.entities");
      return new Response(JSON.stringify({ results: { entities: ids.map((id) => ({ entity_id: id, name: id, query: { affinity: interests ? 0.91 : id === "SYN-marvel:nwh" ? 0.3 : 0.7 } })) } }));
    };
    const h = harness({ library: sub, reference: ref }, null, fetchImpl);
    const rows = [{ date: "2027-05-15", theme: "Marvel Night", sponsor: "Summit Savings", locked: true, notes: "" }, { date: "2027-05-22", theme: "Bluey Day", sponsor: "", locked: false, notes: "" }, { date: "2027-05-29", theme: "Taylor Swift Night", sponsor: "", locked: false, notes: "" }, { date: "2027-06-05", theme: "Elvis Night", sponsor: "", locked: false, notes: "" }, { date: "2027-06-12", theme: "Beatles Night", sponsor: "", locked: false, notes: "" }];
    const a = (await (await route(post("/api/analyze", { market: akronBody.market, rows }), h.deps)).json()) as AnalyzeResponse;
    expect(a.nights.find((n) => n.themeId === "marvel")!.label).toBe("leans-away");
    const plan = a.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    h.qlooUrls.length = 0;
    const p = (await (await route(post("/api/propose", { market: akronBody.market, nights: plan, allowDuplicates: false }), h.deps)).json()) as ProposeResponse;
    const call = h.qlooUrls.filter((u) => u.searchParams.has("signal.interests.entities"));
    expect(call).toHaveLength(1);
    expect(call[0]!.searchParams.get("filter.results.entities")).toBe("SYN-barbie:film"); // one candidate, from the toys category, same young audience
    expect(p.angles[0]!.toThemeId).toBe("barbie");
    expect(p.angles[0]!.text).toContain("Fans of Marvel near Akron also like Barbie, so if Summit Savings is open to it");
    expect(p.trace.some((s) => /among 1 theme/.test(s.text))).toBe(true);
  });

  it("falls back to the plain angle when the taste graph call fails, without leaking the upstream text", async () => {
    const h = harness({ reference: flatRef }, null, async (input) => {
      const u = new URL(String(input));
      if (u.searchParams.has("signal.interests.entities")) return new Response("SECRET-TASTE-BODY", { status: 400 });
      if (u.searchParams.has("filter.tags")) return new Response(JSON.stringify({ results: { entities: [] } }));
      const ids = (u.searchParams.get("filter.results.entities") ?? "").split(",");
      return new Response(JSON.stringify({ results: { entities: ids.map((id) => ({ entity_id: id, name: id, query: { affinity: id === "SYN-star-trek:film" ? 0.3 : 0.7 } })) } }));
    });
    const a = (await (await route(post("/api/analyze", { market: akronBody.market, rows: rowsLocked }), h.deps)).json()) as AnalyzeResponse;
    const plan = a.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    const res = await route(post("/api/propose", { market: akronBody.market, nights: plan, allowDuplicates: false }), h.deps);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain("SECRET-TASTE-BODY");
    expect(text).toContain("was not available right now");
  });
});

describe("one pulled-from-Qloo time", () => {
  it("is the saved record's time for a fresh pull and for a cached one", async () => {
    const h = harness();
    const fresh = await analyzeOk(h);
    expect(fresh.recordedAt).toBe("2026-10-15T12:00:00.000Z");
    expect(fresh.recordedOn).toBeNull();
    h.deps.agent.now = () => new Date("2026-10-17T09:00:00.000Z");
    const cached = await analyzeOk(h);
    expect(cached.recordedAt).toBe("2026-10-15T12:00:00.000Z");
    expect(cached.recordedOn).toBe("2026-10-15");
    expect(cached.themes["bluey"]!.fetchedAt).toBe(cached.recordedAt);
    expect(cached.trace.some((s) => s.detail === "Cached, recorded 2026-10-15T12:00:00.000Z.")).toBe(true);
  });
});
