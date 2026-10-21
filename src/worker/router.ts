import type { ApiError, GeoResponse, MarketIn, ProposeNightIn } from "../app/api-types";
import { parseDate, type CalendarRow } from "../app/calendar/csv";
import { QlooUnavailableError } from "../qloo/client";
import { analyze, capsOf, CappedError, forKind, proposeSwaps, QuotaError, recheck, type Deps, type Gate } from "./agent";
import { isSport, kindOf, type Kind, type Sport } from "../app/kind";
import { exactTries, MAX_CITY, parsePlaceQuery, prefixTries, rankPlaces, TERRITORY_MESSAGE, type PlaceHit, type RawPlace } from "../app/geo";
import { DAILY_QUOTA, type Limiter, type QuotaKind } from "./limits";
import { isSampleMarket, marketAllowed, signMarket } from "./sign";
import { handleMcp, type McpHost } from "./mcp";

export interface RouterDeps {
  agent: Deps;
  allowedOrigins: string[];
  geocodeFetch: typeof fetch;
  /** Caller address for rate limits and quotas, hashed; an IPv6 caller counts as its /64. "local" when unknown. */
  clientId: (req: Request) => Promise<string>;
  /** Per-minute request limit (Cloudflare's Rate Limiting binding in production). */
  limiter: Limiter;
  /** Secret that signs searched places. Null means only the sample clubs are accepted. */
  signingKey: string | null;
}

const MAX_BODY = 300_000;

function cors(req: Request, allowed: string[]): Record<string, string> {
  const origin = req.headers.get("origin");
  const h: Record<string, string> = { vary: "origin" };
  if (origin && allowed.includes(origin)) {
    h["access-control-allow-origin"] = origin;
    h["access-control-allow-methods"] = "GET, POST, OPTIONS";
    // The MCP endpoint's extra request headers (a browser-based MCP client sends them); the other routes stay as narrow as before.
    h["access-control-allow-headers"] = new URL(req.url).pathname === "/mcp" ? "content-type, accept, mcp-protocol-version, mcp-method, mcp-name" : "content-type";
    h["access-control-max-age"] = "86400";
  }
  return h;
}

function json(body: unknown, status: number, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; frame-ancestors 'none'", ...extra },
  });
}

const fail = (status: number, error: string, message: string, extra: Record<string, string>): Response => json({ error, message } satisfies ApiError, status, extra);

/** The request body as text, or null when it is over the limit. Stops reading as soon as the limit is passed. */
export async function readBody(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** One count against this client's allowance for today (UTC). Sample clubs never count against new-city pulls. */
function gateFor(deps: RouterDeps, req: Request, m: MarketIn): Gate {
  const gate: Gate = {
    async allow(kind: QuotaKind): Promise<boolean> {
      if (kind === "pull" && isSampleMarket(m)) return true;
      const id = await deps.clientId(req);
      const key = `q:v1:${kind}:${id}:${deps.agent.now().toISOString().slice(0, 10)}`;
      // Fail closed: if this client's counter cannot be read or written, the live call is refused (recorded results are still served).
      try {
        const n = Number((await deps.agent.kv.get(key)) ?? "0") || 0;
        if (n >= DAILY_QUOTA[kind]) return false;
        await deps.agent.kv.put(key, String(n + 1), { expirationTtl: 2 * 24 * 3600 });
        return true;
      } catch (err) {
        console.error("quota counter failed", kind, err instanceof Error ? err.message : String(err));
        gate.broken = true;
        return false;
      }
    },
  };
  return gate;
}

/** The deps for one request: the kind and sport the caller asked for, and this client's daily allowance. Shared by the web API and the MCP tools. */
export function agentFor(deps: RouterDeps, req: Request, m: MarketIn, kind: Kind, sport?: Sport): Deps {
  return { ...forKind(deps.agent, kind), ...(kind === "club" && sport !== undefined ? { sport } : {}), gate: gateFor(deps, req, m) };
}

const QUOTA_MESSAGES: Record<QuotaKind, string> = {
  pull: "You've looked up as many new cities as are allowed today. The sample calendars still work, and so do cities you've already checked.",
  recheck: "You've used today's live re-checks. The saved results are still good, and the sample calendars still work.",
  model: "",
  taste: "You've used today's live taste-graph lookups. The saved ideas are still good, and the sample calendars still work.",
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max ? v : null);

function market(v: unknown): MarketIn | null {
  if (!isObj(v)) return null;
  const raw = str(v.label, 120);
  // Control characters never belong in a place name, and the label flows into the trace and the model's facts.
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const label = raw === null ? null : raw.replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!label || typeof v.lon !== "number" || typeof v.lat !== "number") return null;
  if (!(v.lon >= -180 && v.lon <= 180 && v.lat >= -90 && v.lat <= 90)) return null;
  return { label, lon: v.lon, lat: v.lat, ...(typeof v.sig === "string" && v.sig.length <= 128 ? { sig: v.sig } : {}) };
}

function rowsOf(v: unknown): CalendarRow[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 200) return null;
  const out: CalendarRow[] = [];
  for (const r of v) {
    if (!isObj(r)) return null;
    const theme = str(r.theme, 120);
    const date = typeof r.date === "string" ? parseDate(r.date) : null;
    const sponsor = str(r.sponsor ?? "", 80);
    const notes = str(r.notes ?? "", 300);
    if (!theme || !date || sponsor === null || notes === null || typeof r.locked !== "boolean") return null;
    out.push({ line: typeof r.line === "number" ? r.line : out.length + 2, date, theme, sponsor, locked: r.locked, notes });
  }
  return out;
}

function nightsOf(v: unknown): ProposeNightIn[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 200) return null;
  const out: ProposeNightIn[] = [];
  for (const n of v) {
    if (!isObj(n)) return null;
    const date = typeof n.date === "string" ? parseDate(n.date) : null;
    const sponsor = str(n.sponsor ?? "", 80);
    const notes = str(n.notes ?? "", 300);
    const themeId = n.themeId === null ? null : str(n.themeId, 60);
    if (!date || sponsor === null || notes === null || themeId === undefined || typeof n.locked !== "boolean" || typeof n.index !== "number") return null;
    out.push({ index: n.index, date, themeId, sponsor, locked: n.locked, notes });
  }
  return out;
}

/** Stand-ins for the geocoder in synthetic mode (local runs and the e2e suite), in the shape Open-Meteo answers. */
const STUB_PLACES: RawPlace[] = [
  { name: "Fresno", admin1: "California", country_code: "US", latitude: 36.74773, longitude: -119.78707, population: 542107, feature_code: "PPLA2" },
  { name: "Tulsa", admin1: "Oklahoma", country_code: "US", latitude: 36.15398, longitude: -95.99278, population: 413066, feature_code: "PPLA2" },
  { name: "Boise", admin1: "Idaho", country_code: "US", latitude: 43.6135, longitude: -116.20345, population: 235684, feature_code: "PPLA2" },
  { name: "Columbus", admin1: "Ohio", country_code: "US", latitude: 39.96118, longitude: -83.00207, population: 905748, feature_code: "PPLA2" },
  { name: "Vancouver", admin1: "British Columbia", country_code: "CA", latitude: 49.24966, longitude: -123.11934, population: 675218, feature_code: "PPL" },
];

/**
 * One retry on a network error or a 5xx. The function is called detached: in Workers a `fetch` called with any other
 * `this` (such as the deps object) throws "Illegal invocation".
 */
async function fetchOnceMore(f: typeof fetch, url: string): Promise<Response> {
  const call = f;
  try {
    const res = await call(url);
    if (res.status < 500) return res;
  } catch {
    /* fall through to the retry */
  }
  return call(url);
}

export async function geocode(deps: RouterDeps, q: string): Promise<GeoResponse> {
  const { hits, message } = await searchPlaces(deps, q);
  // Signed here, so the other endpoints only accept places this search returned.
  const results = await Promise.all(hits.map(async (h) => ({ ...h, sig: deps.signingKey ? await signMarket(deps.signingKey, h) : "" })));
  return message ? { results, message } : { results };
}

/** How many times one search may call the geocoder: the name as typed, a spelling or two, then shorter starts for a typo. */
const MAX_LOOKUPS = 5;

async function searchPlaces(deps: RouterDeps, q: string): Promise<{ hits: PlaceHit[]; message?: string }> {
  const parsed = parsePlaceQuery(q);
  if (parsed.name.length < 2) return { hits: [] };
  // A US territory is understood, and said plainly not to be covered, before any lookup.
  if (parsed.region?.cc === "TERRITORY") return { hits: [], message: TERRITORY_MESSAGE };
  if (deps.agent.mode === "synthetic") return rankPlaces(STUB_PLACES, parsed);
  // Open-Meteo geocoding: public, no key (https://open-meteo.com/en/docs/geocoding-api). It matches the start of a name and also
  // alternate names, so we ask for plenty and keep only the places whose own name matches what was typed.
  const tries = [...exactTries(parsed), ...prefixTries(parsed)].slice(0, MAX_LOOKUPS);
  const raw: RawPlace[] = [];
  let best: { hits: PlaceHit[]; message?: string; miss?: boolean } = { hits: [] };
  for (const [i, name] of tries.entries()) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=100&language=en&format=json`;
      const res = await fetchOnceMore(deps.geocodeFetch, url);
      if (!res.ok) throw new Error(`geocoding HTTP ${res.status}`);
      const body = (await res.json()) as { results?: RawPlace[] };
      raw.push(...(body.results ?? []));
    } catch (err) {
      // The first lookup failing is the search failing; a later one failing leaves what was already found.
      if (i === 0) throw err;
      break;
    }
    best = rankPlaces(raw, parsed);
    // Good enough to stop: places found (even with a note), or "outside the US and Canada". A name found only in another state
    // keeps looking, because the typed name may have a typo ("Springfeld, IL").
    if (!best.miss && (best.hits.length > 0 || best.message)) break;
  }
  return best.miss ? { hits: best.hits, ...(best.message ? { message: best.message } : {}) } : best;
}

export async function route(req: Request, deps: RouterDeps): Promise<Response> {
  const headers = cors(req, deps.allowedOrigins);
  const url = new URL(req.url);
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (origin && !deps.allowedOrigins.includes(origin)) return fail(403, "origin", "This site is not allowed to use the API.", headers);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true, mode: deps.agent.mode, library: deps.agent.library.length, ai: deps.agent.ai !== null, caps: await capsOf(deps.agent) }, 200, headers);
    }
    if (req.method === "GET" && url.pathname === "/api/geocode") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length > MAX_CITY) return fail(400, "too-long", `That is too long for a city name. Use ${MAX_CITY} characters or fewer, for example "Tulsa, OK".`, headers);
      if (q.length < 2) return fail(400, "bad-request", "Type at least two letters of a city name.", headers);
      if (!(await deps.limiter("geocode", await deps.clientId(req)))) return fail(429, "rate-limit", "Too many searches. Wait a minute and try again.", headers);
      return json(await geocode(deps, q), 200, headers);
    }
    if (url.pathname === "/mcp") {
      if (req.method !== "POST") {
        // Stateless server: no event stream to open and no session to end (MCP spec, Streamable HTTP).
        return json({ name: "homestand", message: "This is the Homestand MCP endpoint. Send JSON-RPC 2.0 messages with POST. See the README section 'Use Homestand from an AI assistant (MCP)'." }, 405, { ...headers, allow: "POST, OPTIONS" });
      }
      const host: McpHost = {
        respond: (body, status, extra = {}) => (body === null ? new Response(null, { status, headers: { ...headers, ...extra } }) : json(body, status, { ...headers, ...extra })),
        geocode: (q) => geocode(deps, q),
        agentFor: (m, kind, sport) => agentFor(deps, req, m, kind, sport),
        limit: async (name) => deps.limiter(name, await deps.clientId(req)),
        failureText: (err) => failureOf(err).message,
        signingKey: deps.signingKey,
      };
      return handleMcp(req, await readBody(req, MAX_BODY), host);
    }
    if (req.method !== "POST") return fail(404, "not-found", "No such route.", headers);
    const route = url.pathname.replace(/^\/api\//, "");
    if (!["analyze", "propose", "recheck"].includes(route)) return fail(404, "not-found", "No such route.", headers);
    if (!(await deps.limiter(route, await deps.clientId(req)))) return fail(429, "rate-limit", "Too many requests from here. Wait a minute and try again.", headers);
    const text = await readBody(req, MAX_BODY);
    if (text === null) return fail(413, "too-large", "That calendar is too large.", headers);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return fail(400, "bad-request", "The request was not valid JSON.", headers);
    }
    if (!isObj(body)) return fail(400, "bad-request", "The request body must be an object.", headers);
    const m = market(body.market);
    if (!m) return fail(400, "bad-request", "The market needs a label, lon and lat.", headers);
    if (!(await marketAllowed(m, deps.signingKey))) {
      if (!deps.signingKey && !isSampleMarket(m)) console.error("MARKET_SIGNING_KEY is not set: only the sample clubs are accepted");
      return fail(400, "bad-market", "Search for your city and pick it from the list, or use a sample club.", headers);
    }
    // `sport` is optional (baseball when absent) and must be one of the four names when present. It is wording only: never part of a cache key.
    if (body.sport !== undefined && !isSport(body.sport)) return fail(400, "bad-request", "The sport must be baseball, basketball, hockey or soccer.", headers);
    const kind = kindOf(body.kind);
    const agent = agentFor(deps, req, m, kind, body.sport);

    if (route === "analyze") {
      const rows = rowsOf(body.rows);
      if (!rows) return fail(400, "bad-request", "The calendar rows are missing or invalid.", headers);
      return json(await analyze(agent, { market: m, rows }), 200, headers);
    }
    if (route === "propose") {
      const nights = nightsOf(body.nights);
      if (!nights) return fail(400, "bad-request", "The nights are missing or invalid.", headers);
      if (nights.some((n) => n.themeId !== null && !agent.library.some((t) => t.id === n.themeId))) return fail(400, "bad-request", "Unknown theme.", headers);
      return json(await proposeSwaps(agent, { market: m, nights, allowDuplicates: body.allowDuplicates === true }), 200, headers);
    }
    if (route === "recheck") {
      const themeId = str(body.themeId, 60);
      if (!themeId || !agent.library.some((t) => t.id === themeId)) return fail(400, "bad-request", "Unknown theme.", headers);
      const caps = await capsOf(deps.agent);
      if (caps.recheckDisabled) return fail(429, "capped", "Live re-check is switched off for today. The recorded results below are still good.", headers);
      return json(await recheck(agent, { market: m, themeId }), 200, headers);
    }
    return fail(404, "not-found", "No such route.", headers);
  } catch (err) {
    const f = failureOf(err);
    return fail(f.status, f.error, f.message, headers);
  }
}

/** How a failed lookup is told to the caller: the same words for the web API and the MCP tools. */
export function failureOf(err: unknown): { status: number; error: string; message: string } {
  if (err instanceof QuotaError) return { status: 429, error: "quota", message: QUOTA_MESSAGES[err.kind] };
  if (err instanceof CappedError && err.countersDown) {
    return { status: 503, error: "counters", message: "Live lookups are paused because the usage counters are unavailable. Recorded results still work; try again shortly." };
  }
  if (err instanceof CappedError) {
    return { status: 429, error: "capped", message: "Today's live Qloo allowance is used up, and this town has no saved result yet. The sample calendars still work, and so does any city already checked. Live lookups reset at midnight UTC." };
  }
  if (err instanceof QlooUnavailableError) {
    console.error("qloo unavailable", err.why, err.message);
    if (err.why === "auth") return { status: 503, error: "live-ended", message: "Live lookups for new cities have ended with the hackathon. The sample calendars still work, and so does any city already checked." };
    if (err.why === "busy") return { status: 429, error: "qloo-busy", message: "Qloo is at its own limit right now, so this new city can't be looked up. Try again in a few minutes. The sample calendars and any city already checked still work." };
  }
  // Qloo or upstream trouble: say so without leaking details.
  console.error("upstream failure", err instanceof Error ? err.message : String(err));
  return { status: 502, error: "upstream", message: "Something upstream failed. Try again in a moment." };
}
