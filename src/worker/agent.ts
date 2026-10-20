import type { ActsOut, AnalyzeResponse, Caps, DiscoveryOut, MarketIn, NightOut, ProposeNightIn, ProposeResponse, RecheckResponse, ThemeScoreOut } from "../app/api-types";
import { weekdayName, type CalendarRow } from "../app/calendar/csv";
import { resolveTheme, type Resolution } from "../app/calendar/resolve";
import { matchPoolTitle } from "../app/calendar/pooltitle";
import { claimsOutcome, numbersAreGrounded } from "../app/guard";
import type { QuotaKind } from "./limits";
import { safeGet, safePut, sha256Hex } from "./safe";
import { marketKey } from "../app/markets";
import { angleText, categoryGroup, pickAngles, propose, type AngleOption, type Discovered, type PlanNight, type SponsorAngle, type ThemeFit } from "../app/propose/propose";
import { audienceBand, audienceFit, inWindow } from "../app/propose/rules";
import { shortDate } from "../app/dates";
import { bundleScore, centre, fitFor, labelForZ, type FitLabel, type ReferenceStats } from "../app/score";
import { idsOfType, type LiveTheme } from "../app/themes/ids";
import { THEME_LIBRARY } from "../app/themes/library";
import { VENUE_CLASSIC_PHRASES, VENUE_LIBRARY } from "../app/themes/artists";
import { ACT_POPULARITY, ACTS_REFERENCE, actBatches, rankActs, worthABooking, type ActsReference } from "../app/acts";
import { cityOfLabel, copyFor, type Kind } from "../app/kind";
import { TIER_RANK, type Genre, type Tier } from "../app/themes/library";
import { DISCOVERY_REFERENCE, IDEA_POPULARITY, poolOffset, rankPool, standsOut, SWAP_POPULARITY, type DiscoveryReference } from "../app/discovery";
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
  /** Set during a request when a usage counter could not be read or written: no live call is made after that. */
  countersDown?: boolean;
  /** "venue" for a concert venue run (see forKind). Anything else is a club run, exactly as before venue mode existed. */
  kind?: Kind;
  /** The library a venue run scores: the music themes plus the artist themes. */
  venueLibrary?: LiveTheme[];
  /** The touring-act pool and its reference spread. Defaults to the committed one; synthetic mode and tests pass their own. */
  actsRef?: ActsReference;
  /** Per-client daily allowance, set per request by the router. Unset means no per-client limit (tests). */
  gate?: Gate;
}

/** Counts one use of a per-client daily allowance and says whether it was still available. */
export interface Gate {
  allow(kind: QuotaKind): Promise<boolean>;
  /** Set when a refusal was because the client's counter could not be read or written (not because the allowance is used up). */
  broken?: boolean;
}

/** Thrown when this client's daily allowance for live lookups is used up. */
export class QuotaError extends Error {
  constructor(readonly kind: QuotaKind) {
    super("This client's daily allowance is used up.");
  }
}

/** Thrown when a live Qloo call is needed and today's cap is spent. */
export class CappedError extends Error {
  constructor(readonly countersDown = false) {
    super(countersDown ? "The usage counters are unavailable." : "Today's live Qloo allowance is used up.");
  }
}

/** The deps for one kind of run: a venue run scores the venue library, a club run is the deps as given. */
export function forKind(d: Deps, kind: Kind): Deps {
  return kind === "venue" ? { ...d, kind: "venue", library: d.venueLibrary ?? [] } : d;
}

const RADIUS_M = 80_000;
const TTL = 60 * 24 * 3600;
const iso = (d: Deps): string => d.now().toISOString();
const today = (d: Deps): string => iso(d).slice(0, 10);

// ---------- daily counters ----------

/** A usage counter could not be read or written (KV outage, or the daily write limit on a free plan). */
export class CounterError extends Error {}

/**
 * The counters are what keep the shared Qloo and model caps honest, so they fail CLOSED: when one cannot be read or written, no further live
 * Qloo or model call is made for the request, and the answer comes from recorded results or template text. (Content caches stay fail-open.)
 */
async function counter(d: Deps, name: string): Promise<number> {
  let raw: string | null;
  try {
    raw = await d.kv.get(`cap:${name}:${today(d)}`);
  } catch (err) {
    console.error("counter read failed", name, err instanceof Error ? err.message : String(err));
    throw new CounterError();
  }
  const n = raw === null ? 0 : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function bump(d: Deps, name: string, by: number): Promise<void> {
  const next = String((await counter(d, name)) + by);
  try {
    await d.kv.put(`cap:${name}:${today(d)}`, next, { expirationTtl: 2 * 24 * 3600 });
  } catch (err) {
    console.error("counter write failed", name, err instanceof Error ? err.message : String(err));
    throw new CounterError();
  }
}

export async function capsOf(d: Deps): Promise<Caps> {
  try {
    const used = await counter(d, "qloo");
    const qlooRemaining = Math.max(0, d.qlooDailyCap - used);
    const aiUsed = await counter(d, "ai");
    return { qlooRemaining, qlooCap: d.qlooDailyCap, recheckDisabled: d.mode === "live" && qlooRemaining < 3, aiRemaining: d.ai ? Math.max(0, d.aiDailyCap - aiUsed) : 0 };
  } catch (err) {
    if (!(err instanceof CounterError)) throw err;
    return { qlooRemaining: 0, qlooCap: d.qlooDailyCap, recheckDisabled: d.mode === "live", aiRemaining: 0 };
  }
}

/** Reserves `n` live Qloo calls against the shared cap. False when the cap is spent or when the counters cannot be trusted (then `d.countersDown` is set). */
async function reserveQloo(d: Deps, n: number, trace?: TraceStep[]): Promise<boolean> {
  if (d.mode === "synthetic") return true;
  try {
    if ((await counter(d, "qloo")) + n > d.qlooDailyCap) return false;
    await bump(d, "qloo", n);
    return true;
  } catch (err) {
    if (!(err instanceof CounterError)) throw err;
    d.countersDown = true;
    trace?.push(step(iso(d), "qloo", "The usage counters are unavailable right now, so no live Qloo request is made. Recorded results are used where there are any."));
    return false;
  }
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
    trace.push(step(iso(d), "qloo", `Asked Qloo about ${ids.length} ${type.replace("_", " ")} item${ids.length === 1 ? "" : "s"} around the town (80 km).`, `Live call at ${iso(d)}. ${got} of ${ids.length} came back with a reading.${d.mode === "synthetic" ? " SYNTHETIC test data, not Qloo." : ""}`));
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
        trace.push(step(iso(d), "qloo", "Used the saved ratings for this town (no new Qloo call).", `Cached, recorded ${stored.fetchedAt}.`));
        return { stored, source: "cache" };
      }
    } catch {
      /* fall through to a fresh pull */
    }
  }
  const need = new Set(d.library.flatMap((t) => t.entities.map((e) => e.type))).size;
  if (d.gate && !(await d.gate.allow("pull"))) throw d.gate.broken ? new CappedError(true) : new QuotaError("pull");
  if (!(await reserveQloo(d, need, trace))) throw new CappedError(d.countersDown === true);
  const themes = await askQloo(d, m, d.library, trace);
  const stored: StoredLibrary = { v: 1, fetchedAt: iso(d), themes };
  await safePut(d.kv, key, JSON.stringify(stored), { expirationTtl: TTL });
  return { stored, source: "live" };
}

function toOut(d: Deps, id: string, st: StoredTheme, source: ThemeScoreOut["source"]): ThemeScoreOut {
  const score = bundleScore(st.entities.map((e) => e.affinity));
  const ref = d.reference.themes[id];
  const fit = fitFor(score, ref, d.kind);
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
        o.reason = "Too few themes had data in this town to compare one theme with its other themes.";
      } else o.label = labelForZ(o.index);
    }
  });
  return Object.fromEntries(list.map((o) => [o.themeId, o]));
}

// ---------- taste graph: what fans of a locked night's theme near the ballpark also lean toward ----------

interface StoredTaste {
  v: 2;
  fetchedAt: string;
  /** Candidate ids with their affinity among fans of the locked theme here, best first. */
  ranked: Array<{ themeId: string; affinity: number }>;
}

/** One request makes at most this many live taste-graph lookups; the rest use recorded answers or the generic wording. A client also has a daily quota (`taste`). */
export const MAX_LIVE_TASTE = 5;

interface TasteRun {
  live: number;
  /** Lookups already settled in this request, by cache key: the same headliner on two nights is one lookup. */
  memo: Map<string, StoredTaste | null>;
}

interface TasteSpec {
  /** Depends only on the market, the headliner (theme) and the kind of run, never on the calendar. */
  key: string;
  label: string;
  city: string;
  type: QlooType;
  /** A fixed candidate set for this headliner, at most 50. Calendar-dependent filtering happens after the answer is read. */
  cands: Array<{ ref: string; id: string }>;
  interestIds: string[];
  what: string;
}

async function tasteRanked(d: Deps, m: MarketIn, run: TasteRun, trace: TraceStep[], spec: TasteSpec): Promise<StoredTaste | null> {
  const settle = (v: StoredTaste | null): StoredTaste | null => (run.memo.set(spec.key, v), v);
  if (run.memo.has(spec.key)) return run.memo.get(spec.key) ?? null;
  const hit = await safeGet(d.kv, spec.key);
  if (hit) {
    try {
      const s = JSON.parse(hit) as StoredTaste;
      if (s.v === 2) {
        trace.push(step(iso(d), "qloo", `Used the saved taste graph for fans of ${spec.label} near ${spec.city} (no new Qloo call).`, `Cached, recorded ${s.fetchedAt}.`));
        return settle(s);
      }
    } catch {
      /* fall through to a live lookup */
    }
  }
  if (run.live >= MAX_LIVE_TASTE) {
    trace.push(step(iso(d), "qloo", `Skipped the taste graph for ${spec.label}: at most ${MAX_LIVE_TASTE} live taste lookups are made per request, so the wording stays generic until it is recorded.`));
    return settle(null);
  }
  if ((d.gate && !(await d.gate.allow("taste"))) || !(await reserveQloo(d, 1, trace))) {
    trace.push(step(iso(d), "qloo", `Skipped the taste graph for ${spec.label}: the daily allowance is used up or could not be checked, so the wording stays generic.`));
    return settle(null);
  }
  try {
    const client = createQlooClient({ baseUrl: d.qlooBase, apiKey: d.qlooKey, fetchImpl: d.qlooFetch, delayMs: d.qlooDelayMs, maxTries: 3, sleep: d.qlooDelayMs === 0 ? async () => undefined : undefined });
    run.live++;
    const rows = await client.localAffinity({ type: spec.type, entityIds: spec.cands.map((c) => c.id), interestIds: spec.interestIds, lon: m.lon, lat: m.lat, radiusM: RADIUS_M, take: spec.cands.length, ...(spec.type === "movie" ? { releaseYearMin: 1900 } : {}) });
    const byId = new Map(rows.map((r) => [r.entityId, r.affinity]));
    const ranked = spec.cands.flatMap((c) => {
      const a = byId.get(c.id);
      return typeof a === "number" ? [{ themeId: c.ref, affinity: a }] : [];
    }).sort((x, y) => y.affinity - x.affinity || x.themeId.localeCompare(y.themeId));
    const stored: StoredTaste = { v: 2, fetchedAt: iso(d), ranked };
    await safePut(d.kv, spec.key, JSON.stringify(stored), { expirationTtl: TTL });
    trace.push(step(iso(d), "qloo", `Asked Qloo what fans of ${spec.label} near ${spec.city} also like, among ${spec.cands.length} ${spec.what} (taste graph, one call).`, `Live call at ${iso(d)}. ${ranked.length} came back with a reading.${d.mode === "synthetic" ? " SYNTHETIC test data, not Qloo." : ""}`));
    return settle(stored);
  } catch (err) {
    console.error("taste graph failed", err instanceof Error ? err.message : String(err));
    trace.push(step(iso(d), "qloo", `The taste graph for ${spec.label} was not available right now, so the wording stays generic.`));
    return settle(null);
  }
}

/**
 * A locked night cannot change, so it gets a sponsor-friendly touch chosen with Qloo's taste graph: what fans of the locked theme near the ballpark
 * also lean toward (signal.interests.entities). The lookup is keyed on the market and the theme only and asks about a FIXED set (every library theme
 * with an entity of the same type), so changing something else on the calendar never makes a new live call. The calendar's rules (themes already on
 * it, the date window, the audience, same kind first) are applied to the stored answer afterwards. Without an answer, the generic angle stays.
 */
async function tasteAngles(d: Deps, m: MarketIn, angles: SponsorAngle[], nights: PlanNight[], trace: TraceStep[]): Promise<SponsorAngle[]> {
  if (angles.length === 0) return angles;
  const city = m.label.split(",")[0]!.replace(/ (sample )?club$/, "");
  const used = new Set(nights.map((n) => n.themeId).filter((x): x is string => x !== null));
  const sig = signature(d.library);
  const run: TasteRun = { live: 0, memo: new Map() };
  const out: SponsorAngle[] = [];
  for (const angle of angles) {
    const original = d.library.find((t) => t.id === angle.themeId);
    const night = nights.find((n) => n.index === angle.index);
    const type = original?.entities[0]?.type;
    if (!original || !night || !type) {
      out.push(angle);
      continue;
    }
    const all = d.library.filter((t) => t.id !== original.id && t.entities.some((e) => e.type === type)).slice(0, 50);
    if (all.length < 1) {
      out.push(angle);
      continue;
    }
    const stored = await tasteRanked(d, m, run, trace, {
      key: `tg:v2:club:${sig}:${marketKey(m)}:${original.id}`, label: original.label, city, type, what: all.length === 1 ? "theme" : "themes",
      cands: all.map((t) => ({ ref: t.id, id: t.entities.find((e) => e.type === type)!.id })), interestIds: original.entities.map((e) => e.id),
    });
    if (!stored) {
      out.push(angle);
      continue;
    }
    const slot = { date: night.date, notes: night.notes };
    const usable = (t: (typeof d.library)[number]): boolean => !used.has(t.id) && audienceBand(t.audience) === audienceBand(original.audience) && audienceFit(original, t, slot) && inWindow(night.date, t.window);
    // Same kind of theme first; if there is none, any theme for the same audience.
    const ranked = stored.ranked.flatMap((r) => {
      const t = d.library.find((x) => x.id === r.themeId);
      return t && usable(t) ? [t] : [];
    });
    const sameKind = ranked.filter((t) => categoryGroup(t.category) === categoryGroup(original.category));
    const who = angle.sponsor || "the sponsor";
    const options: AngleOption[] = (sameKind.length > 0 ? sameKind : ranked).slice(0, 10).map((t) => ({ toThemeId: t.id, text: `${original.label} on ${shortDate(angle.date)} is locked, so it stays exactly as planned. Fans of ${original.label} near ${city} also like ${t.label}, so if ${who} is open to it, a small ${t.label} touch (walk-up songs, PA clips or a photo spot) fits the night.` }));
    if (options.length === 0) {
      out.push(angle);
      continue;
    }
    out.push({ ...angle, toThemeId: options[0]!.toThemeId, text: options[0]!.text, options, generic: angleText(night, original, null) });
  }
  return out;
}

// ---------- discovery: which family titles stand out near the ballpark ----------

interface StoredDiscovery {
  v: 2;
  /** Every scored pool title (centred z), kept so a night named after one can be scored from it. */
  all: Discovered[];
  fetchedAt: string;
  movies: Discovered[];
  shows: Discovered[];
  scored: number;
  poolSize: number;
}

const discoveryKey = (d: Deps, m: MarketIn): string => {
  const ref = d.discoveryRef ?? DISCOVERY_REFERENCE;
  return `disc:v6:${signature(d.library)}:${ref.pool.length}:${ref.pulledAt ?? "syn"}:${d.mode}:${marketKey(m)}`;
};

/**
 * Two calls score a fixed pool of family-friendly animated titles at this market (filter.results.entities), and each title is
 * ranked by how far its reading sits above its own spread over the 40 reference markets. Returns null, never throws, when
 * discovery is unavailable: swaps then use library themes only.
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
      if (s.v === 2) {
        trace.push(step(iso(d), "qloo", `Used the saved family-title scores near ${city} (no new Qloo call).`, `Cached, recorded ${s.fetchedAt}.`));
        return { all: s.all, movies: s.movies, shows: s.shows, scored: s.scored, poolSize: s.poolSize, source: d.mode === "synthetic" ? "synthetic" : "cache", fetchedAt: s.fetchedAt };
      }
    } catch {
      /* fall through to a fresh pull */
    }
  }
  if (!(await reserveQloo(d, 2, trace))) {
    trace.push(step(iso(d), "qloo", `Skipped the family titles near ${city}: today's Qloo allowance is used up.`));
    return null;
  }
  try {
    const client = createQlooClient({ baseUrl: d.qlooBase, apiKey: d.qlooKey, fetchImpl: d.qlooFetch, delayMs: d.qlooDelayMs, maxTries: 3, sleep: d.qlooDelayMs === 0 ? async () => undefined : undefined });
    const synthetic = d.mode === "synthetic" ? " SYNTHETIC test data, not Qloo." : "";
    const ranked: Record<"movie" | "tv_show", Discovered[]> = { movie: [], tv_show: [] };
    const readings = new Map<string, number | null>();
    for (const type of ["movie", "tv_show"] as const) {
      const ids = ref.pool.filter((p) => p.type === type).map((p) => p.entityId);
      const rows = await client.localAffinity({ type, entityIds: ids, lon: m.lon, lat: m.lat, radiusM: RADIUS_M, take: ids.length, ...(type === "movie" ? { releaseYearMin: 1900 } : {}) });
      for (const r of rows) readings.set(r.entityId, r.affinity);
    }
    // Centre each title's z on this market's own average over the whole pool, like the library index.
    const offset = poolOffset(readings, ref.pool, ref.stats);
    let scored = 0;
    const everything: Discovered[] = [];
    for (const type of ["movie", "tv_show"] as const) {
      const all = rankPool(readings, ref, type, offset);
      scored += all.length;
      everything.push(...all);
      ranked[type] = all.filter((x) => x.major === true && (x.popularity ?? 0) >= IDEA_POPULARITY).slice(0, 12);
      const n = ref.pool.filter((p) => p.type === type).length;
      trace.push(step(iso(d), "qloo", `Asked Qloo about ${n} family-friendly animated ${type === "movie" ? "movies" : "shows"} near ${city} (80 km), and compared each with how much people in ${ref.markets} other towns like it, then with this town's own average over the pool.`, `Live call at ${iso(d)}. Qloo had local data for ${all.length} of ${n}. ${all.filter(standsOut).length} stand out here.${synthetic}`));
    }
    const stored: StoredDiscovery = { v: 2, all: everything.map((x) => ({ name: x.name, entityId: x.entityId, type: x.type, affinity: x.affinity, z: x.z, zRaw: x.zRaw, popularity: x.popularity, ...(x.major ? { major: true } : {}) })), fetchedAt: iso(d), movies: ranked.movie, shows: ranked.tv_show, scored, poolSize: ref.pool.length };
    await safePut(d.kv, key, JSON.stringify(stored), { expirationTtl: TTL });
    return { all: stored.all, movies: stored.movies, shows: stored.shows, scored, poolSize: ref.pool.length, source: d.mode === "synthetic" ? "synthetic" : "live", fetchedAt: stored.fetchedAt };
  } catch (err) {
    console.error("discovery failed", err instanceof Error ? err.message : String(err));
    trace.push(step(iso(d), "qloo", `Family titles near ${city} were not available right now, so swaps use only the themes on our list.`));
    return null;
  }
}

/** The discovery result without its server-side full list. */
function publicDiscovery(d: DiscoveryOut): DiscoveryOut {
  const out = { ...d };
  delete out.all;
  return out;
}

// ---------- venue runs: acts that stand out near the venue, and a support act for each locked headliner ----------

interface StoredActs {
  v: 1;
  fetchedAt: string;
  acts: Discovered[];
  scored: number;
  poolSize: number;
}

const actsKey = (d: Deps, m: MarketIn): string => {
  const ref = d.actsRef ?? ACTS_REFERENCE;
  return `acts:v2:${signature(d.library)}:${ref.pool.length}:${ref.pulledAt ?? "syn"}:${d.mode}:${marketKey(m)}`;
};

/**
 * Venue runs. One request per 50 pool acts (two for the 57-act pool) scores the fixed pool of touring acts at this market
 * (filter.results.entities), and each act is ranked by how far its reading sits above its own spread over the 40 reference markets.
 * Returns null, never throws, when unavailable: swaps then use library themes only.
 */
export async function discoverActs(d: Deps, m: MarketIn, trace: TraceStep[]): Promise<ActsOut | null> {
  const city = cityOfLabel(m.label);
  const ref = d.actsRef ?? ACTS_REFERENCE;
  if (ref.pool.length === 0) {
    trace.push(step(iso(d), "qloo", `Skipped the touring acts near ${city}: no act pool is loaded.`));
    return null;
  }
  const key = actsKey(d, m);
  const hit = await safeGet(d.kv, key);
  if (hit) {
    try {
      const s = JSON.parse(hit) as StoredActs;
      if (s.v === 1) {
        trace.push(step(iso(d), "qloo", `Used the saved touring-act scores near ${city} (no new Qloo call).`, `Cached, recorded ${s.fetchedAt}.`));
        return { acts: s.acts, scored: s.scored, poolSize: s.poolSize, source: d.mode === "synthetic" ? "synthetic" : "cache", fetchedAt: s.fetchedAt };
      }
    } catch {
      /* fall through to a fresh pull */
    }
  }
  const batches = actBatches(ref.pool);
  if (!(await reserveQloo(d, batches.length, trace))) {
    trace.push(step(iso(d), "qloo", `Skipped the touring acts near ${city}: today's Qloo allowance is used up.`));
    return null;
  }
  try {
    const client = createQlooClient({ baseUrl: d.qlooBase, apiKey: d.qlooKey, fetchImpl: d.qlooFetch, delayMs: d.qlooDelayMs, maxTries: 3, sleep: d.qlooDelayMs === 0 ? async () => undefined : undefined });
    const readings = new Map<string, number | null>();
    for (const ids of batches) {
      const rows = await client.localAffinity({ type: "artist", entityIds: ids, lon: m.lon, lat: m.lat, radiusM: RADIUS_M, take: ids.length });
      for (const r of rows) readings.set(r.entityId, r.affinity);
    }
    const ranked = rankActs(readings, ref);
    const stored: StoredActs = { v: 1, fetchedAt: iso(d), acts: ranked.filter((x) => (x.popularity ?? 0) >= ACT_POPULARITY).slice(0, 15), scored: ranked.length, poolSize: ref.pool.length };
    await safePut(d.kv, key, JSON.stringify(stored), { expirationTtl: TTL });
    trace.push(step(iso(d), "qloo", `Asked Qloo about ${ref.pool.length} touring acts near ${city} (80 km, ${batches.length} request${batches.length === 1 ? "" : "s"}), and compared each with its spread over ${ref.markets} other cities.`, `Live call at ${iso(d)}. Qloo had local data for ${ranked.length} of ${ref.pool.length}. ${ranked.filter((x) => worthABooking(x)).length} stand out here and are well known.${d.mode === "synthetic" ? " SYNTHETIC test data, not Qloo." : ""}`));
    return { acts: stored.acts, scored: stored.scored, poolSize: stored.poolSize, source: d.mode === "synthetic" ? "synthetic" : "live", fetchedAt: stored.fetchedAt };
  } catch (err) {
    console.error("touring acts failed", err instanceof Error ? err.message : String(err));
    trace.push(step(iso(d), "qloo", `Touring acts near ${city} were not available right now, so swaps use only the themes on our list.`));
    return null;
  }
}

interface ActCandidate {
  /** A library theme id, or `qloo:<id>` for a pool act. */
  ref: string;
  id: string;
  label: string;
  genre: Genre | undefined;
  discovered: boolean;
  touring: boolean;
  tier: Tier | undefined;
}

/**
 * A locked headliner cannot change, so it gets a support-act idea from the taste graph: the affinities of candidate acts among fans of the headliner
 * near the venue (signal.interests.entities). A support act must still tour and sit at least one declared booking tier below the headliner. The lookup
 * is keyed on the market and the headliner only and asks about a FIXED candidate set (the headliner's own genre first, 50 at most), never one that
 * depends on the calendar: acts already on the calendar or already a proposed swap are removed from the stored answer afterwards. When no act
 * qualifies as support, the same kind of call still finds what the fans lean toward, worded as a promo tie-in, never as a support act. Without an
 * answer, the generic sponsor angle stays.
 */
async function supportActAngles(d: Deps, m: MarketIn, angles: SponsorAngle[], nights: PlanNight[], trace: TraceStep[]): Promise<SponsorAngle[]> {
  if (angles.length === 0) return angles;
  const city = cityOfLabel(m.label);
  const ref = d.actsRef ?? ACTS_REFERENCE;
  const pool = ref.pool;
  const used = new Set(nights.map((n) => n.themeId).filter((x): x is string => x !== null));
  const libraryIds = new Set(d.library.flatMap((t) => t.entities.map((e) => e.id)));
  const sig = signature(d.library);
  const run: TasteRun = { live: 0, memo: new Map() };
  const out: SponsorAngle[] = [];
  for (const angle of angles) {
    const original = d.library.find((t) => t.id === angle.themeId);
    if (!original) {
      out.push(angle);
      continue;
    }
    const headIds = new Set(original.entities.map((e) => e.id));
    const headTier = original.tier;
    const everyone: ActCandidate[] = [
      ...d.library.filter((t) => t.id !== original.id && t.entities.length === 1 && t.entities[0]!.type === "artist" && !headIds.has(t.entities[0]!.id)).map((t) => ({ ref: t.id, id: t.entities[0]!.id, label: t.label, genre: t.genre, discovered: false, touring: t.touring !== false, tier: t.tier })),
      ...pool.filter((p) => !libraryIds.has(p.entityId) && !headIds.has(p.entityId)).map((p) => ({ ref: `qloo:${p.entityId}`, id: p.entityId, label: p.name, genre: p.genre as Genre | undefined, discovered: true, touring: true, tier: p.tier })),
    ];
    const support = everyone.filter((c) => c.touring && (headTier !== undefined && c.tier !== undefined && TIER_RANK[c.tier] <= TIER_RANK[headTier] - 1));
    const promo = support.length === 0;
    const all = promo ? everyone : support;
    const same = all.filter((c) => original.genre !== undefined && c.genre === original.genre);
    const cands = (same.length >= 4 ? same : [...same, ...all.filter((c) => !same.includes(c))]).slice(0, 50);
    if (cands.length < 1) {
      out.push(angle);
      continue;
    }
    const stored = await tasteRanked(d, m, run, trace, {
      key: `tg:v2:venue:${sig}:${ref.pool.length}:${ref.pulledAt ?? "syn"}:${marketKey(m)}:${original.id}`, label: original.label, city, type: "artist",
      what: `acts${same.length >= 4 ? " in the same genre" : ""}`, cands: cands.map((c) => ({ ref: c.ref, id: c.id })), interestIds: original.entities.map((e) => e.id),
    });
    if (!stored) {
      out.push(angle);
      continue;
    }
    const who = angle.sponsor || "the sponsor";
    const options: AngleOption[] = stored.ranked.flatMap((r) => {
      const c = all.find((x) => x.ref === r.themeId);
      if (!c || used.has(c.ref)) return []; // an act already on the calendar cannot open for another date
      const text = promo
        ? `${original.label} on ${shortDate(angle.date)} is locked, so it stays exactly as planned. Fans of ${original.label} near ${city} also like ${c.label}, so a pre-show playlist or promo tie-in could work for ${who}.`
        : `${original.label} on ${shortDate(angle.date)} is locked, so it stays exactly as planned. Support act idea: fans of ${original.label} near ${city} also like ${c.label}, so an act like ${c.label} could fit the opening slot.`;
      return [{ toThemeId: c.ref, text, act: { name: c.label, discovered: c.discovered } }];
    }).slice(0, 10);
    if (options.length === 0) {
      out.push(angle);
      continue;
    }
    out.push({ ...angle, toThemeId: options[0]!.toThemeId, text: options[0]!.text, ...(options[0]!.act ? { act: options[0]!.act } : {}), options, generic: angle.text });
  }
  return out;
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

export async function runModel(d: Deps, system: string, user: string, trace: TraceStep[], what: string, maxTokens = 900, fallback = "template text is used"): Promise<string | null> {
  if (!d.ai) {
    trace.push(step(iso(d), "model", `${what}: no model attached here, so ${fallback}.`));
    return null;
  }
  try {
    if ((await counter(d, "ai")) >= d.aiDailyCap) {
      trace.push(step(iso(d), "model", `${what}: today's shared model budget is spent, so ${fallback}.`));
      return null;
    }
  } catch (err) {
    if (!(err instanceof CounterError)) throw err;
    trace.push(step(iso(d), "model", `${what}: the usage counters are unavailable, so ${fallback}.`));
    return null;
  }
  if (d.gate && !(await d.gate.allow("model"))) {
    trace.push(step(iso(d), "model", `${what}: your daily limit of model calls is spent, so ${fallback}.`));
    return null;
  }
  try {
    await bump(d, "ai", 1);
  } catch (err) {
    if (!(err instanceof CounterError)) throw err;
    trace.push(step(iso(d), "model", `${what}: the usage counters are unavailable, so ${fallback}.`));
    return null;
  }
  const limit = d.aiTimeoutMs ?? 6000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = d.ai.run(AI_MODEL, { messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.1, max_tokens: maxTokens });
    call.catch(() => undefined); // a late failure after the timeout must not surface
    const res = await Promise.race([call, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ModelTimeout()), limit); })]);
    const text = replyText(res);
    trace.push(step(iso(d), "model", text === null ? `${what}: the model's reply couldn't be used, so ${fallback}.` : `${what}: the model replied.`));
    return text;
  } catch (err) {
    if (err instanceof ModelTimeout) trace.push(step(iso(d), "model", `${what}: the model took too long (over ${Math.round(limit / 1000)} seconds), so ${fallback}.`));
    else {
      console.error("model call failed", err instanceof Error ? err.message : String(err));
      trace.push(step(iso(d), "model", `${what}: the model call failed, so ${fallback}.`));
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
  const venue = d.kind === "venue";
  const W = copyFor(venue ? "venue" : "club");
  trace.push(step(at, "note", `Read ${input.rows.length} ${W.nights} for ${input.market.label}.`));
  const activeIds = new Set(d.library.map((t) => t.id));
  const known = venue ? VENUE_LIBRARY : THEME_LIBRARY;
  const extraClassic = venue ? VENUE_CLASSIC_PHRASES : [];

  // 1. Resolve: alias table first, then (only for text the table cannot place) one batched model call.
  const resolutions: Resolution[] = input.rows.map((r) => resolveTheme(r.theme, d.library, extraClassic));
  // A name the whole library knows but the live library cannot score (no Qloo id, or no local signal): recognised, left alone.
  const recognised: Array<string | null> = input.rows.map((r, i) => {
    if (resolutions[i]!.kind === "theme" || resolutions[i]!.kind === "ambiguous") return null;
    const full = resolveTheme(r.theme, known, extraClassic);
    return full.kind === "theme" && !activeIds.has(full.themeId) ? known.find((t) => t.id === full.themeId)!.label : null;
  });
  // A club night named after a family-title pool entry ("Lion King Night") is scored from that title's own reading, with the pool's reference spread.
  if (!venue) {
    const poolNames = (d.discoveryRef ?? DISCOVERY_REFERENCE).pool;
    input.rows.forEach((r, i) => {
      if (resolutions[i]!.kind !== "unknown" || recognised[i] !== null) return;
      const hit = matchPoolTitle(r.theme, poolNames);
      if (hit) resolutions[i] = { kind: "pool", entityId: hit.entityId, name: hit.name };
    });
  }
  const unknownIdx = resolutions.flatMap((r, i) => (r.kind === "unknown" && recognised[i] === null ? [i] : []));
  if (unknownIdx.length > 0 && d.ai) {
    // Same unknown names, same answer: the reply is cached by the sorted, normalised texts, so a repeat costs no model call.
    const norm1 = (t: string): string => t.toLowerCase().replace(/\s+/g, " ").trim();
    const texts = [...new Set(unknownIdx.map((i) => norm1(input.rows[i]!.theme)))].sort();
    const key = `ai:res:v1:${venue ? "venue:" : ""}${await sha256Hex(texts.join("\n"))}`;
    let reply = await safeGet(d.kv, key);
    if (reply !== null) trace.push(step(iso(d), "model", "Matching unrecognised theme names: used the saved answer (no model call)."));
    else {
      const list = d.library.map((t) => `${t.id}: ${t.label}`).join("\n");
      reply = await runModel(
        d,
        venue
          ? "You match concert venue date names to a fixed list of touring artists and music nights. Answer with JSON only: an object mapping each number to an array of theme ids. Use an empty array unless the text clearly names that artist or music night. Never guess. Never invent ids."
          : "You match minor league baseball promotion names to a fixed list of pop-culture themes. Answer with JSON only: an object mapping each number to an array of theme ids. Use an empty array unless the text clearly names that franchise, show, film, game, brand or artist. Never guess. Never invent ids.",
        `Themes:\n${list}\n\nTexts:\n${texts.map((t, n) => `${n}: ${t}`).join("\n")}`,
        trace,
        "Matching unrecognised theme names",
        600,
        "those names stay unscored",
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
      : res.kind === "pool" ? `"${r.theme}" is the family title ${res.name}: rated from its own local data, not from one of our themes.`
      : res.kind === "classic" ? `"${r.theme}" is a proven promo, so it is not graded.`
      : res.kind === "ambiguous" ? `"${r.theme}" fits more than one theme, so the director is asked to choose.`
      : `"${r.theme}" is not a theme we can place, so there is no data for it.`;
    trace.push(step(at, "resolve", text));
  });

  // 2. Score the market.
  const scores = await getScores(d, input.market, trace);
  const themes = allOut(d, scores);
  trace.push(step(iso(d), "score", venue
    ? `Compared ${Object.keys(themes).length} artist and music themes with ${d.reference.markets || "the"} other cities${d.reference.synthetic ? " (synthetic placeholder comparison)" : ""}.`
    : `Compared ${Object.keys(themes).length} themes with ${d.reference.markets || "the"} other towns${d.reference.synthetic ? " (synthetic placeholder comparison)" : ""}.`));

  // The family titles named on the calendar are scored from the discovery pass (cached, or two live requests).
  const poolRows = resolutions.some((x) => x.kind === "pool") ? await discover(d, input.market, trace) : null;

  // 3. Flag.
  const nights: NightOut[] = input.rows.map((r, i) => {
    const res = resolutions[i]!;
    if (res.kind === "pool") {
      const found = poolRows?.all?.find((x) => x.entityId === res.entityId);
      const z = found?.z ?? null;
      const type = (d.discoveryRef ?? DISCOVERY_REFERENCE).pool.find((x) => x.entityId === res.entityId)?.type ?? "movie";
      return {
        index: i, line: r.line, date: r.date, weekday: weekdayName(r.date), theme: r.theme, sponsor: r.sponsor, locked: r.locked, notes: r.notes,
        resolution: res, candidates: [], themeId: null, label: z === null ? "not-scored" : labelForZ(z), z, recognisedAs: null,
        pool: { entityId: res.entityId, name: res.name, type, z, zRaw: found?.zRaw ?? null, affinity: found?.affinity ?? null },
      };
    }
    const themeId = res.kind === "theme" ? res.themeId : null;
    const sc = themeId ? themes[themeId] : undefined;
    const label: FitLabel = res.kind === "classic" ? "classic" : themeId ? (sc?.label ?? "not-scored") : "not-scored";
    return {
      index: i, line: r.line, date: r.date, weekday: weekdayName(r.date), theme: r.theme, sponsor: r.sponsor, locked: r.locked, notes: r.notes,
      resolution: res, candidates: res.kind === "ambiguous" ? res.candidates : [], themeId, label, z: sc?.index ?? null, recognisedAs: recognised[i] ?? null,
    };
  });
  const count = (l: FitLabel): number => nights.filter((n) => n.label === l).length;
  trace.push(step(iso(d), "score", `Rated: ${count("leans-in")} strong fit, ${count("average")} average fit, ${count("leans-away")} weak fit, ${count("not-scored")} no data, ${count("classic")} proven promo.`));

  return {
    market: input.market, ...(venue ? { kind: "venue" as const } : {}), mode: d.mode, recordedOn: scores.source === "cache" ? scores.stored.fetchedAt.slice(0, 10) : null, recordedAt: scores.stored.fetchedAt, themes, nights,
    reference: { markets: d.reference.markets, synthetic: d.reference.synthetic, pulledAt: d.reference.pulledAt }, caps: await capsOf(d), trace,
  };
}

// ---------- propose ----------

function fitsOf(themes: Record<string, ThemeScoreOut>): Record<string, ThemeFit> {
  return Object.fromEntries(Object.entries(themes).map(([id, t]) => [id, { label: t.label, z: t.index, score: t.score }]));
}

/**
 * The model's sentence must read the plain way ("People in Biloxi like X more than Y, compared with their other themes"): both theme names and the town, the word
 * "like", and none of the old private vocabulary.
 */
export function whyShapeOk(text: string, planned: string, proposed: string, town: string): boolean {
  const t = text.toLowerCase();
  return t.includes(planned.toLowerCase()) && t.includes(proposed.toLowerCase()) && t.includes(town.toLowerCase()) && /\blikes?\b/.test(t) && !/\b(lean|leans|leaning|market|markets|fans|fan)\b/.test(t);
}

/** The model words only the taste comparison. These words mean it wandered off the facts it was given. */
const OFF_FACTS = /\b(sponsors?|dates?|tickets?|sales|attendance|revenue|crowds?|fans? will|prefer(?:s|red|ence|ences)?|favou?rites?|best)\b/i;

export async function proposeSwaps(d: Deps, input: { market: MarketIn; nights: ProposeNightIn[]; allowDuplicates: boolean }): Promise<ProposeResponse> {
  const trace: TraceStep[] = [];
  const scores = await getScores(d, input.market, trace);
  const themes = allOut(d, scores);
  const venue = d.kind === "venue";
  const discovery = venue ? null : await discover(d, input.market, trace);
  const actsOut = venue ? await discoverActs(d, input.market, trace) : undefined;
  const city = cityOfLabel(input.market.label);
  const nights: PlanNight[] = input.nights.map((n) => ({ ...n, themeId: n.themeId && Object.hasOwn(themes, n.themeId) ? n.themeId : null }));
  const res = propose({ nights, library: d.library, fits: fitsOf(themes), allowDuplicates: input.allowDuplicates, now: iso(d), discovered: discovery ? [...discovery.movies, ...discovery.shows].filter((x) => x.major === true && (x.popularity ?? 0) >= SWAP_POPULARITY && (x.z ?? -9) >= 0) : [], city, ...(venue ? { venue: true, acts: actsOut ? actsOut.acts.filter(worthABooking) : [] } : {}) });
  trace.push(...res.trace);

  const whys = new Map<string, string>();
  const libraryProposals = res.proposals.filter((p) => !p.discovered && p.kind !== "best-option");
  if (libraryProposals.length > 0) {
    const label = (id: string): string => d.library.find((t) => t.id === id)?.label ?? id;
    const pairOf = (p: (typeof libraryProposals)[number]): string => `${label(p.fromThemeId)}>${label(p.toThemeId)}`;
    // The wording depends only on the town and the two theme names, so each pair's validated model text is saved on its own for that town. Only genuine, validated model text is ever saved: never template text, and never a failure.
    const byPair: Record<string, string> = {};
    const pairKey = async (pair: string): Promise<string> => `ai:why:v3:${await sha256Hex(`${city}|${pair}`)}`;
    const wanted = [...new Set(libraryProposals.map(pairOf))];
    for (const pair of wanted) {
      const saved = await safeGet(d.kv, await pairKey(pair));
      if (typeof saved === "string" && saved.length > 0) byPair[pair] = saved;
    }
    const missing = libraryProposals.filter((p, i, all) => byPair[pairOf(p)] === undefined && all.findIndex((q) => pairOf(q) === pairOf(p)) === i);
    const savedCount = wanted.length - new Set(missing.map(pairOf)).size;
    if (savedCount > 0) trace.push(step(iso(d), "model", `Writing the reasons for the swaps: used saved model wording for ${savedCount} of ${wanted.length}${missing.length > 0 ? `, so the model is asked only for the other ${missing.length}` : " (no model call)"}.`));
    if (missing.length > 0) {
      // Opaque ids: the real ones contain the date, which the model has no business seeing.
      const facts = missing.map((p, i) => ({ id: String(i + 1), town: city, planned: label(p.fromThemeId), proposed: label(p.toThemeId) }));
      const reply = await runModel(
        d,
        `For each swap write ONE sentence of at most 22 words, in this shape: "People in ${city} like <proposed> more than <planned>, compared with their other themes." Use only the two theme names given and the town name ${city}. No digits. Never say "fans", "market", "lean" or "prefer". Never mention sponsors, dates, tickets, sales, attendance or revenue. Reply with JSON only: [{"id": string, "why": string}].`,
        JSON.stringify(facts),
        trace,
        missing.length === wanted.length ? "Writing the reasons for the swaps" : `Writing the reasons for ${missing.length} new swap${missing.length === 1 ? "" : "s"}`,
        300,
      );
      const parsed = jsonIn(reply);
      if (Array.isArray(parsed)) {
        for (const item of parsed as Array<{ id?: unknown; why?: unknown }>) {
          if (typeof item?.id !== "string" || typeof item.why !== "string") continue;
          const p = missing[Number(item.id) - 1];
          const text = item.why.trim();
          if (p && text.length > 0 && text.length <= 220 && numbersAreGrounded(text, []) && !claimsOutcome(text) && !OFF_FACTS.test(text) && whyShapeOk(text, label(p.fromThemeId), label(p.toThemeId), city)) {
            byPair[pairOf(p)] = text;
            await safePut(d.kv, await pairKey(pairOf(p)), text, { expirationTtl: TTL });
          } else trace.push(step(iso(d), "model", `Dropped the model's reason for swap ${item.id}: it went beyond the taste comparison, so the template text is used.`));
        }
      }
      const stillMissing = new Set(missing.filter((p) => byPair[pairOf(p)] === undefined).map(pairOf)).size;
      if (stillMissing > 0) trace.push(step(iso(d), "model", `Template text is used for ${stillMissing} swap${stillMissing === 1 ? "" : "s"}: the model gave no usable wording for ${stillMissing === 1 ? "it" : "them"}.`));
    }
    for (const p of libraryProposals) {
      const text = byPair[pairOf(p)];
      // The code, not the model, says what stays: the date and the sponsor always do.
      if (typeof text === "string" && text.length > 0) whys.set(p.id, `${/[.!?]$/.test(text) ? text : `${text}.`} ${p.sponsor ? "The date and sponsor stay the same." : "The date stays the same."}`);
    }
  }
  return {
    proposals: res.proposals.map((p) => ({ ...p, why: whys.get(p.id) ?? p.why, whySource: whys.has(p.id) ? "model" : "template" })),
    discovery: discovery ? publicDiscovery(discovery) : discovery, ...(venue ? { acts: actsOut ?? null } : {}), angles: pickAngles(venue ? await supportActAngles(d, input.market, res.angles, nights, trace) : await tasteAngles(d, input.market, res.angles, nights, trace), new Set(res.proposals.map((p) => p.toThemeId))), unfixed: res.unfixed, trace, caps: await capsOf(d),
  };
}

// ---------- re-check ----------

export async function recheck(d: Deps, input: { market: MarketIn; themeId: string }): Promise<RecheckResponse> {
  const trace: TraceStep[] = [];
  const theme = d.library.find((t) => t.id === input.themeId);
  if (!theme) throw new Error(`Unknown theme ${input.themeId}`);
  // One live re-check per market and theme per day: a repeat returns the answer already on file.
  const rcKey = `rc:v1:${d.kind === "venue" ? "venue:" : ""}${marketKey(input.market)}:${theme.id}`;
  if ((await safeGet(d.kv, rcKey)) !== null) {
    const scores = await getScores(d, input.market, trace);
    const all = allOut(d, scores);
    trace.push(step(iso(d), "note", `Fresh data for ${theme.label}: checked with Qloo within the last day, so the saved answer is returned.`));
    return { theme: all[theme.id]!, themes: all, trace, caps: await capsOf(d), withinDay: true };
  }
  if (d.gate && !(await d.gate.allow("recheck"))) throw d.gate.broken ? new CappedError(true) : new QuotaError("recheck");
  const need = new Set(theme.entities.map((e) => e.type)).size;
  if (!(await reserveQloo(d, need, trace))) throw new CappedError(d.countersDown === true);
  trace.push(step(iso(d), "note", `Getting fresh data for ${theme.label}, ignoring the saved result.`));
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
