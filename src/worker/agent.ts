import type { AnalyzeResponse, Caps, DiscoveryOut, MarketIn, NightOut, ProposeNightIn, ProposeResponse, RecheckResponse, ThemeScoreOut } from "../app/api-types";
import { weekdayName, type CalendarRow } from "../app/calendar/csv";
import { resolveTheme, type Resolution } from "../app/calendar/resolve";
import { claimsOutcome, numbersAreGrounded } from "../app/guard";
import type { QuotaKind } from "./limits";
import { safeGet, safePut, sha256Hex } from "./safe";
import { marketKey } from "../app/markets";
import { categoryGroup, propose, type Discovered, type PlanNight, type SponsorAngle, type ThemeFit } from "../app/propose/propose";
import { audienceBand, audienceFit, inWindow } from "../app/propose/rules";
import { shortDate } from "../app/dates";
import { bundleScore, centre, fitFor, labelForZ, type FitLabel, type ReferenceStats } from "../app/score";
import { idsOfType, type LiveTheme } from "../app/themes/ids";
import { THEME_LIBRARY } from "../app/themes/library";
import { libraryTitleMatcher } from "../app/themes/match";
import { DISCOVERY_REFERENCE, IDEA_POPULARITY, rankPool, standsOut, worthASwap, type DiscoveryReference } from "../app/discovery";
import { step, type TraceStep } from "../app/trace";
import { createQlooClient, type QlooType } from "../qloo/client";
import { AI_MODEL, type AiPort, type KvPort } from "./ports";

export interface Deps {
  kv: KvPort;
  ai: AiPort | null;
  mode: "live" | "synthetic";
  qlooFetch: typeof fetch;
  qlooBase: string;
  qlooKey: string;
  library: LiveTheme[];
  reference: ReferenceStats;
  now: () => Date;
  qlooDailyCap: number;
  aiDailyCap: number;
  /** Pause between Qloo calls, ms (0 in tests). */
  qlooDelayMs: number;
  /** Longest wait for a model reply, ms. Default 6000. */
  aiTimeoutMs?: number;
  /** The title pool and its reference spread. Defaults to the committed one; synthetic mode and tests pass their own. */
  discoveryRef?: DiscoveryReference;
  /** Per-client daily allowance, set per request by the router. Unset means no per-client limit (tests). */
  gate?: Gate;
}

/** Counts one use of a per-client daily allowance and says whether it was still available. */
export interface Gate {
  allow(kind: QuotaKind): Promise<boolean>;
}

/** Thrown when this client's daily allowance for live lookups is used up. */
export class QuotaError extends Error {
  constructor(readonly kind: QuotaKind) {
    super("This client's daily allowance is used up.");
  }
}

/** Thrown when a live Qloo call is needed and today's cap is spent. */
export class CappedError extends Error {
  constructor() {
    super("Today's live Qloo allowance is used up.");
  }
}

const RADIUS_M = 80_000;
const TTL = 60 * 24 * 3600;
const iso = (d: Deps): string => d.now().toISOString();
const today = (d: Deps): string => iso(d).slice(0, 10);

// ---------- daily counters ----------

async function counter(d: Deps, name: string): Promise<number> {
  const raw = await safeGet(d.kv, `cap:${name}:${today(d)}`);
  const n = raw === null ? 0 : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function bump(d: Deps, name: string, by: number): Promise<void> {
  await safePut(d.kv, `cap:${name}:${today(d)}`, String((await counter(d, name)) + by), { expirationTtl: 2 * 24 * 3600 });
}

export async function capsOf(d: Deps): Promise<Caps> {
  const used = await counter(d, "qloo");
  const qlooRemaining = Math.max(0, d.qlooDailyCap - used);
  const aiUsed = await counter(d, "ai");
  return { qlooRemaining, qlooCap: d.qlooDailyCap, recheckDisabled: d.mode === "live" && qlooRemaining < 3, aiRemaining: d.ai ? Math.max(0, d.aiDailyCap - aiUsed) : 0 };
}

async function reserveQloo(d: Deps, n: number): Promise<boolean> {
  if (d.mode === "synthetic") return true;
  if ((await counter(d, "qloo")) + n > d.qlooDailyCap) return false;
  await bump(d, "qloo", n);
  return true;
}

// ---------- scores: cache, then Qloo ----------

interface StoredEntity {
  key: string;
  name: string;
  type: string;
  affinity: number | null;
}
interface StoredTheme {
  entities: StoredEntity[];
  fetchedAt: string;
}
interface StoredLibrary {
  v: 1;
  fetchedAt: string;
  themes: Record<string, StoredTheme>;
}

function signature(library: readonly LiveTheme[]): string {
  const s = library.flatMap((t) => t.entities.map((e) => e.id)).join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const cacheKey = (d: Deps, m: MarketIn): string => `lib:${signature(d.library)}:${d.mode}:${marketKey(m)}`;

/** One /v2/insights call per entity type, batched (Amendment 4). Returns the stored shape for the given themes. */
async function askQloo(d: Deps, m: MarketIn, themes: readonly LiveTheme[], trace: TraceStep[]): Promise<Record<string, StoredTheme>> {
  const at = iso(d);
  const client = createQlooClient({
    baseUrl: d.qlooBase,
    apiKey: d.qlooKey,
    fetchImpl: d.qlooFetch,
    delayMs: d.qlooDelayMs,
    maxTries: 3,
    sleep: d.qlooDelayMs === 0 ? async () => undefined : undefined,
  });
  const byId = new Map<string, number | null>();
  const types = [...new Set(themes.flatMap((t) => t.entities.map((e) => e.type)))] as QlooType[];
  for (const type of types) {
    const ids = idsOfType(themes, type);
    const rows = await client.localAffinity({
      type, entityIds: ids, lon: m.lon, lat: m.lat, radiusM: RADIUS_M,
      ...(type === "movie" ? { releaseYearMin: 1900 } : {}),
      ...(ids.length > 20 ? { take: ids.length } : {}),
    });
    for (const r of rows) byId.set(r.entityId, r.affinity);
    const got = rows.filter((r) => r.affinity !== null).length;
    trace.push(step(iso(d), "qloo", `Asked Qloo about ${ids.length} ${type.replace("_", " ")} entit${ids.length === 1 ? "y" : "ies"} around the market (80 km).`, `Live call at ${iso(d)}. ${got} of ${ids.length} came back with a reading.${d.mode === "synthetic" ? " SYNTHETIC test data, not Qloo." : ""}`));
  }
  const out: Record<string, StoredTheme> = {};
  for (const t of themes) out[t.id] = { fetchedAt: at, entities: t.entities.map((e) => ({ key: e.key, name: e.names[0]!, type: e.type, affinity: byId.get(e.id) ?? null })) };
  return out;
}

export interface Scores {
  stored: StoredLibrary;
  source: "live" | "cache";
}

export async function getScores(d: Deps, m: MarketIn, trace: TraceStep[]): Promise<Scores> {
  const key = cacheKey(d, m);
  const hit = await safeGet(d.kv, key);
  if (hit) {
    try {
      const stored = JSON.parse(hit) as StoredLibrary;
      if (stored.v === 1) {
        trace.push(step(iso(d), "qloo", "Used the recorded scores for this market (no new Qloo call).", `Cached, recorded ${stored.fetchedAt}.`));
        return { stored, source: "cache" };
      }
    } catch {
      /* fall through to a fresh pull */
    }
  }
  const need = new Set(d.library.flatMap((t) => t.entities.map((e) => e.type))).size;
  if (d.gate && !(await d.gate.allow("pull"))) throw new QuotaError("pull");
  if (!(await reserveQloo(d, need))) throw new CappedError();
  const themes = await askQloo(d, m, d.library, trace);
  const stored: StoredLibrary = { v: 1, fetchedAt: iso(d), themes };
  await safePut(d.kv, key, JSON.stringify(stored), { expirationTtl: TTL });
  return { stored, source: "live" };
}

function toOut(d: Deps, id: string, st: StoredTheme, source: ThemeScoreOut["source"]): ThemeScoreOut {
  const score = bundleScore(st.entities.map((e) => e.affinity));
  const ref = d.reference.themes[id];
  const fit = fitFor(score, ref);
  return {
    themeId: id, label: fit.label, z: fit.z, index: null, marketMeanZ: null, scoredThemes: 0, score, ...(fit.reason ? { reason: fit.reason } : {}),
    entities: st.entities.map((e) => ({ name: e.name, type: e.type, affinity: e.affinity })),
    fetchedAt: st.fetchedAt, source: d.mode === "synthetic" ? "synthetic" : source, ref: ref ? { n: ref.n, mean: ref.mean, sd: ref.sd } : null,
  };
}

function allOut(d: Deps, s: Scores): Record<string, ThemeScoreOut> {
  const list: ThemeScoreOut[] = [];
  for (const t of d.library) {
    const st = s.stored.themes[t.id];
    if (st) list.push(toOut(d, t.id, st, s.source));
  }
  // Centre within the market: labels come from z minus the market's own mean z. Not-scored themes never enter the mean.
  const c = centre(list.map((o) => o.z));
  list.forEach((o, i) => {
    o.marketMeanZ = c.mean;
    o.scoredThemes = c.count;
    o.index = c.indices[i] ?? null;
    if (o.z !== null) {
      if (o.index === null) {
        o.label = "not-scored";
        o.reason = "Too few themes were scored at this market to compare one theme with its average.";
      } else o.label = labelForZ(o.index);
    }
  });
  return Object.fromEntries(list.map((o) => [o.themeId, o]));
}

// ---------- taste graph: what fans of a locked night's theme near the ballpark also lean toward ----------

interface StoredTaste {
  v: 1;
  fetchedAt: string;
  /** Candidate theme ids with their affinity among fans of the locked theme here, best first. */
  ranked: Array<{ themeId: string; affinity: number }>;
}

/**
 * A locked night cannot change, so it gets a sponsor-friendly touch. The touch is chosen with one Qloo call per locked night:
 * the affinities of same-kind, audience-ok, unused library themes among fans of the locked theme near the ballpark
 * (signal.interests.entities). With nothing to compare, or when Qloo is unavailable, the angle keeps the local-lean choice.
 */
async function tasteAngles(d: Deps, m: MarketIn, angles: SponsorAngle[], nights: PlanNight[], trace: TraceStep[]): Promise<SponsorAngle[]> {
  if (angles.length === 0) return angles;
  const city = m.label.split(",")[0]!.replace(/ (sample )?club$/, "");
  const used = new Set(nights.map((n) => n.themeId).filter((x): x is string => x !== null));
  const out: SponsorAngle[] = [];
  let client: ReturnType<typeof createQlooClient> | null = null;
  for (const angle of angles) {
    const original = d.library.find((t) => t.id === angle.themeId);
    const night = nights.find((n) => n.index === angle.index);
    const type = original?.entities[0]?.type;
    if (!original || !night || !type) {
      out.push(angle);
      continue;
    }
    const slot = { date: night.date, notes: night.notes };
    const cands = d.library.filter((t) => t.id !== original.id && !used.has(t.id) && categoryGroup(t.category) === categoryGroup(original.category) && audienceBand(t.audience) === audienceBand(original.audience) && audienceFit(original, t, slot) && inWindow(night.date, t.window) && t.entities.some((e) => e.type === type));
    if (cands.length < 2) {
      out.push(angle);
      continue;
    }
    const candIds = cands.map((t) => t.entities.find((e) => e.type === type)!.id);
    const key = `tg:v1:${marketKey(m)}:${original.id}:${await sha256Hex(candIds.slice().sort().join(","))}`;
    let stored: StoredTaste | null = null;
    const hit = await safeGet(d.kv, key);
    if (hit) {
      try {
        const s = JSON.parse(hit) as StoredTaste;
        if (s.v === 1) stored = s;
      } catch {
        stored = null;
      }
    }
    if (stored) trace.push(step(iso(d), "qloo", `Used the recorded taste graph for fans of ${original.label} near ${city} (no new Qloo call).`, `Cached, recorded ${stored.fetchedAt}.`));
    else {
      if ((d.gate && !(await d.gate.allow("pull"))) || !(await reserveQloo(d, 1))) {
        trace.push(step(iso(d), "qloo", `Skipped the taste graph for ${original.label}: today's allowance is used up, so the angle uses the local lean.`));
        out.push(angle);
        continue;
      }
      try {
        client ??= createQlooClient({ baseUrl: d.qlooBase, apiKey: d.qlooKey, fetchImpl: d.qlooFetch, delayMs: d.qlooDelayMs, maxTries: 3, sleep: d.qlooDelayMs === 0 ? async () => undefined : undefined });
        const rows = await client.localAffinity({ type, entityIds: candIds, interestIds: original.entities.map((e) => e.id), lon: m.lon, lat: m.lat, radiusM: RADIUS_M, take: candIds.length, ...(type === "movie" ? { releaseYearMin: 1900 } : {}) });
        const byId = new Map(rows.map((r) => [r.entityId, r.affinity]));
        const ranked = cands.flatMap((t) => {
          const a = byId.get(t.entities.find((e) => e.type === type)!.id);
          return typeof a === "number" ? [{ themeId: t.id, affinity: a }] : [];
        }).sort((x, y) => y.affinity - x.affinity || x.themeId.localeCompare(y.themeId));
        stored = { v: 1, fetchedAt: iso(d), ranked };
        await safePut(d.kv, key, JSON.stringify(stored), { expirationTtl: TTL });
        trace.push(step(iso(d), "qloo", `Asked Qloo what fans of ${original.label} near ${city} also lean toward, among ${cands.length} similar themes (taste graph, one call).`, `Live call at ${iso(d)}. ${ranked.length} came back with a reading.${d.mode === "synthetic" ? " SYNTHETIC test data, not Qloo." : ""}`));
      } catch (err) {
        console.error("taste graph failed", err instanceof Error ? err.message : String(err));
        trace.push(step(iso(d), "qloo", `The taste graph for ${original.label} was not available right now, so the angle uses the local lean.`));
        out.push(angle);
        continue;
      }
    }
    const top = stored.ranked[0] ? d.library.find((t) => t.id === stored!.ranked[0]!.themeId) : undefined;
    if (!top) {
      out.push(angle);
      continue;
    }
    const who = angle.sponsor || "the sponsor";
    out.push({ ...angle, toThemeId: top.id, text: `${original.label} on ${shortDate(angle.date)} is locked, so it stays exactly as planned. Fans of ${original.label} near ${city} also lean toward ${top.label}, so if ${who} is open to it, a small ${top.label} touch (walk-up songs, PA clips or a photo spot) fits the night.` });
  }
  return out;
}

// ---------- discovery: which family titles stand out near the ballpark ----------

interface StoredDiscovery {
  v: 1;
  fetchedAt: string;
  movies: Discovered[];
  shows: Discovered[];
  young: Discovered[];
}

const discoveryKey = (d: Deps, m: MarketIn): string => {
  const ref = d.discoveryRef ?? DISCOVERY_REFERENCE;
  return `disc:v4:${signature(d.library)}:${ref.pool.length}:${ref.pulledAt ?? "syn"}:${d.mode}:${marketKey(m)}`;
};

/**
 * Two calls score a fixed pool of family-friendly animated titles at this market (filter.results.entities), and each title is
 * ranked by how far its reading sits above its own spread over the 40 reference markets. A third call asks for the top family
 * picks among fans aged 24 and younger here. Returns null, never throws, when discovery is unavailable: swaps then use library
 * themes only.
 */
export async function discover(d: Deps, m: MarketIn, trace: TraceStep[]): Promise<DiscoveryOut | null> {
  const city = m.label.split(",")[0]!.replace(/ (sample )?club$/, "");
  const ref = d.discoveryRef ?? DISCOVERY_REFERENCE;
  if (ref.pool.length === 0) {
    trace.push(step(iso(d), "qloo", `Skipped the family titles near ${city}: no title pool is loaded.`));
    return null;
  }
  const key = discoveryKey(d, m);
  const hit = await safeGet(d.kv, key);
  if (hit) {
    try {
      const s = JSON.parse(hit) as StoredDiscovery;
      if (s.v === 1) {
        trace.push(step(iso(d), "qloo", `Used the recorded family-title scores and under-25 picks near ${city} (no new Qloo call).`, `Cached, recorded ${s.fetchedAt}.`));
        return { movies: s.movies, shows: s.shows, young: s.young, source: d.mode === "synthetic" ? "synthetic" : "cache", fetchedAt: s.fetchedAt };
      }
    } catch {
      /* fall through to a fresh pull */
    }
  }
  if (!(await reserveQloo(d, 3))) {
    trace.push(step(iso(d), "qloo", `Skipped the family titles near ${city}: today's Qloo allowance is used up.`));
    return null;
  }
  try {
    const client = createQlooClient({ baseUrl: d.qlooBase, apiKey: d.qlooKey, fetchImpl: d.qlooFetch, delayMs: d.qlooDelayMs, maxTries: 3, sleep: d.qlooDelayMs === 0 ? async () => undefined : undefined });
    const synthetic = d.mode === "synthetic" ? " SYNTHETIC test data, not Qloo." : "";
    const ranked: Record<"movie" | "tv_show", Discovered[]> = { movie: [], tv_show: [] };
    for (const type of ["movie", "tv_show"] as const) {
      const ids = ref.pool.filter((p) => p.type === type).map((p) => p.entityId);
      const rows = await client.localAffinity({ type, entityIds: ids, lon: m.lon, lat: m.lat, radiusM: RADIUS_M, take: ids.length, ...(type === "movie" ? { releaseYearMin: 1900 } : {}) });
      ranked[type] = rankPool(new Map(rows.map((r) => [r.entityId, r.affinity])), ref, type).filter((x) => (x.popularity ?? 0) >= IDEA_POPULARITY).slice(0, 12);
      const standing = ranked[type].filter(standsOut).length;
      trace.push(step(iso(d), "qloo", `Asked Qloo how ${ids.length} family-friendly animated ${type === "movie" ? "movies" : "shows"} score near ${city} (80 km), and compared each with its spread over ${ref.markets} ballpark markets.`, `Live call at ${iso(d)}. ${standing} stand out here.${synthetic}`));
    }
    const isLibrary = libraryTitleMatcher(new Set(d.library.flatMap((t) => t.entities.map((e) => e.id))), THEME_LIBRARY);
    const youngRows = (await client.discoverFamily({ type: "tv_show", lon: m.lon, lat: m.lat, radiusM: RADIUS_M, take: 6, age: "24_and_younger" }))
      .filter((r) => !isLibrary(r.entityId, r.name))
      .map((r): Discovered => ({ name: r.name, entityId: r.entityId, type: r.type, affinity: r.affinity }));
    trace.push(step(iso(d), "qloo", `Asked Qloo for the top family picks among fans aged 24 and younger near ${city}.`, `Live call at ${iso(d)}. ${youngRows.length} kept.${synthetic}`));
    const stored: StoredDiscovery = { v: 1, fetchedAt: iso(d), movies: ranked.movie, shows: ranked.tv_show, young: youngRows };
    await safePut(d.kv, key, JSON.stringify(stored), { expirationTtl: TTL });
    return { movies: stored.movies, shows: stored.shows, young: stored.young, source: d.mode === "synthetic" ? "synthetic" : "live", fetchedAt: stored.fetchedAt };
  } catch (err) {
    console.error("discovery failed", err instanceof Error ? err.message : String(err));
    trace.push(step(iso(d), "qloo", `Family titles near ${city} were not available right now, so swaps use library themes only.`));
    return null;
  }
}

// ---------- model ----------

/**
 * The text of a Workers AI reply. Models return different shapes: the OpenAI chat shape
 * (`choices[0].message.content`), a `response` string, or a `response` already parsed into an object.
 */
export function replyText(res: unknown): string | null {
  if (typeof res === "string") return res.trim() ? res : null;
  if (typeof res !== "object" || res === null) return null;
  const r = res as { choices?: Array<{ message?: { content?: unknown } }>; response?: unknown };
  const content = r.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (typeof r.response === "string" && r.response.trim()) return r.response;
  if (typeof r.response === "object" && r.response !== null) return JSON.stringify(r.response);
  return null;
}

class ModelTimeout extends Error {}

export async function runModel(d: Deps, system: string, user: string, trace: TraceStep[], what: string, maxTokens = 900): Promise<string | null> {
  if (!d.ai) {
    trace.push(step(iso(d), "model", `${what}: no model attached here, so template text is used.`));
    return null;
  }
  if ((await counter(d, "ai")) >= d.aiDailyCap) {
    trace.push(step(iso(d), "model", `${what}: today's model budget is spent, so template text is used.`));
    return null;
  }
  if (d.gate && !(await d.gate.allow("model"))) {
    trace.push(step(iso(d), "model", `${what}: your daily model allowance is spent, so template text is used.`));
    return null;
  }
  await bump(d, "ai", 1);
  const limit = d.aiTimeoutMs ?? 6000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = d.ai.run(AI_MODEL, { messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.1, max_tokens: maxTokens });
    call.catch(() => undefined); // a late failure after the timeout must not surface
    const res = await Promise.race([call, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ModelTimeout()), limit); })]);
    const text = replyText(res);
    trace.push(step(iso(d), "model", text === null ? `${what}: the model's reply couldn't be used, so template text is used.` : `${what}: the model replied.`));
    return text;
  } catch (err) {
    if (err instanceof ModelTimeout) trace.push(step(iso(d), "model", `${what}: the model took too long (over ${Math.round(limit / 1000)} seconds), so template text is used.`));
    else {
      console.error("model call failed", err instanceof Error ? err.message : String(err));
      trace.push(step(iso(d), "model", `${what}: the model call failed, so template text is used.`));
    }
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function jsonIn(text: string | null): unknown {
  if (!text) return null;
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---------- analyze ----------

export interface AnalyzeInput {
  market: MarketIn;
  rows: CalendarRow[];
}

export async function analyze(d: Deps, input: AnalyzeInput): Promise<AnalyzeResponse> {
  const trace: TraceStep[] = [];
  const at = iso(d);
  trace.push(step(at, "note", `Read ${input.rows.length} nights for ${input.market.label}.`));
  const activeIds = new Set(d.library.map((t) => t.id));

  // 1. Resolve: alias table first, then (only for text the table cannot place) one batched model call.
  const resolutions: Resolution[] = input.rows.map((r) => resolveTheme(r.theme, d.library));
  // A name the whole library knows but the live library cannot score (no Qloo id, or no local signal): recognised, left alone.
  const recognised: Array<string | null> = input.rows.map((r, i) => {
    if (resolutions[i]!.kind === "theme" || resolutions[i]!.kind === "ambiguous") return null;
    const full = resolveTheme(r.theme, THEME_LIBRARY);
    return full.kind === "theme" && !activeIds.has(full.themeId) ? THEME_LIBRARY.find((t) => t.id === full.themeId)!.label : null;
  });
  const unknownIdx = resolutions.flatMap((r, i) => (r.kind === "unknown" && recognised[i] === null ? [i] : []));
  if (unknownIdx.length > 0 && d.ai) {
    // Same unknown names, same answer: the reply is cached by the sorted, normalised texts, so a repeat costs no model call.
    const norm1 = (t: string): string => t.toLowerCase().replace(/\s+/g, " ").trim();
    const texts = [...new Set(unknownIdx.map((i) => norm1(input.rows[i]!.theme)))].sort();
    const key = `ai:res:v1:${await sha256Hex(texts.join("\n"))}`;
    let reply = await safeGet(d.kv, key);
    if (reply !== null) trace.push(step(iso(d), "model", "Matching unrecognised theme names: used the saved answer (no model call)."));
    else {
      const list = d.library.map((t) => `${t.id}: ${t.label}`).join("\n");
      reply = await runModel(
        d,
        "You match minor league baseball promotion names to a fixed list of pop-culture themes. Answer with JSON only: an object mapping each number to an array of theme ids. Use an empty array unless the text clearly names that franchise, show, film, game, brand or artist. Never guess. Never invent ids.",
        `Themes:\n${list}\n\nTexts:\n${texts.map((t, n) => `${n}: ${t}`).join("\n")}`,
        trace,
        "Matching unrecognised theme names",
        600,
      );
      if (reply !== null) await safePut(d.kv, key, reply, { expirationTtl: TTL });
    }
    const parsed = jsonIn(reply) as Record<string, unknown> | null;
    unknownIdx.forEach((rowIdx) => {
      const n = texts.indexOf(norm1(input.rows[rowIdx]!.theme));
      const ids = parsed && Array.isArray(parsed[String(n)]) ? (parsed[String(n)] as unknown[]).filter((x): x is string => typeof x === "string" && activeIds.has(x)) : [];
      const uniq = [...new Set(ids)];
      if (uniq.length === 1) resolutions[rowIdx] = { kind: "theme", themeId: uniq[0]!, method: "model" };
      else if (uniq.length > 1) resolutions[rowIdx] = { kind: "ambiguous", candidates: uniq };
    });
  }
  input.rows.forEach((r, i) => {
    const res = resolutions[i]!;
    const text =
      recognised[i] ? `"${r.theme}" is a theme we recognise (${recognised[i]}), but we have no Qloo scores for it yet, so it is left alone.`
      : res.kind === "theme" ? `"${r.theme}" matched ${d.library.find((t) => t.id === res.themeId)?.label ?? res.themeId} (${res.method === "alias" ? "name list" : "model"}).`
      : res.kind === "classic" ? `"${r.theme}" is a classic night, so it is not scored.`
      : res.kind === "ambiguous" ? `"${r.theme}" fits more than one theme, so the director is asked to choose.`
      : `"${r.theme}" is not a theme we can place, so it is not scored.`;
    trace.push(step(at, "resolve", text));
  });

  // 2. Score the market.
  const scores = await getScores(d, input.market, trace);
  const themes = allOut(d, scores);
  trace.push(step(iso(d), "score", `Compared ${Object.keys(themes).length} library themes with ${d.reference.markets || "the"} reference ballpark markets${d.reference.synthetic ? " (synthetic placeholder reference)" : ""}.`));

  // 3. Flag.
  const nights: NightOut[] = input.rows.map((r, i) => {
    const res = resolutions[i]!;
    const themeId = res.kind === "theme" ? res.themeId : null;
    const sc = themeId ? themes[themeId] : undefined;
    const label: FitLabel = res.kind === "classic" ? "classic" : themeId ? (sc?.label ?? "not-scored") : "not-scored";
    return {
      index: i, line: r.line, date: r.date, weekday: weekdayName(r.date), theme: r.theme, sponsor: r.sponsor, locked: r.locked, notes: r.notes,
      resolution: res, candidates: res.kind === "ambiguous" ? res.candidates : [], themeId, label, z: sc?.index ?? null, recognisedAs: recognised[i] ?? null,
    };
  });
  const count = (l: FitLabel): number => nights.filter((n) => n.label === l).length;
  trace.push(step(iso(d), "score", `Flagged: ${count("leans-in")} lean in, ${count("average")} about average, ${count("leans-away")} lean away, ${count("not-scored")} not scored, ${count("classic")} classic.`));

  return {
    market: input.market, mode: d.mode, recordedOn: scores.source === "cache" ? scores.stored.fetchedAt.slice(0, 10) : null, recordedAt: scores.stored.fetchedAt, themes, nights,
    reference: { markets: d.reference.markets, synthetic: d.reference.synthetic, pulledAt: d.reference.pulledAt }, caps: await capsOf(d), trace,
  };
}

// ---------- propose ----------

function fitsOf(themes: Record<string, ThemeScoreOut>): Record<string, ThemeFit> {
  return Object.fromEntries(Object.entries(themes).map(([id, t]) => [id, { label: t.label, z: t.index, score: t.score }]));
}

/** The model words only the taste comparison. These words mean it wandered off the facts it was given. */
const OFF_FACTS = /\b(sponsors?|dates?|tickets?|sales|attendance|revenue|crowds?|fans? will|prefer(?:s|red|ence|ences)?|favou?rites?|best)\b/i;

export async function proposeSwaps(d: Deps, input: { market: MarketIn; nights: ProposeNightIn[]; allowDuplicates: boolean }): Promise<ProposeResponse> {
  const trace: TraceStep[] = [];
  const scores = await getScores(d, input.market, trace);
  const themes = allOut(d, scores);
  const discovery = await discover(d, input.market, trace);
  const city = input.market.label.split(",")[0]!.replace(/ (sample )?club$/, "");
  const nights: PlanNight[] = input.nights.map((n) => ({ ...n, themeId: n.themeId && Object.hasOwn(themes, n.themeId) ? n.themeId : null }));
  const res = propose({ nights, library: d.library, fits: fitsOf(themes), allowDuplicates: input.allowDuplicates, now: iso(d), discovered: discovery ? [...discovery.movies, ...discovery.shows].filter(worthASwap) : [], city });
  trace.push(...res.trace);

  const whys = new Map<string, string>();
  const libraryProposals = res.proposals.filter((p) => !p.discovered);
  if (libraryProposals.length > 0) {
    const label = (id: string): string => d.library.find((t) => t.id === id)?.label ?? id;
    const pairOf = (p: (typeof libraryProposals)[number]): string => `${label(p.fromThemeId)}>${label(p.toThemeId)}`;
    // The wording depends only on the two theme names, so it is cached by the sorted pairs and shared across markets.
    const key = `ai:why:v1:${await sha256Hex(libraryProposals.map(pairOf).sort().join("\n"))}`;
    const saved = await safeGet(d.kv, key);
    let byPair: Record<string, string> | null = null;
    if (saved !== null) {
      try {
        byPair = JSON.parse(saved) as Record<string, string>;
        trace.push(step(iso(d), "model", "Writing the reasons for the swaps: used the saved wording (no model call)."));
      } catch {
        byPair = null;
      }
    }
    if (byPair === null) {
      byPair = {};
      // Opaque ids: the real ones contain the date, which the model has no business seeing.
      const facts = libraryProposals.map((p, i) => ({ id: String(i + 1), planned: label(p.fromThemeId), proposed: label(p.toThemeId) }));
      const reply = await runModel(
        d,
        "For each swap write ONE sentence of at most 22 words, in this shape: \"Fans here lean toward <proposed> more than <planned>, compared with this market's usual.\" Use only the two theme names given. No digits. Never mention sponsors, dates, tickets, sales, attendance or revenue. Reply with JSON only: [{\"id\": string, \"why\": string}].",
        JSON.stringify(facts),
        trace,
        "Writing the reasons for the swaps",
        300,
      );
      const parsed = jsonIn(reply);
      if (Array.isArray(parsed)) {
        for (const item of parsed as Array<{ id?: unknown; why?: unknown }>) {
          if (typeof item?.id !== "string" || typeof item.why !== "string") continue;
          const p = libraryProposals[Number(item.id) - 1];
          const text = item.why.trim();
          if (p && text.length > 0 && text.length <= 220 && numbersAreGrounded(text, []) && !claimsOutcome(text) && !OFF_FACTS.test(text)) byPair[pairOf(p)] = text;
          else trace.push(step(iso(d), "model", `Dropped the model's reason for swap ${item.id}: it went beyond the taste comparison, so the template text is used.`));
        }
      }
      // Only a real reply is saved, good or not, so the same swaps never ask the model twice. A skipped call (no model, cap) is not.
      if (reply !== null) await safePut(d.kv, key, JSON.stringify(byPair), { expirationTtl: TTL });
    }
    for (const p of libraryProposals) {
      const text = byPair[pairOf(p)];
      // The code, not the model, says what stays: the date and the sponsor always do.
      if (typeof text === "string" && text.length > 0) whys.set(p.id, `${/[.!?]$/.test(text) ? text : `${text}.`} ${p.sponsor ? "The date and sponsor stay the same." : "The date stays the same."}`);
    }
  }
  return {
    proposals: res.proposals.map((p) => ({ ...p, why: whys.get(p.id) ?? p.why, whySource: whys.has(p.id) ? "model" : "template" })),
    discovery, angles: await tasteAngles(d, input.market, res.angles, nights, trace), unfixed: res.unfixed, trace, caps: await capsOf(d),
  };
}

// ---------- re-check ----------

export async function recheck(d: Deps, input: { market: MarketIn; themeId: string }): Promise<RecheckResponse> {
  const trace: TraceStep[] = [];
  const theme = d.library.find((t) => t.id === input.themeId);
  if (!theme) throw new Error(`Unknown theme ${input.themeId}`);
  // One live re-check per market and theme per day: a repeat returns the answer already on file.
  const rcKey = `rc:v1:${marketKey(input.market)}:${theme.id}`;
  if ((await safeGet(d.kv, rcKey)) !== null) {
    const scores = await getScores(d, input.market, trace);
    const all = allOut(d, scores);
    trace.push(step(iso(d), "note", `Re-check ${theme.label}: checked with Qloo within the last day, so the saved answer is returned.`));
    return { theme: all[theme.id]!, themes: all, trace, caps: await capsOf(d), withinDay: true };
  }
  if (d.gate && !(await d.gate.allow("recheck"))) throw new QuotaError("recheck");
  const need = new Set(theme.entities.map((e) => e.type)).size;
  if (!(await reserveQloo(d, need))) throw new CappedError();
  trace.push(step(iso(d), "note", `Re-checking ${theme.label} live, ignoring the recorded result.`));
  const fresh = (await askQloo(d, input.market, [theme], trace))[theme.id]!;
  // The market's own average moves when one theme is re-read, so every index is recomputed from the updated record.
  const scores = await getScores(d, input.market, trace);
  scores.stored.themes[theme.id] = fresh;
  await safePut(d.kv, cacheKey(d, input.market), JSON.stringify(scores.stored), { expirationTtl: TTL });
  await safePut(d.kv, rcKey, iso(d), { expirationTtl: 86400 });
  const all = allOut(d, scores);
  const out = all[theme.id]!;
  if (d.mode !== "synthetic") out.source = "live";
  return { theme: out, themes: all, trace, caps: await capsOf(d) };
}
