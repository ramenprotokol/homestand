import type { AnalyzeResponse, Caps, MarketIn, MemoResponse, NightOut, ProposeNightIn, ProposeResponse, RecheckResponse, ThemeScoreOut } from "../app/api-types";
import { weekdayName, type CalendarRow } from "../app/calendar/csv";
import { resolveTheme, type Resolution } from "../app/calendar/resolve";
import { numbersAreGrounded, claimsOutcome } from "../app/guard";
import { marketKey } from "../app/markets";
import { propose, type PlanNight, type ThemeFit } from "../app/propose/propose";
import { bundleScore, centre, fitFor, labelForZ, type FitLabel, type ReferenceStats } from "../app/score";
import { idsOfType, type LiveTheme } from "../app/themes/ids";
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
  const raw = await d.kv.get(`cap:${name}:${today(d)}`);
  const n = raw === null ? 0 : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function bump(d: Deps, name: string, by: number): Promise<void> {
  await d.kv.put(`cap:${name}:${today(d)}`, String((await counter(d, name)) + by), { expirationTtl: 2 * 24 * 3600 });
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
  const hit = await d.kv.get(key);
  if (hit) {
    try {
      const stored = JSON.parse(hit) as StoredLibrary;
      if (stored.v === 1) {
        trace.push(step(iso(d), "qloo", "Used the recorded scores for this market (no new Qloo call).", `Cached, recorded ${stored.fetchedAt.slice(0, 10)}.`));
        return { stored, source: "cache" };
      }
    } catch {
      /* fall through to a fresh pull */
    }
  }
  const need = new Set(d.library.flatMap((t) => t.entities.map((e) => e.type))).size;
  if (!(await reserveQloo(d, need))) throw new CappedError();
  const themes = await askQloo(d, m, d.library, trace);
  const stored: StoredLibrary = { v: 1, fetchedAt: iso(d), themes };
  await d.kv.put(key, JSON.stringify(stored), { expirationTtl: TTL });
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

// ---------- model ----------

async function runModel(d: Deps, system: string, user: string, trace: TraceStep[], what: string, maxTokens = 900): Promise<string | null> {
  if (!d.ai) {
    trace.push(step(iso(d), "model", `${what}: no model attached here, so template text is used.`));
    return null;
  }
  if ((await counter(d, "ai")) >= d.aiDailyCap) {
    trace.push(step(iso(d), "model", `${what}: today's model budget is spent, so template text is used.`));
    return null;
  }
  await bump(d, "ai", 1);
  try {
    const res = (await d.ai.run(AI_MODEL, { messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.1, max_tokens: maxTokens })) as { response?: unknown };
    const text = typeof res?.response === "string" ? res.response : null;
    trace.push(step(iso(d), "model", `${what}: asked ${AI_MODEL} (one call).`, text === null ? "No usable reply." : undefined));
    return text;
  } catch (err) {
    trace.push(step(iso(d), "model", `${what}: the model call failed (${err instanceof Error ? err.message.slice(0, 80) : "error"}), so template text is used.`));
    return null;
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
  const unknownIdx = resolutions.flatMap((r, i) => (r.kind === "unknown" ? [i] : []));
  if (unknownIdx.length > 0 && d.ai) {
    const list = d.library.map((t) => `${t.id}: ${t.label}`).join("\n");
    const texts = unknownIdx.map((i, n) => `${n}: ${input.rows[i]!.theme}`).join("\n");
    const reply = await runModel(
      d,
      "You match minor league baseball promotion names to a fixed list of pop-culture themes. Answer with JSON only: an object mapping each number to an array of theme ids. Use an empty array unless the text clearly names that franchise, show, film, game, brand or artist. Never guess. Never invent ids.",
      `Themes:\n${list}\n\nTexts:\n${texts}`,
      trace,
      "Matching unrecognised theme names",
      600,
    );
    const parsed = jsonIn(reply) as Record<string, unknown> | null;
    unknownIdx.forEach((rowIdx, n) => {
      const ids = parsed && Array.isArray(parsed[String(n)]) ? (parsed[String(n)] as unknown[]).filter((x): x is string => typeof x === "string" && activeIds.has(x)) : [];
      const uniq = [...new Set(ids)];
      if (uniq.length === 1) resolutions[rowIdx] = { kind: "theme", themeId: uniq[0]!, method: "model" };
      else if (uniq.length > 1) resolutions[rowIdx] = { kind: "ambiguous", candidates: uniq };
    });
  }
  input.rows.forEach((r, i) => {
    const res = resolutions[i]!;
    const text =
      res.kind === "theme" ? `"${r.theme}" matched ${d.library.find((t) => t.id === res.themeId)?.label ?? res.themeId} (${res.method === "alias" ? "name list" : "model"}).`
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
      resolution: res, candidates: res.kind === "ambiguous" ? res.candidates : [], themeId, label, z: sc?.index ?? null,
    };
  });
  const count = (l: FitLabel): number => nights.filter((n) => n.label === l).length;
  trace.push(step(iso(d), "score", `Flagged: ${count("leans-in")} lean in, ${count("average")} about average, ${count("leans-away")} lean away, ${count("not-scored")} not scored, ${count("classic")} classic.`));

  return {
    market: input.market, mode: d.mode, recordedOn: scores.source === "cache" ? scores.stored.fetchedAt.slice(0, 10) : null, themes, nights,
    reference: { markets: d.reference.markets, synthetic: d.reference.synthetic, pulledAt: d.reference.pulledAt }, caps: await capsOf(d), trace,
  };
}

// ---------- propose ----------

function fitsOf(themes: Record<string, ThemeScoreOut>): Record<string, ThemeFit> {
  return Object.fromEntries(Object.entries(themes).map(([id, t]) => [id, { label: t.label, z: t.index, score: t.score }]));
}

const abs1 = (z: number | null): number | null => (z === null ? null : Math.round(Math.abs(z) * 10) / 10);

export async function proposeSwaps(d: Deps, input: { market: MarketIn; nights: ProposeNightIn[]; allowDuplicates: boolean }): Promise<ProposeResponse> {
  const trace: TraceStep[] = [];
  const scores = await getScores(d, input.market, trace);
  const themes = allOut(d, scores);
  const nights: PlanNight[] = input.nights.map((n) => ({ ...n, themeId: n.themeId && themes[n.themeId] ? n.themeId : null }));
  const res = propose({ nights, library: d.library, fits: fitsOf(themes), allowDuplicates: input.allowDuplicates, now: iso(d) });
  trace.push(...res.trace);

  const whys = new Map<string, string>();
  if (res.proposals.length > 0) {
    const label = (id: string): string => d.library.find((t) => t.id === id)?.label ?? id;
    const facts = res.proposals.map((p) => ({
      id: p.id, night: `${p.weekday} ${p.date}`, planned: label(p.fromThemeId), plannedFit: p.from.label, plannedZ: abs1(p.from.z),
      proposed: label(p.toThemeId), proposedFit: p.to.label, proposedZ: abs1(p.to.z), hasSponsor: p.sponsor !== "",
    }));
    const reply = await runModel(
      d,
      "You write one or two plain-English sentences explaining a theme-night swap to a minor league promotions director. Use ONLY the facts given. Describe local taste only. Never say or imply a theme will raise attendance, sales or revenue. Use no digits at all. Answer with JSON only: an array of {\"id\": string, \"why\": string}.",
      JSON.stringify(facts),
      trace,
      "Writing the reasons for the swaps",
      900,
    );
    const parsed = jsonIn(reply);
    if (Array.isArray(parsed)) {
      for (const item of parsed as Array<{ id?: unknown; why?: unknown }>) {
        if (typeof item?.id !== "string" || typeof item.why !== "string") continue;
        const f = facts.find((x) => x.id === item.id);
        const allowed = f ? [f.plannedZ, f.proposedZ].filter((x): x is number => x !== null) : [];
        const text = item.why.trim();
        if (f && text.length > 0 && text.length <= 420 && numbersAreGrounded(text, allowed) && !claimsOutcome(text)) whys.set(item.id, text);
        else trace.push(step(iso(d), "model", `Dropped the model's reason for ${item.id}: it broke the grounding rules, so the template text is used.`));
      }
    }
  }
  return {
    proposals: res.proposals.map((p) => ({ ...p, why: whys.get(p.id) ?? p.why, whySource: whys.has(p.id) ? "model" : "template" })),
    angles: res.angles, unfixed: res.unfixed, trace, caps: await capsOf(d),
  };
}

// ---------- re-check ----------

export async function recheck(d: Deps, input: { market: MarketIn; themeId: string }): Promise<RecheckResponse> {
  const trace: TraceStep[] = [];
  const theme = d.library.find((t) => t.id === input.themeId);
  if (!theme) throw new Error(`Unknown theme ${input.themeId}`);
  const need = new Set(theme.entities.map((e) => e.type)).size;
  if (!(await reserveQloo(d, need))) throw new CappedError();
  trace.push(step(iso(d), "note", `Re-checking ${theme.label} live, ignoring the recorded result.`));
  const fresh = (await askQloo(d, input.market, [theme], trace))[theme.id]!;
  // The market's own average moves when one theme is re-read, so every index is recomputed from the updated record.
  const scores = await getScores(d, input.market, trace);
  scores.stored.themes[theme.id] = fresh;
  await d.kv.put(cacheKey(d, input.market), JSON.stringify(scores.stored), { expirationTtl: TTL });
  const all = allOut(d, scores);
  const out = all[theme.id]!;
  if (d.mode !== "synthetic") out.source = "live";
  return { theme: out, themes: all, trace, caps: await capsOf(d) };
}

// ---------- memo ----------

export async function memoSummary(
  d: Deps,
  input: { market: MarketIn; swaps: Array<{ date: string; fromThemeId: string; toThemeId: string }>; nights: number; classic: number },
): Promise<MemoResponse> {
  const trace: TraceStep[] = [];
  const scores = await getScores(d, input.market, trace);
  const themes = allOut(d, scores);
  const facts = input.swaps.map((s) => ({ date: s.date, fromThemeId: s.fromThemeId, toThemeId: s.toThemeId, fromZ: themes[s.fromThemeId]?.index ?? null, toZ: themes[s.toThemeId]?.index ?? null, fromScore: themes[s.fromThemeId]?.score ?? null, toScore: themes[s.toThemeId]?.score ?? null }));
  const k = input.swaps.length;
  const template = `For ${input.market.label}, we compared ${input.nights} planned theme nights with what this market leans toward. ${k === 0 ? "No swaps were approved, so the calendar is unchanged." : `${k} swap${k === 1 ? " was" : "s were"} approved; each keeps its date and sponsor.`} Classic nights stay as planned. This describes local taste; it is not a forecast of attendance.`;
  let summary = template;
  let summarySource: "model" | "template" = "template";
  if (k > 0) {
    const label = (id: string): string => d.library.find((t) => t.id === id)?.label ?? id;
    const reply = await runModel(
      d,
      "You write a two-sentence summary for a sponsor memo about approved theme-night swaps. Use ONLY the facts given. Describe local taste only; never say or imply a swap will raise attendance, sales or revenue. Use no digits except the counts you are given. Reply with plain text only.",
      JSON.stringify({ club: input.market.label, nightsReviewed: input.nights, swapsApproved: k, swaps: input.swaps.map((s) => `${label(s.fromThemeId)} to ${label(s.toThemeId)}`) }),
      trace, "Writing the memo summary", 300,
    );
    const text = reply?.trim() ?? "";
    if (text && text.length <= 600 && numbersAreGrounded(text, [input.nights, k]) && !claimsOutcome(text)) {
      summary = text;
      summarySource = "model";
    } else if (text) trace.push(step(iso(d), "model", "Dropped the model's memo summary: it broke the grounding rules, so the template text is used."));
  }
  return { summary, summarySource, swaps: facts, recordedOn: scores.source === "cache" ? scores.stored.fetchedAt.slice(0, 10) : null, trace };
}
