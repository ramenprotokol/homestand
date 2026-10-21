import { describe, expect, it } from "vitest";
import { SYNTHETIC_REFERENCE as REFERENCE } from "../../src/worker/reference";
import { syntheticDiscoveryReference } from "../../src/app/discovery";
import { activeLibrary } from "../../src/app/themes/ids";
import { VENUE_LIBRARY } from "../../src/app/themes/artists";
import { syntheticActsReference } from "../../src/app/acts";
import { countersOf, type Deps } from "../../src/worker/agent";
import { memoryKv } from "../../src/worker/ports";
import { DAILY_QUOTA, LIMITS, memoryLimiter } from "../../src/worker/limits";
import { route, type RouterDeps } from "../../src/worker/router";
import { syntheticQlooFetch } from "../../src/worker/synthetic";

const SIGNING_KEY = "test-signing-key-0123456789abcdef";
const ORIGIN = "http://127.0.0.1:5173";
const NOW = new Date("2026-10-15T12:00:00.000Z");
const PLACES = [
  { name: "Fargo", admin1: "North Dakota", country_code: "US", latitude: 46.87719, longitude: -96.7898, feature_code: "PPLA2" },
  { name: "Fresno", admin1: "California", country_code: "US", latitude: 36.74773, longitude: -119.78707, feature_code: "PPLA2" },
];
/** Answers like the geocoder: places whose name starts with what was asked for. */
const geocodeStub: typeof fetch = async (u) => {
  const q = (new URL(String(u)).searchParams.get("name") ?? "").toLowerCase();
  return new Response(JSON.stringify({ results: PLACES.filter((p) => p.name.toLowerCase().startsWith(q)) }));
};

function harness(over: Partial<RouterDeps> = {}, agentOver: Partial<Deps> = {}) {
  const kv = memoryKv();
  const agent: Deps = {
    kv, ai: null, mode: "synthetic", qlooFetch: syntheticQlooFetch, qlooBase: "https://synthetic.invalid", qlooKey: "",
    library: activeLibrary({}, true), venueLibrary: activeLibrary({}, true, VENUE_LIBRARY), reference: REFERENCE, actsRef: syntheticActsReference(),
    now: () => NOW, qlooDailyCap: 400, aiDailyCap: 150, qlooDelayMs: 0, discoveryRef: syntheticDiscoveryReference(), ...agentOver,
  };
  const deps: RouterDeps = {
    agent, allowedOrigins: [ORIGIN], geocodeFetch: geocodeStub, clientId: async () => "a",
    limiter: memoryLimiter(1, () => NOW.getTime()), signingKey: SIGNING_KEY, ...over,
  };
  return { deps, kv };
}

let nextId = 1;
const rpc = (method: string, params?: unknown, headers: Record<string, string> = {}): Request =>
  new Request("https://api.test/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, ...(params === undefined ? {} : { params }) }), headers: { "content-type": "application/json", ...headers } });

const call = (name: string, args: Record<string, unknown> = {}): Request => rpc("tools/call", { name, arguments: args });

interface Rpc {
  jsonrpc: string;
  id: number | null;
  result?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- tests read loosely typed JSON
  error?: { code: number; message: string; data?: unknown };
}
async function send(h: ReturnType<typeof harness>, req: Request): Promise<{ status: number; body: Rpc }> {
  const res = await route(req, h.deps);
  const raw = await res.text();
  return { status: res.status, body: raw ? (JSON.parse(raw) as Rpc) : ({} as Rpc) };
}

const nights = [
  { date: "2027-06-12", theme: "Super Mario Day" },
  { date: "2027-06-18", theme: "Country Music Night", sponsor: "Bayou Bright Energy", locked: true },
  { date: "2027-06-19", theme: "Fireworks Friday" },
  { date: "2027-06-26", theme: "Taylor Swift Night", sponsor: "Sunrise Dental Group" },
  { date: "2027-07-02", theme: "Zorp Zibble Night" },
];

const text = (r: Rpc): string => r.result!.content[0].text as string;

describe("MCP protocol", () => {
  it("initialize negotiates the version and describes the server", async () => {
    const h = harness();
    const { status, body } = await send(h, rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }));
    expect(status).toBe(200);
    expect(body.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "homestand" } });
    const newer = await send(h, rpc("initialize", { protocolVersion: "2099-01-01" }));
    expect(newer.body.result!.protocolVersion).toBe("2025-11-25");
    expect((await send(h, rpc("initialize", {}))).body.error!.code).toBe(-32602);
  });

  it("answers ping, and notifications with 202 and no body", async () => {
    const h = harness();
    expect((await send(h, rpc("ping"))).body.result).toEqual({});
    const note = await route(new Request("https://api.test/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }), h.deps);
    expect(note.status).toBe(202);
    expect(await note.text()).toBe("");
  });

  it("speaks the 2026-07-28 revision: discover, per-request version, header checks", async () => {
    const h = harness();
    const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
    const headers = { "mcp-protocol-version": "2026-07-28", "mcp-method": "server/discover" };
    const ok = await send(h, rpc("server/discover", { _meta: meta }, headers));
    expect(ok.body.result).toMatchObject({ resultType: "complete", supportedVersions: expect.arrayContaining(["2026-07-28", "2025-11-25"]), capabilities: { tools: {} } });
    const bad = await send(h, rpc("server/discover", { _meta: meta }, { ...headers, "mcp-protocol-version": "2025-11-25" }));
    expect(bad.status).toBe(400);
    expect(bad.body.error!.code).toBe(-32020);
    const old = await send(h, rpc("server/discover", { _meta: { ...meta, "io.modelcontextprotocol/protocolVersion": "1900-01-01" } }, headers));
    expect(old.status).toBe(400);
    expect(old.body.error).toMatchObject({ code: -32022, data: { requested: "1900-01-01" } });
    const tool = await send(h, rpc("tools/call", { name: "sample_teams", arguments: {}, _meta: meta }, { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": "sample_teams" }));
    expect(tool.body.result).toMatchObject({ resultType: "complete" });
    expect((await send(h, rpc("nope", { _meta: meta }, { ...headers, "mcp-method": "nope" }))).status).toBe(404);
  });

  it("rejects an unsupported MCP-Protocol-Version header", async () => {
    const h = harness();
    const r = await send(h, rpc("tools/list", undefined, { "mcp-protocol-version": "1999-01-01" }));
    expect(r.status).toBe(400);
    expect(r.body.error!.code).toBe(-32022);
  });

  it("lists four tools with object schemas and descriptions", async () => {
    const h = harness();
    const { body } = await send(h, rpc("tools/list"));
    const tools = body.result!.tools as Array<{ name: string; description: string; inputSchema: { type: string; properties: Record<string, any> } }>; // eslint-disable-line @typescript-eslint/no-explicit-any -- tests read loosely typed JSON
    expect(tools.map((t) => t.name)).toEqual(["check_calendar", "propose_swaps", "explain_night", "sample_teams"]);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe("object");
    }
    const check = tools[0]!.inputSchema.properties;
    expect(check.sport.enum).toEqual(["baseball", "basketball", "hockey", "soccer"]);
    expect(check.nights.maxItems).toBe(200);
    expect(check.nights.items.required).toEqual(["date", "theme"]);
    expect(tools[1]!.inputSchema.properties.allowDuplicates.type).toBe("boolean");
  });

  it("returns clean JSON-RPC errors for protocol problems", async () => {
    const h = harness();
    const parse = await route(new Request("https://api.test/mcp", { method: "POST", body: "{nope" }), h.deps);
    expect(parse.status).toBe(400);
    expect(((await parse.json()) as Rpc).error!.code).toBe(-32700);
    const post = async (b: unknown): Promise<Rpc> => ((await (await route(new Request("https://api.test/mcp", { method: "POST", body: JSON.stringify(b) }), h.deps)).json()) as Rpc);
    expect((await post([{ jsonrpc: "2.0", id: 1, method: "ping" }])).error!.code).toBe(-32600);
    expect((await post({ id: 1, method: "ping" })).error!.code).toBe(-32600);
    expect((await post({ jsonrpc: "2.0", id: 1 })).error!.code).toBe(-32600);
    expect((await post({ jsonrpc: "2.0", id: null, method: "ping" })).error!.code).toBe(-32600);
    expect((await send(h, rpc("resources/list"))).body.error!.code).toBe(-32601);
    expect((await send(h, rpc("tools/call", { name: "nope" }))).body.error!.code).toBe(-32602);
    expect((await send(h, rpc("tools/call", {}))).body.error!.code).toBe(-32602);
    expect((await send(h, rpc("tools/call", { name: "sample_teams", arguments: [] }))).body.error!.code).toBe(-32602);
  });

  it("refuses an oversized body", async () => {
    const h = harness();
    const big = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(310_000) } });
    const res = await route(new Request("https://api.test/mcp", { method: "POST", body: big }), h.deps);
    expect(res.status).toBe(413);
    expect(((await res.json()) as Rpc).error!.code).toBe(-32600);
  });

  it("GET and DELETE are 405 with a short description", async () => {
    const h = harness();
    for (const method of ["GET", "DELETE"]) {
      const res = await route(new Request("https://api.test/mcp", { method }), h.deps);
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toContain("POST");
      expect(((await res.json()) as { name: string }).name).toBe("homestand");
    }
  });
});

describe("MCP origins", () => {
  it("lets server-side clients (no Origin) in, refuses unlisted browser origins, and does not widen the web API's CORS", async () => {
    const h = harness();
    expect((await send(h, rpc("ping"))).status).toBe(200);
    const evil = await route(rpc("ping", undefined, { origin: "https://evil.example" }), h.deps);
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const ok = await route(rpc("ping", undefined, { origin: ORIGIN }), h.deps);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const web = await route(new Request("https://api.test/api/analyze", { method: "OPTIONS", headers: { origin: ORIGIN } }), h.deps);
    expect(web.headers.get("access-control-allow-headers")).toBe("content-type");
  });
});

/** Raw Qloo values never leave the Worker: no such keys anywhere in a result. */
function noRawNumbers(v: unknown): void {
  if (Array.isArray(v)) v.forEach(noRawNumbers);
  else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      expect(k).not.toMatch(/affinity|popularity|^z$|zRaw|score|index|entities/i);
      noRawNumbers(val);
    }
  }
}

describe("MCP tools", () => {
  it("sample_teams lists the built-in samples", async () => {
    const { body } = await send(harness(), call("sample_teams"));
    const samples = body.result!.structuredContent.samples as Array<{ id: string; city: string; sport: string }>;
    expect(samples.map((s) => s.id)).toEqual(expect.arrayContaining(["biloxi", "boise", "raleigh"]));
    expect(samples.find((s) => s.id === "boise")).toMatchObject({ sport: "basketball" });
    expect(samples.find((s) => s.id === "raleigh")).toMatchObject({ sport: "venue" });
    expect(text(body)).toContain("```json");
    noRawNumbers(body.result);
  });

  it("check_calendar rates every night of a searched city, with a summary and reasons", async () => {
    const h = harness();
    const { body } = await send(h, call("check_calendar", { city: "Fresno, CA", sport: "hockey", nights }));
    expect(body.result!.isError).toBeUndefined();
    const out = body.result!.structuredContent;
    expect(out.market).toBe("Fresno, CA");
    expect(out.nights).toHaveLength(5);
    for (const n of out.nights) expect(["strong", "average", "weak", "leans strong", "leans weak", "classic", "not scored", "ambiguous"]).toContain(n.fit);
    expect(out.nights[2].fit).toBe("classic");
    expect(out.nights[4].fit).toBe("not scored");
    expect(out.nights[1]).toMatchObject({ locked: true, sponsor: "Bayou Bright Energy" });
    for (const n of out.nights) expect(n.reason.length).toBeGreaterThan(10);
    expect(out.summary).toMatch(/^5 nights checked for Fresno, CA/);
    expect(out.summary).toMatch(/Demo data/);
    expect(text(body)).toContain(out.summary);
    noRawNumbers(body.result);
  });

  it("check_calendar on a sample with no nights checks the sample's own calendar", async () => {
    const { body } = await send(harness(), call("check_calendar", { sample: "biloxi" }));
    const out = body.result!.structuredContent.nights as Array<{ fit: string; choices?: string[] }>;
    expect(out.length).toBeGreaterThan(20);
    for (const n of out.filter((x) => x.fit === "ambiguous")) expect(n.choices!.length).toBeGreaterThan(1);
    noRawNumbers(body.result);
  });

  it("check_calendar handles a venue sample", async () => {
    const { body } = await send(harness(), call("check_calendar", { sample: "raleigh" }));
    expect(body.result!.isError).toBeUndefined();
    expect(body.result!.structuredContent.nights.length).toBeGreaterThan(5);
  });

  it("propose_swaps returns swaps with reasons and keeps locks and sponsors", async () => {
    const h = harness();
    const { body } = await send(h, call("propose_swaps", { sample: "biloxi" }));
    expect(body.result!.isError).toBeUndefined();
    const out = body.result!.structuredContent;
    const checked = (await send(h, call("check_calendar", { sample: "biloxi" }))).body.result!.structuredContent.nights as Array<{ date: string; locked: boolean; fit: string; sponsor?: string }>;
    // Every unlocked Weak night is a swap, a "could not fix", or (when it only leans weak) a swap that is optional or a night left as planned.
    expect(out.swaps.length + out.notFixed.length + out.slight.length).toBe(checked.filter((n) => (n.fit === "weak" || n.fit === "leans weak") && !n.locked).length);
    expect(out.slight.length).toBeGreaterThan(0);
    expect(text(body)).toContain("only leans weak (raw gap under 0.01), so no swap is pushed. Left as planned.");
    expect(out.swaps.some((s: { optional?: boolean }) => s.optional === true)).toBe(true);
    for (const s of out.swaps) {
      const night = checked.find((n) => n.date === s.date)!;
      expect(night.locked).toBe(false);
      expect(["weak", "leans weak"]).toContain(night.fit);
      expect(s.sponsor).toBe(night.sponsor);
      expect(s.reason.length).toBeGreaterThan(10);
      expect(s.planned).not.toBe(s.proposed);
    }
    expect(text(body)).toContain("nothing has been changed");
    noRawNumbers(body.result);
  });

  it("propose_swaps takes allowDuplicates and a typed calendar", async () => {
    const { body } = await send(harness(), call("propose_swaps", { city: "Fresno, CA", nights, allowDuplicates: true }));
    expect(body.result!.isError).toBeUndefined();
    expect(Array.isArray(body.result!.structuredContent.swaps)).toBe(true);
  });

  it("explain_night says why in plain words", async () => {
    const { body } = await send(harness(), call("explain_night", { sample: "biloxi", theme: "Taylor Swift Night" }));
    expect(body.result!.isError).toBeUndefined();
    expect(["strong", "average", "weak", "leans strong", "leans weak"]).toContain(body.result!.structuredContent.fit);
    expect(text(body)).toMatch(/other themes/);
    noRawNumbers(body.result);
    const classic = await send(harness(), call("explain_night", { sample: "biloxi", theme: "Fireworks Friday" }));
    expect(classic.body.result!.structuredContent.fit).toBe("classic");
  });

  it("the plain text never contains a raw affinity or popularity value", async () => {
    const h = harness();
    for (const [name, args] of [["check_calendar", { sample: "akron" }], ["propose_swaps", { sample: "akron" }], ["explain_night", { sample: "akron", theme: "Bluey Day" }]] as const) {
      const { body } = await send(h, call(name, args));
      expect(text(body)).not.toMatch(/affinity|popularity/i);
      expect(text(body)).not.toMatch(/\b0\.\d{3,}\b/);
    }
  });
});

describe("MCP tool errors", () => {
  const bad = async (args: Record<string, unknown>, name = "check_calendar"): Promise<string> => {
    const { body } = await send(harness(), call(name, args));
    expect(body.error).toBeUndefined();
    expect(body.result!.isError).toBe(true);
    return text(body);
  };

  it("says what is wrong with each kind of bad input", async () => {
    expect(await bad({ nights })).toMatch(/city/);
    expect(await bad({ city: 7, nights })).toMatch(/"city" must be text/);
    expect(await bad({ city: "Fresno, CA" })).toMatch(/"nights" is missing/);
    expect(await bad({ city: "Fresno, CA", sport: "cricket", nights })).toMatch(/"sport" must be one of/);
    expect(await bad({ city: "Fresno, CA", kind: "stadium", nights })).toMatch(/"kind"/);
    expect(await bad({ city: "Fresno, CA", nights: [] })).toMatch(/at least one night/);
    expect(await bad({ city: "Fresno, CA", nights: [{ date: "6/19/2027", theme: "x" }] })).toMatch(/Night 1: the date/);
    expect(await bad({ city: "Fresno, CA", nights: [{ date: "2027-02-30", theme: "x" }] })).toMatch(/real day/);
    expect(await bad({ city: "Fresno, CA", nights: [{ date: "2027-06-19", theme: "x".repeat(121) }] })).toMatch(/theme must be/);
    expect(await bad({ city: "Fresno, CA", nights: [{ date: "2027-06-19", theme: "x", locked: "yes" }] })).toMatch(/locked/);
    expect(await bad({ city: "Fresno, CA", nights: Array.from({ length: 201 }, () => ({ date: "2027-06-19", theme: "x" })) })).toMatch(/at most 200/);
    expect(await bad({ sample: "nowhere" })).toMatch(/sample_teams/);
    expect(await bad({ city: "F".repeat(61), nights })).toMatch(/between 2 and 60/);
    expect(await bad({ sample: "biloxi" }, "explain_night")).toMatch(/"theme" is missing/);
    expect(await bad({ sample: "biloxi", allowDuplicates: "yes" }, "propose_swaps")).toMatch(/allowDuplicates/);
  });

  it("says so when the city cannot be found", async () => {
    const h = harness({ geocodeFetch: async () => new Response(JSON.stringify({ results: [] })) });
    const { body } = await send(h, call("check_calendar", { city: "Nowhereville", nights }));
    expect(body.result!.isError).toBe(true);
    expect(text(body)).toMatch(/could not find/);
  });

  it("refuses a place the Worker did not sign", async () => {
    const h = harness({ signingKey: null });
    const { body } = await send(h, call("check_calendar", { city: "Fresno, CA", nights }));
    expect(body.result!.isError).toBe(true);
    expect(text(body)).toMatch(/sample club/);
    // With no signing key the samples still work.
    expect((await send(h, call("check_calendar", { sample: "biloxi" }))).body.result!.isError).toBeUndefined();
  });

  it("maps an exhausted daily quota to a friendly tool error, like the web API", async () => {
    const h = harness();
    await countersOf({ kv: h.kv } as never).take("q:pull:a:2026-10-15", DAILY_QUOTA.pull, DAILY_QUOTA.pull, 3600);
    const { body } = await send(h, call("check_calendar", { city: "Fresno, CA", nights }));
    expect(body.error).toBeUndefined();
    expect(body.result!.isError).toBe(true);
    expect(text(body)).toMatch(/new cities/);
    // The sample clubs never count against it.
    expect((await send(h, call("check_calendar", { sample: "biloxi" }))).body.result!.isError).toBeUndefined();
  });

  it("maps the shared Qloo cap to a friendly tool error", async () => {
    const h = harness({}, { mode: "live", qlooBase: "https://qloo.test", qlooKey: "k", qlooDailyCap: 0 });
    const { body } = await send(h, call("check_calendar", { city: "Fresno, CA", nights }));
    expect(body.result!.isError).toBe(true);
    expect(text(body)).toMatch(/allowance/);
  });

  it("applies the same per-minute limits as the web API", async () => {
    const h = harness();
    let last: Rpc | null = null;
    for (let i = 0; i <= LIMITS.analyze!; i++) last = (await send(h, call("check_calendar", { sample: "biloxi" }))).body;
    expect(last!.result!.isError).toBe(true);
    expect(text(last!)).toMatch(/Too many requests/);
    // The web route shares the same budget.
    const web = await route(new Request("https://api.test/api/analyze", { method: "POST", body: "{}", headers: { origin: ORIGIN } }), h.deps);
    expect(web.status).toBe(429);
  });

  it("counts the geocode limit for city lookups", async () => {
    const h = harness({ limiter: async (r) => r !== "geocode" });
    const { body } = await send(h, call("check_calendar", { city: "Fresno, CA", nights }));
    expect(body.result!.isError).toBe(true);
    expect(text(body)).toMatch(/Too many requests/);
  });
});
