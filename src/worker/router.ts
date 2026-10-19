import type { ApiError, GeoHit, MarketIn, ProposeNightIn } from "../app/api-types";
import { parseDate, type CalendarRow } from "../app/calendar/csv";
import { analyze, capsOf, CappedError, proposeSwaps, QuotaError, recheck, type Deps, type Gate } from "./agent";
import { placeLabel } from "../app/geo";
import { DAILY_QUOTA, type Limiter, type QuotaKind } from "./limits";
import { safeGet, safePut } from "./safe";
import { isSampleMarket, marketAllowed, signMarket } from "./sign";

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
    h["access-control-allow-headers"] = "content-type";
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
  return {
    async allow(kind: QuotaKind): Promise<boolean> {
      if (kind === "pull" && isSampleMarket(m)) return true;
      const id = await deps.clientId(req);
      const key = `q:v1:${kind}:${id}:${deps.agent.now().toISOString().slice(0, 10)}`;
      const n = Number((await safeGet(deps.agent.kv, key)) ?? "0") || 0;
      if (n >= DAILY_QUOTA[kind]) return false;
      await safePut(deps.agent.kv, key, String(n + 1), { expirationTtl: 2 * 24 * 3600 });
      return true;
    },
  };
}

const QUOTA_MESSAGES: Record<QuotaKind, string> = {
  pull: "You've looked up as many new cities as are allowed today. The four sample clubs still work, and so do cities you've already checked.",
  recheck: "You've used today's live re-checks. The saved results are still good, and the sample clubs still work.",
  model: "",
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

const STUB_PLACES: Array<Omit<GeoHit, "sig">> = [
  { label: "Fresno, CA", lon: -119.78707, lat: 36.74773 },
  { label: "Tulsa, OK", lon: -95.99278, lat: 36.15398 },
  { label: "Boise, ID", lon: -116.20345, lat: 43.6135 },
  { label: "Columbus, OH", lon: -83.00207, lat: 39.96118 },
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

async function geocode(deps: RouterDeps, q: string): Promise<GeoHit[]> {
  const hits = await searchPlaces(deps, q);
  // Signed here, so the other endpoints only accept places this search returned.
  return Promise.all(hits.map(async (h) => ({ ...h, sig: deps.signingKey ? await signMarket(deps.signingKey, h) : "" })));
}

async function searchPlaces(deps: RouterDeps, q: string): Promise<Array<Omit<GeoHit, "sig">>> {
  if (deps.agent.mode === "synthetic") return STUB_PLACES.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()));
  // Open-Meteo geocoding: public, no key (https://open-meteo.com/en/docs/geocoding-api). Ask for plenty, keep the US and Canada.
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=30&language=en&format=json`;
  const res = await fetchOnceMore(deps.geocodeFetch, url);
  if (!res.ok) throw new Error(`geocoding HTTP ${res.status}`);
  const body = (await res.json()) as { results?: Array<{ name: string; admin1?: string; country_code?: string; latitude: number; longitude: number; feature_code?: string }> };
  const seen = new Set<string>();
  const out: Array<Omit<GeoHit, "sig">> = [];
  for (const r of body.results ?? []) {
    if (r.feature_code && !r.feature_code.startsWith("PPL") && !r.feature_code.startsWith("ADM")) continue;
    const label = placeLabel(r.name, r.admin1, r.country_code);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, lon: r.longitude, lat: r.latitude });
    if (out.length === 6) break;
  }
  return out;
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
      if (q.length < 2 || q.length > 60) return fail(400, "bad-request", "Type at least two letters of a city name.", headers);
      if (!(await deps.limiter("geocode", await deps.clientId(req)))) return fail(429, "rate-limit", "Too many searches. Wait a minute and try again.", headers);
      return json({ results: await geocode(deps, q) }, 200, headers);
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
    const agent: Deps = { ...deps.agent, gate: gateFor(deps, req, m) };

    if (route === "analyze") {
      const rows = rowsOf(body.rows);
      if (!rows) return fail(400, "bad-request", "The calendar rows are missing or invalid.", headers);
      return json(await analyze(agent, { market: m, rows }), 200, headers);
    }
    if (route === "propose") {
      const nights = nightsOf(body.nights);
      if (!nights) return fail(400, "bad-request", "The nights are missing or invalid.", headers);
      if (nights.some((n) => n.themeId !== null && !deps.agent.library.some((t) => t.id === n.themeId))) return fail(400, "bad-request", "Unknown theme.", headers);
      return json(await proposeSwaps(agent, { market: m, nights, allowDuplicates: body.allowDuplicates === true }), 200, headers);
    }
    if (route === "recheck") {
      const themeId = str(body.themeId, 60);
      if (!themeId || !deps.agent.library.some((t) => t.id === themeId)) return fail(400, "bad-request", "Unknown theme.", headers);
      const caps = await capsOf(deps.agent);
      if (caps.recheckDisabled) return fail(429, "capped", "Live re-check is switched off for today. The recorded results below are still good.", headers);
      return json(await recheck(agent, { market: m, themeId }), 200, headers);
    }
    return fail(404, "not-found", "No such route.", headers);
  } catch (err) {
    if (err instanceof QuotaError) return fail(429, "quota", QUOTA_MESSAGES[err.kind], headers);
    if (err instanceof CappedError) {
      return fail(429, "capped", "Today's live Qloo allowance is used up, and this market has no recorded result yet. The four sample clubs still work.", headers);
    }
    // Qloo or upstream trouble: say so without leaking details.
    console.error("upstream failure", err instanceof Error ? err.message : String(err));
    return fail(502, "upstream", "Something upstream failed. Try again in a moment.", headers);
  }
}
