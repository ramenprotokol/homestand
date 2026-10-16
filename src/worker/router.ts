import type { ApiError, GeoHit, MarketIn, ProposeNightIn } from "../app/api-types";
import { parseDate, type CalendarRow } from "../app/calendar/csv";
import { analyze, capsOf, CappedError, memoSummary, proposeSwaps, recheck, type Deps } from "./agent";
import type { KvPort } from "./ports";

export interface RouterDeps {
  agent: Deps;
  kv: KvPort;
  allowedOrigins: string[];
  geocodeFetch: typeof fetch;
  /** Caller address for rate limits; "local" when unknown. */
  clientId: (req: Request) => Promise<string>;
  /** Multiplies every per-minute limit (local test runs only; 1 in production). */
  limitScale?: number;
}

const MAX_BODY = 300_000;
const LIMITS: Record<string, number> = { analyze: 12, propose: 20, recheck: 6, memo: 20, geocode: 20 };

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
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });
}

const fail = (status: number, error: string, message: string, extra: Record<string, string>): Response => json({ error, message } satisfies ApiError, status, extra);

async function underLimit(deps: RouterDeps, req: Request, route: string): Promise<boolean> {
  const id = await deps.clientId(req);
  const key = `rl:${route}:${id}:${Math.floor(deps.agent.now().getTime() / 60_000)}`;
  const n = Number((await deps.kv.get(key)) ?? "0") || 0;
  if (n >= (LIMITS[route] ?? 10) * (deps.limitScale ?? 1)) return false;
  await deps.kv.put(key, String(n + 1), { expirationTtl: 120 });
  return true;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max ? v : null);

function market(v: unknown): MarketIn | null {
  if (!isObj(v)) return null;
  const label = str(v.label, 120);
  if (!label || typeof v.lon !== "number" || typeof v.lat !== "number") return null;
  if (!(v.lon >= -180 && v.lon <= 180 && v.lat >= -90 && v.lat <= 90)) return null;
  return { label, lon: v.lon, lat: v.lat };
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

const STUB_PLACES: GeoHit[] = [
  { label: "Fresno, California, US", lon: -119.78707, lat: 36.74773 },
  { label: "Tulsa, Oklahoma, US", lon: -95.99278, lat: 36.15398 },
  { label: "Boise, Idaho, US", lon: -116.20345, lat: 43.6135 },
  { label: "Columbus, Ohio, US", lon: -83.00207, lat: 39.96118 },
];

async function geocode(deps: RouterDeps, q: string): Promise<GeoHit[]> {
  if (deps.agent.mode === "synthetic") return STUB_PLACES.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()));
  // Open-Meteo geocoding: public, no key (https://open-meteo.com/en/docs/geocoding-api).
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
  const res = await deps.geocodeFetch(url);
  if (!res.ok) throw new Error(`geocoding HTTP ${res.status}`);
  const body = (await res.json()) as { results?: Array<{ name: string; admin1?: string; country_code?: string; latitude: number; longitude: number; feature_code?: string }> };
  return (body.results ?? [])
    .filter((r) => !r.feature_code || r.feature_code.startsWith("PPL") || r.feature_code.startsWith("ADM"))
    .map((r) => ({ label: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "), lon: r.longitude, lat: r.latitude }));
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
      if (!(await underLimit(deps, req, "geocode"))) return fail(429, "rate-limit", "Too many searches. Wait a minute and try again.", headers);
      return json({ results: await geocode(deps, q) }, 200, headers);
    }
    if (req.method !== "POST") return fail(404, "not-found", "No such route.", headers);
    const route = url.pathname.replace(/^\/api\//, "");
    if (!["analyze", "propose", "recheck", "memo"].includes(route)) return fail(404, "not-found", "No such route.", headers);
    const text = await req.text();
    if (text.length > MAX_BODY) return fail(413, "too-large", "That calendar is too large.", headers);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return fail(400, "bad-request", "The request was not valid JSON.", headers);
    }
    if (!isObj(body)) return fail(400, "bad-request", "The request body must be an object.", headers);
    const m = market(body.market);
    if (!m) return fail(400, "bad-request", "The market needs a label, lon and lat.", headers);
    if (!(await underLimit(deps, req, route))) return fail(429, "rate-limit", "Too many requests from here. Wait a minute and try again.", headers);

    if (route === "analyze") {
      const rows = rowsOf(body.rows);
      if (!rows) return fail(400, "bad-request", "The calendar rows are missing or invalid.", headers);
      return json(await analyze(deps.agent, { market: m, rows }), 200, headers);
    }
    if (route === "propose") {
      const nights = nightsOf(body.nights);
      if (!nights) return fail(400, "bad-request", "The nights are missing or invalid.", headers);
      return json(await proposeSwaps(deps.agent, { market: m, nights, allowDuplicates: body.allowDuplicates === true }), 200, headers);
    }
    if (route === "recheck") {
      const themeId = str(body.themeId, 60);
      if (!themeId || !deps.agent.library.some((t) => t.id === themeId)) return fail(400, "bad-request", "Unknown theme.", headers);
      const caps = await capsOf(deps.agent);
      if (caps.recheckDisabled) return fail(429, "capped", "Live re-check is switched off for today. The recorded results below are still good.", headers);
      return json(await recheck(deps.agent, { market: m, themeId }), 200, headers);
    }
    // memo
    const swaps = Array.isArray(body.swaps) ? body.swaps : null;
    if (!swaps || swaps.length > 100) return fail(400, "bad-request", "The swaps are missing or invalid.", headers);
    const clean: Array<{ date: string; fromThemeId: string; toThemeId: string }> = [];
    for (const s of swaps) {
      const date = isObj(s) && typeof s.date === "string" ? parseDate(s.date) : null;
      const from = isObj(s) ? str(s.fromThemeId, 60) : null;
      const to = isObj(s) ? str(s.toThemeId, 60) : null;
      if (!date || !from || !to) return fail(400, "bad-request", "A swap is invalid.", headers);
      clean.push({ date, fromThemeId: from, toThemeId: to });
    }
    const nights = typeof body.nights === "number" && body.nights >= 0 && body.nights <= 200 ? body.nights : 0;
    const classic = typeof body.classic === "number" && body.classic >= 0 && body.classic <= 200 ? body.classic : 0;
    return json(await memoSummary(deps.agent, { market: m, swaps: clean, nights, classic }), 200, headers);
  } catch (err) {
    if (err instanceof CappedError) {
      return fail(429, "capped", "Today's live Qloo allowance is used up, and this market has no recorded result yet. The four sample clubs still work.", headers);
    }
    // Qloo or upstream trouble: say so without leaking details.
    return fail(502, "upstream", "Something upstream failed. Try again in a moment.", headers);
  }
}
