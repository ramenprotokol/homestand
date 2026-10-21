/**
 * Homestand as an MCP (Model Context Protocol) server, so Claude, ChatGPT or any MCP client can use it as a tool.
 *
 * Streamable HTTP, stateless: one JSON-RPC 2.0 message per POST /mcp, answered with plain JSON (no event stream, no session).
 * Two protocol eras share the endpoint. The 2026-07-28 revision sends its version in every request and has no handshake;
 * 2025-11-25, 2025-06-18 and 2025-03-26 open with `initialize`. Today's connectors (Claude, ChatGPT) still speak the older ones.
 *
 * The tools only wrap analyze() and proposeSwaps() from agent.ts. Every call goes through the same per-minute limits,
 * daily quotas, caps and market checks as the web API: the router hands this file its limiter and its per-client deps.
 */
import type { AnalyzeResponse, GeoHit, MarketIn, NightOut, ProposeNightIn, ProposeResponse } from "../app/api-types";
import { parseCalendar, parseDate, type CalendarRow } from "../app/calendar/csv";
import { cityOfLabel, isSport, type Kind, type Sport, SPORTS } from "../app/kind";
import { SAMPLE_MARKETS, sampleById, type SampleMarket } from "../app/markets";
import { sampleCsv } from "../app/samples";
import { AUDIT_LINE, classicReason, comparisonSentence, fitLine, methodWords, type FitLabel } from "../app/score";
import { analyze, proposeSwaps, type Deps } from "./agent";
import { marketAllowed } from "./sign";

/** What the router gives this file. Nothing here bypasses the web API's checks. */
export interface McpHost {
  respond(body: unknown | null, status: number, extra?: Record<string, string>): Response;
  geocode(q: string): Promise<GeoHit[]>;
  /** The deps for this caller: the kind and sport asked for, plus their daily allowance. */
  agentFor(m: MarketIn, kind: Kind, sport?: Sport): Deps;
  /** One count against the per-minute limit of a web route ("geocode", "analyze", "propose"). False when over. */
  limit(route: string): Promise<boolean>;
  /** The friendly words for a quota, cap or upstream failure (the same ones the web API uses). */
  failureText(err: unknown): string;
  signingKey: string | null;
}

const MODERN = "2026-07-28";
const LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SUPPORTED = [MODERN, ...LEGACY];
const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const MAX_NIGHTS = 200;
const SERVER_VERSION = "0.1.0";

const INSTRUCTIONS =
  "Homestand checks a minor league club's theme-night calendar (or a concert venue's summer calendar) against what people near the ballpark like, " +
  "and suggests swaps for the weak nights. Start with sample_teams if you have no calendar to try. It describes local taste; it does not predict ticket sales.";

// ---------- JSON-RPC ----------

type Id = string | number;
const PARSE = -32700, INVALID = -32600, NO_METHOD = -32601, BAD_PARAMS = -32602, HEADER_MISMATCH = -32020, BAD_VERSION = -32022;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function rpcError(host: McpHost, id: Id | null, code: number, message: string, status = 200, data?: unknown): Response {
  return host.respond({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } }, status);
}

/** A header value may be sent as =?base64?...?= when it is not plain ASCII (modern revision). */
function headerValue(raw: string | null): string | null {
  if (raw === null) return null;
  const m = /^=\?base64\?(.*)\?=$/.exec(raw);
  if (!m) return raw;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export async function handleMcp(req: Request, text: string | null, host: McpHost): Promise<Response> {
  if (text === null) return rpcError(host, null, INVALID, "That request is too large.", 413);
  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    return rpcError(host, null, PARSE, "The request was not valid JSON.", 400);
  }
  if (Array.isArray(msg)) return rpcError(host, null, INVALID, "Batch requests are not supported. Send one message per request.", 400);
  if (!isObj(msg) || msg.jsonrpc !== "2.0") return rpcError(host, null, INVALID, "Not a JSON-RPC 2.0 message.", 400);
  // A response to a server request: this server never sends one, so there is nothing to match. Accept and ignore.
  if (msg.method === undefined && ("result" in msg || "error" in msg)) return host.respond(null, 202);
  if (typeof msg.method !== "string") return rpcError(host, null, INVALID, "The message needs a method.", 400);
  const method = msg.method;
  // A notification has no id: acknowledged with no body, whatever it is.
  if (!("id" in msg)) return host.respond(null, 202);
  if (typeof msg.id !== "string" && typeof msg.id !== "number") return rpcError(host, null, INVALID, "The id must be a string or a number.", 400);
  const id: Id = msg.id;
  if (msg.params !== undefined && !isObj(msg.params)) return rpcError(host, id, BAD_PARAMS, "The params must be an object.");
  const params = (msg.params ?? {}) as Record<string, unknown>;

  // Which era is this request in? The modern one carries its version in params._meta; the older ones do not.
  const meta = isObj(params._meta) ? params._meta : {};
  const metaVersion = meta[META_VERSION];
  const header = req.headers.get("mcp-protocol-version");
  const unsupported = (requested: unknown): Response => rpcError(host, id, BAD_VERSION, "Unsupported protocol version", 400, { supported: SUPPORTED, requested });
  const modern = metaVersion !== undefined;
  if (modern) {
    if (metaVersion !== MODERN) return unsupported(metaVersion);
    if (header !== MODERN) return rpcError(host, id, HEADER_MISMATCH, `Header mismatch: MCP-Protocol-Version must be ${MODERN}, the version in the request body.`, 400);
    if (req.headers.get("mcp-method") !== method) return rpcError(host, id, HEADER_MISMATCH, "Header mismatch: Mcp-Method must match the method in the body.", 400);
    if (method === "tools/call" && headerValue(req.headers.get("mcp-name")) !== params.name) return rpcError(host, id, HEADER_MISMATCH, "Header mismatch: Mcp-Name must match the tool name in the body.", 400);
  } else if (header !== null && method !== "initialize" && !LEGACY.includes(header)) {
    return unsupported(header);
  }
  const done = (result: Record<string, unknown>): Response => host.respond({ jsonrpc: "2.0", id, result: modern ? { resultType: "complete", ...result } : result }, 200);

  switch (method) {
    case "initialize": {
      if (typeof params.protocolVersion !== "string") return rpcError(host, id, BAD_PARAMS, "initialize needs a protocolVersion.");
      // Ask for one we speak and we answer with it; ask for anything else and we offer our newest older one.
      const protocolVersion = LEGACY.includes(params.protocolVersion) ? params.protocolVersion : LEGACY[0]!;
      return done({ protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "homestand", title: "Homestand", version: SERVER_VERSION }, instructions: INSTRUCTIONS });
    }
    case "server/discover":
      return done({ supportedVersions: SUPPORTED, capabilities: { tools: {} }, _meta: { "io.modelcontextprotocol/serverInfo": { name: "homestand", version: SERVER_VERSION } }, instructions: INSTRUCTIONS, ttlMs: 3_600_000, cacheScope: "public" });
    case "ping":
      return done({});
    case "tools/list":
      return done({ tools: TOOLS, ...(modern ? { ttlMs: 300_000, cacheScope: "public" } : {}) });
    case "tools/call": {
      if (typeof params.name !== "string") return rpcError(host, id, BAD_PARAMS, "tools/call needs a tool name.");
      if (params.arguments !== undefined && !isObj(params.arguments)) return rpcError(host, id, BAD_PARAMS, "The arguments must be an object.");
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return rpcError(host, id, BAD_PARAMS, `Unknown tool: ${params.name.slice(0, 60)}`);
      return done(await runTool(tool.name, (params.arguments ?? {}) as Record<string, unknown>, host));
    }
    default:
      return rpcError(host, id, NO_METHOD, `Method not found: ${method.slice(0, 60)}`, modern ? 404 : 200);
  }
}

// ---------- the tools ----------

const sportSchema = { type: "string", enum: SPORTS, default: "baseball", description: "The sport, for a club. Only the wording and the proven promos differ. Ignored for a venue." };
const kindSchema = { type: "string", enum: ["club", "venue"], default: "club", description: 'Use "venue" for a concert venue\'s summer calendar of touring acts instead of a team\'s theme nights.' };
const citySchema = { type: "string", minLength: 2, maxLength: 60, description: 'A US or Canadian city, such as "Fargo, ND" or "Boise". The ratings are about the people living near it.' };
const sampleSchema = { type: "string", enum: SAMPLE_MARKETS.map((m) => m.id), description: "Use a built-in made-up sample (see sample_teams) instead of a city. With no nights given, its own calendar is checked." };
const nightsSchema = {
  type: "array",
  minItems: 1,
  maxItems: MAX_NIGHTS,
  description: `The home dates and their promotions, up to ${MAX_NIGHTS}. Leave out when using a sample to check the sample's own calendar.`,
  items: {
    type: "object",
    properties: {
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD" },
      theme: { type: "string", minLength: 1, maxLength: 120, description: 'The promotion as the club names it, such as "Star Wars Night" or "Fireworks Friday".' },
      sponsor: { type: "string", maxLength: 80, description: "The sponsor, if any. It always stays attached to the date." },
      locked: { type: "boolean", default: false, description: "True when the night is contracted or fixed. A locked night is never swapped." },
    },
    required: ["date", "theme"],
  },
} as const;

const calendarProps = { city: citySchema, sample: sampleSchema, sport: sportSchema, kind: kindSchema, nights: nightsSchema };

const TOOLS = [
  {
    name: "check_calendar",
    title: "Check a theme-night calendar",
    description:
      "Rates each night of a minor league club's promotion calendar (or a venue's summer calendar) by how much people near the ballpark like that theme, compared with the town's own other themes. " +
      "Each night comes back as strong, average, weak, classic (a proven promo, not graded), not scored, or ambiguous (with the choices). Use it first, then propose_swaps to fix the weak nights. " +
      "It describes local taste; it does not predict ticket sales. Give a city plus nights, or a sample id.",
    inputSchema: { type: "object", properties: calendarProps },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "propose_swaps",
    title: "Suggest swaps for the weak nights",
    description:
      "Finds a better-fitting theme for each weak night on the calendar, with a plain-words reason. Locked nights are never swapped, the date and sponsor always stay, and a night is never moved to a theme that does not suit the date or the audience. " +
      "These are suggestions only; nothing is changed. Same inputs as check_calendar.",
    inputSchema: { type: "object", properties: { ...calendarProps, allowDuplicates: { type: "boolean", default: false, description: "Let the same replacement theme be used on more than one night." } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "explain_night",
    title: "Explain one night's rating",
    description: "Explains in plain words why one theme gets its rating in one city: what it was compared with and what the rating does and does not mean.",
    inputSchema: {
      type: "object",
      properties: {
        city: citySchema,
        sample: sampleSchema,
        sport: sportSchema,
        kind: kindSchema,
        theme: { type: "string", minLength: 1, maxLength: 120, description: 'One night\'s theme, such as "Taylor Swift Night".' },
      },
      required: ["theme"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "sample_teams",
    title: "List the built-in sample teams",
    description: "Lists the made-up sample clubs and the sample concert venue (id, city, sport) with their built-in calendars, so you can demo Homestand without typing a calendar. Pass an id as `sample` to the other tools.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

interface ToolResult {
  [k: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

const failed = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });
const succeeded = (text: string, data: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text: `${text}\n\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`` }],
  structuredContent: data,
});

class InputError extends Error {}

async function runTool(name: string, args: Record<string, unknown>, host: McpHost): Promise<ToolResult> {
  try {
    if (name === "sample_teams") return sampleTeams();
    if (name === "check_calendar") return await checkCalendar(args, host);
    if (name === "propose_swaps") return await proposeTool(args, host);
    return await explainNight(args, host);
  } catch (err) {
    if (err instanceof InputError) return failed(err.message);
    return failed(host.failureText(err));
  }
}

// ---------- reading the inputs ----------

const clean = (s: string): string =>
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  s.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();

function text(args: Record<string, unknown>, key: string, min: number, max: number): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new InputError(`"${key}" must be text.`);
  const t = clean(v);
  if (t.length < min || t.length > max) throw new InputError(`"${key}" must be between ${min} and ${max} characters.`);
  return t;
}

function rowsFrom(v: unknown): CalendarRow[] {
  if (!Array.isArray(v) || v.length === 0) throw new InputError('"nights" must be a list with at least one night, each with a date (YYYY-MM-DD) and a theme.');
  if (v.length > MAX_NIGHTS) throw new InputError(`"nights" can have at most ${MAX_NIGHTS} nights; this one has ${v.length}.`);
  return v.map((n, i) => {
    const at = `Night ${i + 1}`;
    if (!isObj(n)) throw new InputError(`${at} must be an object with a date and a theme.`);
    if (typeof n.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(n.date) || parseDate(n.date) === null) throw new InputError(`${at}: the date must be a real day written YYYY-MM-DD, such as 2027-06-19.`);
    if (typeof n.theme !== "string" || clean(n.theme).length === 0 || n.theme.length > 120) throw new InputError(`${at}: the theme must be 1 to 120 characters.`);
    if (n.sponsor !== undefined && n.sponsor !== null && (typeof n.sponsor !== "string" || n.sponsor.length > 80)) throw new InputError(`${at}: the sponsor must be text of at most 80 characters.`);
    if (n.locked !== undefined && n.locked !== null && typeof n.locked !== "boolean") throw new InputError(`${at}: "locked" must be true or false.`);
    return { line: i + 2, date: parseDate(n.date)!, theme: clean(n.theme), sponsor: typeof n.sponsor === "string" ? clean(n.sponsor) : "", locked: n.locked === true, notes: "" };
  });
}

interface Target {
  market: MarketIn;
  kind: Kind;
  sport: Sport | undefined;
  sample: SampleMarket | undefined;
}

/** Picks the market the way the web flow does: a sample club, or a searched (and signed) city. */
async function targetOf(args: Record<string, unknown>, host: McpHost): Promise<Target> {
  const sampleId = text(args, "sample", 1, 40);
  const city = text(args, "city", 2, 60);
  if (args.sport !== undefined && args.sport !== null && !isSport(args.sport)) throw new InputError(`"sport" must be one of ${SPORTS.join(", ")}.`);
  if (args.kind !== undefined && args.kind !== null && args.kind !== "club" && args.kind !== "venue") throw new InputError('"kind" must be "club" or "venue".');
  if (sampleId !== undefined) {
    const s = sampleById(sampleId);
    if (!s) throw new InputError(`There is no sample called "${sampleId}". Call sample_teams to see the ids.`);
    return { market: { label: s.label, lon: s.lon, lat: s.lat }, kind: s.kind, sport: s.sport, sample: s };
  }
  if (city === undefined) throw new InputError('Give a US or Canadian "city" (such as "Fargo, ND"), or a "sample" id from sample_teams.');
  if (!(await host.limit("geocode"))) throw new InputError("Too many requests from here. Wait a minute and try again.");
  // "Fargo, ND": search the town name, then prefer the hit whose state or province matches.
  const [name = city, region = ""] = city.split(",").map((s) => s.trim());
  const hits = await host.geocode(name.length >= 2 ? name : city);
  const wanted = region.toLowerCase();
  const hit = (wanted ? hits.find((h) => h.label.toLowerCase().split(",").pop()?.trim() === wanted) : undefined) ?? hits[0];
  if (!hit) throw new InputError(`I could not find a US or Canadian city called "${city}". Try the city and state, like "Fargo, ND".`);
  const market: MarketIn = { label: hit.label, lon: hit.lon, lat: hit.lat, sig: hit.sig };
  if (!(await marketAllowed(market, host.signingKey))) throw new InputError("Search for your city and pick it from the list, or use a sample club.");
  const kind: Kind = args.kind === "venue" ? "venue" : "club";
  return { market, kind, sport: args.sport === undefined || args.sport === null ? undefined : (args.sport as Sport), sample: undefined };
}

/** The calendar to check, read before any lookup so a mistake costs nothing. A sample with no nights uses its own calendar. */
function rowsOf(args: Record<string, unknown>): CalendarRow[] {
  if (args.nights === undefined || args.nights === null) {
    const id = text(args, "sample", 1, 40);
    if (id !== undefined && !sampleById(id)) throw new InputError(`There is no sample called "${id}". Call sample_teams to see the ids.`);
    const s = id === undefined ? undefined : sampleById(id);
    if (!s) throw new InputError('"nights" is missing. Give the dates and themes, or use a "sample" to check its own calendar.');
    return parseCalendar(sampleCsv(s.id)).rows;
  }
  return rowsFrom(args.nights);
}

// ---------- words for the results ----------

const FIT_NAME: Record<FitLabel, string> = { "leans-in": "strong", average: "average", "leans-away": "weak", "not-scored": "not scored", classic: "classic", found: "local favorite" };

/** A Strong or Weak rating that rests on a raw gap under 0.01 is reported as "leans strong" / "leans weak", never as a verdict. */
const fitNameOf = (label: FitLabel, slight?: boolean): string => (slight && label === "leans-in" ? "leans strong" : slight && label === "leans-away" ? "leans weak" : FIT_NAME[label]);
const SLIGHT_REASON = " This is only a slight lean: the raw gap behind it is under 0.01, so treat it as a lean, not a verdict.";

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

interface NightLine {
  date: string;
  weekday: string;
  theme: string;
  matchedTheme: string | null;
  sponsor?: string;
  locked: boolean;
  fit: string;
  reason: string;
  choices?: string[];
}

function lineOf(n: NightOut, d: Deps, a: AnalyzeResponse): NightLine {
  const city = cityOfLabel(a.market.label);
  const label = (id: string): string => d.library.find((t) => t.id === id)?.label ?? id;
  const base = { date: n.date, weekday: n.weekday, theme: n.theme, ...(n.sponsor ? { sponsor: n.sponsor } : {}), locked: n.locked };
  if (n.resolution.kind === "ambiguous") {
    const choices = n.candidates.map(label);
    return { ...base, matchedTheme: null, fit: "ambiguous", choices, reason: `"${n.theme}" could mean ${choices.join(" or ")}, so it is not scored. Rename it to one of those and check again.` };
  }
  if (n.resolution.kind === "classic") return { ...base, matchedTheme: null, fit: "classic", reason: classicReason(a.kind, d.sport) };
  if (n.pool) {
    const line = n.label === "not-scored" ? `We have no local reading for ${n.pool.name} here, so it stays as planned.` : `${comparisonSentence(n.pool.name, n.label, city, a.kind)} (a family title, rated from its own local data)`;
    return { ...base, matchedTheme: n.pool.name, fit: FIT_NAME[n.label], reason: line };
  }
  if (n.recognisedAs) return { ...base, matchedTheme: null, fit: "not scored", reason: `"${n.theme}" is a theme we recognise (${n.recognisedAs}), but we have no scores for it yet, so it stays as planned.` };
  if (!n.themeId) return { ...base, matchedTheme: null, fit: "not scored", reason: `"${n.theme}" is not a theme we can place, so there is no data for it. It stays as planned.` };
  const themeLabel = label(n.themeId);
  const sc = a.themes[n.themeId];
  if (!sc || n.label === "not-scored") return { ...base, matchedTheme: themeLabel, fit: "not scored", reason: `We have no local data for ${themeLabel} in ${city}, so it stays as planned.` };
  return { ...base, matchedTheme: themeLabel, fit: fitNameOf(n.label, n.slight), reason: (fitLine(themeLabel, city, sc.index, a.kind) || comparisonSentence(themeLabel, n.label, city, a.kind)) + (n.slight ? SLIGHT_REASON : "") };
}

const demoNote = (mode: string): string => (mode === "synthetic" ? " (Demo data: these ratings are made up, not real Qloo results.)" : "");

/** Counts one use of each web route's per-minute limit that this tool relies on, then runs the same analysis the web flow runs. */
async function analyseFor(rows: CalendarRow[], t: Target, host: McpHost): Promise<{ a: AnalyzeResponse; d: Deps }> {
  if (!(await host.limit("analyze"))) throw new InputError("Too many requests from here. Wait a minute and try again.");
  const d = host.agentFor(t.market, t.kind, t.sport);
  return { a: await analyze(d, { market: t.market, rows }), d };
}

// ---------- check_calendar ----------

async function checkCalendar(args: Record<string, unknown>, host: McpHost): Promise<ToolResult> {
  const rows = rowsOf(args);
  const t = await targetOf(args, host);
  const { a, d } = await analyseFor(rows, t, host);
  const nights = a.nights.map((n) => lineOf(n, d, a));
  const count = (f: string): number => nights.filter((n) => n.fit === f).length;
  const city = cityOfLabel(a.market.label);
  const summary =
    `${plural(nights.length, "night", "nights")} checked for ${a.market.label}: ${count("strong")} strong, ${count("average")} average, ${count("weak")} weak${count("leans strong") + count("leans weak") > 0 ? ` (plus ${count("leans strong")} leaning strong and ${count("leans weak")} leaning weak, only slightly)` : ""}, ${count("classic")} proven promo${count("classic") === 1 ? "" : "s"} (not graded), ` +
    `${count("not scored")} not scored${count("ambiguous") ? `, ${count("ambiguous")} to choose` : ""}.${demoNote(a.mode)}`;
  const weak = nights.filter((n) => n.fit === "weak").length;
  const body = nights.map((n) => `${n.date} ${n.weekday.slice(0, 3)}  ${n.theme}${n.locked ? " [locked]" : ""}: ${n.fit}. ${n.reason}`).join("\n");
  const next = weak > 0 ? `\n\nNext: call propose_swaps with the same inputs to get replacements for the ${plural(weak, "weak night", "weak nights")} in ${city}.` : "";
  return succeeded(`${summary}\n\n${body}${next}`, { market: a.market.label, mode: a.mode, summary, nights });
}

// ---------- propose_swaps ----------

interface SwapLine {
  date: string;
  weekday: string;
  sponsor?: string;
  planned: string;
  proposed: string;
  plannedFit: string;
  proposedFit: string;
  /** The planned night is only a slight lean: the swap is optional. */
  optional?: boolean;
  reason: string;
  alternatives: string[];
}

async function proposeTool(args: Record<string, unknown>, host: McpHost): Promise<ToolResult> {
  if (args.allowDuplicates !== undefined && args.allowDuplicates !== null && typeof args.allowDuplicates !== "boolean") throw new InputError('"allowDuplicates" must be true or false.');
  const rows = rowsOf(args);
  const t = await targetOf(args, host);
  // Like the web Fix step: rate the calendar first, then ask for swaps for the nights as resolved. Proven promos and nights still to choose are left alone.
  const { a, d } = await analyseFor(rows, t, host);
  if (!(await host.limit("propose"))) throw new InputError("Too many requests from here. Wait a minute and try again.");
  const nights: ProposeNightIn[] = a.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.resolution.kind === "classic" || n.resolution.kind === "ambiguous" ? null : n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
  const res: ProposeResponse = await proposeSwaps(d, { market: a.market, nights, allowDuplicates: args.allowDuplicates === true });
  const label = (id: string): string => d.library.find((l) => l.id === id)?.label ?? id;
  const swaps: SwapLine[] = res.proposals.map((p) => ({
    date: p.date,
    weekday: p.weekday,
    ...(p.sponsor ? { sponsor: p.sponsor } : {}),
    planned: label(p.fromThemeId),
    proposed: p.discovered ? p.discovered.name : label(p.toThemeId),
    plannedFit: fitNameOf(p.from.label, p.from.slight),
    proposedFit: p.kind === "best-option" ? "average (the best option here)" : fitNameOf(p.to.label, p.to.slight),
    ...(p.optional ? { optional: true } : {}),
    reason: p.why,
    alternatives: p.alternates.map((x) => label(x.toThemeId)),
  }));
  const notFixed = res.unfixed.map((u) => ({ date: u.date, reason: u.reason }));
  const ideas = res.angles.map((g) => ({ date: g.date, sponsor: g.sponsor, text: g.text }));
  const city = cityOfLabel(a.market.label);
  const summary = swaps.length === 0 && notFixed.length === 0 ? `No weak nights to fix for ${city}.${demoNote(a.mode)}` : `${plural(swaps.length, "swap", "swaps")} suggested for ${a.market.label}${notFixed.length ? `, ${plural(notFixed.length, "night", "nights")} could not be fixed` : ""}.${demoNote(a.mode)}`;
  const lines = [
    ...swaps.map((s) => `${s.date} ${s.weekday.slice(0, 3)}${s.optional ? " [optional: only a slight lean]" : ""}: ${s.planned} (${s.plannedFit}) -> ${s.proposed} (${s.proposedFit}). ${s.reason}${s.alternatives.length ? ` Other options: ${s.alternatives.join(", ")}.` : ""}`),
    ...notFixed.map((u) => `${u.date}: not fixed. ${u.reason}`),
    ...(ideas.length ? ["", "Ideas for locked nights:", ...ideas.map((i) => `${i.date}: ${i.text}`)] : []),
  ];
  return succeeded(`${summary}\n\nThese are suggestions only; nothing has been changed. Locked nights, dates and sponsors stay as they are.\n\n${lines.join("\n")}`, { market: a.market.label, mode: a.mode, summary, swaps, notFixed, ideas });
}

// ---------- explain_night ----------

async function explainNight(args: Record<string, unknown>, host: McpHost): Promise<ToolResult> {
  const theme = text(args, "theme", 1, 120);
  if (theme === undefined) throw new InputError('"theme" is missing. Give one night\'s theme, such as "Star Wars Night".');
  const t = await targetOf(args, host);
  // One night, rated like any other. The date is only a placeholder: the rating does not depend on it.
  const row: CalendarRow = { line: 2, date: "2027-06-19", theme, sponsor: "", locked: false, notes: "" };
  const { a, d } = await analyseFor([row], t, host);
  const n = lineOf(a.nights[0]!, d, a);
  const label: FitLabel | null = n.fit === "strong" ? "leans-in" : n.fit === "weak" ? "leans-away" : n.fit === "average" ? "average" : null;
  const parts = [`${theme} in ${a.market.label}: ${n.fit}.`, n.reason, label ? methodWords(a.kind) : "", label ? AUDIT_LINE : ""].filter(Boolean);
  const data = { market: a.market.label, mode: a.mode, theme, matchedTheme: n.matchedTheme, fit: n.fit, reason: n.reason, ...(n.choices ? { choices: n.choices } : {}) };
  return succeeded(`${parts.join(" ")}${demoNote(a.mode)}`, data);
}

// ---------- sample_teams ----------

function sampleTeams(): ToolResult {
  const samples = SAMPLE_MARKETS.map((m) => ({ id: m.id, city: m.city, sport: m.kind === "venue" ? "venue" : (m.sport ?? "baseball"), kind: m.kind, nights: parseCalendar(sampleCsv(m.id)).rows.length }));
  const lines = samples.map((s) => `${s.id}: ${s.city}, ${s.kind === "venue" ? "a concert venue" : `a ${s.sport} club`} (${plural(s.nights, "night", "nights")})`);
  return succeeded(`Built-in samples. They are made up: the cities are real places, the teams, venues and sponsors are not.\n\n${lines.join("\n")}\n\nTry check_calendar with sample set to one of these ids.`, { samples });
}
