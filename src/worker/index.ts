import { activeLibrary, COMMITTED_IDS } from "../app/themes/ids";
import { VENUE_LIBRARY } from "../app/themes/artists";
import { syntheticActsReference } from "../app/acts";
import { ACTS_REFERENCE, DISCOVERY_REFERENCE, REFERENCE, SYNTHETIC_REFERENCE } from "./reference";
import type { Deps } from "./agent";
import type { Env } from "./env";
import { syntheticDiscoveryReference } from "../app/discovery";
import { memoryLimiter, ipBucket, type Limiter } from "./limits";
import type { CounterPort } from "./ports";
import { route, type RouterDeps } from "./router";
import { syntheticQlooFetch } from "./synthetic";
import { runWarm, warmFetch } from "./warm";

async function clientId(req: Request): Promise<string> {
  const ip = ipBucket(req.headers.get("cf-connecting-ip") ?? "local");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(buf).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let fallback: { scale: number; limiter: Limiter } | null = null;

/** Cloudflare's Rate Limiting binding per route; the in-memory counter when a binding is absent. A binding error lets the request through. */
function limiterFor(env: Env, scale: number): Limiter {
  const bound: Record<string, RateLimit | undefined> = { geocode: env.LIMIT_GEOCODE, analyze: env.LIMIT_ANALYZE, propose: env.LIMIT_PROPOSE, recheck: env.LIMIT_RECHECK, health: env.LIMIT_HEALTH, mcp: env.LIMIT_MCP };
  if (!fallback || fallback.scale !== scale) fallback = { scale, limiter: memoryLimiter(scale) };
  const mem = fallback.limiter;
  return async (route, id) => {
    const b = bound[route];
    if (!b) return mem(route, id);
    try {
      return (await b.limit({ key: `${route}:${id}` })).success;
    } catch (err) {
      console.error("rate limit binding failed", err instanceof Error ? err.message : String(err));
      return true;
    }
  };
}

/** The global per-minute ceilings: one constant key in a Rate Limiting binding. Without a binding (tests, plain local runs) there is no ceiling. A binding error lets the call through. */
function globalLimitFor(env: Env): (kind: "pull" | "model") => Promise<boolean> {
  const bound = { pull: env.LIMIT_GLOBAL_PULL, model: env.LIMIT_GLOBAL_MODEL };
  return async (kind) => {
    const b = bound[kind];
    if (!b) return true;
    try {
      return (await b.limit({ key: `global:${kind}` })).success;
    } catch (err) {
      console.error("global rate limit binding failed", err instanceof Error ? err.message : String(err));
      return true;
    }
  };
}

/** The counter Durable Object as a CounterPort. One wrapper per isolate, so the caps memo in agent.ts survives between requests. */
let doPort: { ns: unknown; port: CounterPort } | null = null;
function countersFor(env: Env): CounterPort | undefined {
  const ns = env.COUNTERS;
  if (!ns) return undefined;
  if (doPort && doPort.ns === ns) return doPort.port;
  const stub = (): ReturnType<typeof ns.get> => ns.get(ns.idFromName("global"));
  const port: CounterPort = {
    take: (key, by, cap, ttl) => stub().take(key, by, cap, ttl),
    read: (keys) => stub().read(keys),
    mark: (key, ttl) => stub().mark(key, ttl),
    marked: (key) => stub().marked(key),
  };
  doPort = { ns, port };
  return port;
}

/** Search results saved for a week in the edge cache (the Cache API: free, and not KV). */
const geoCache = {
  async get(key: string): Promise<string | null> {
    const hit = await caches.default.match(new Request(`https://geocode-cache.invalid/v1?q=${encodeURIComponent(key)}`));
    return hit ? hit.text() : null;
  },
  async put(key: string, value: string, ttlSec: number): Promise<void> {
    await caches.default.put(new Request(`https://geocode-cache.invalid/v1?q=${encodeURIComponent(key)}`), new Response(value, { headers: { "cache-control": `public, max-age=${ttlSec}` } }));
  },
};

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function depsFor(env: Env): RouterDeps {
  const synthetic = env.QLOO_MODE === "synthetic";
  const agent: Deps = {
    kv: env.CACHE,
    ...(countersFor(env) ? { counters: countersFor(env)! } : {}),
    ai: env.AI ?? null,
    mode: synthetic ? "synthetic" : "live",
    qlooFetch: synthetic ? syntheticQlooFetch : (input, init) => fetch(input, init),
    qlooBase: env.QLOO_API_URL ?? (synthetic ? "https://synthetic.invalid" : ""),
    qlooKey: env.QLOO_API_KEY ?? "",
    library: activeLibrary(COMMITTED_IDS, synthetic),
    venueLibrary: activeLibrary(COMMITTED_IDS, synthetic, VENUE_LIBRARY),
    actsRef: synthetic ? syntheticActsReference() : ACTS_REFERENCE,
    reference: synthetic ? SYNTHETIC_REFERENCE : REFERENCE,
    discoveryRef: synthetic ? syntheticDiscoveryReference() : DISCOVERY_REFERENCE,
    now: () => new Date(),
    qlooDailyCap: num(env.QLOO_DAILY_CAP, 1500),
    aiDailyCap: num(env.AI_DAILY_CAP, 400),
    qlooDelayMs: synthetic ? 0 : 260,
  };
  return {
    agent,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    // Wrapped: a bare `fetch` called as `deps.geocodeFetch(...)` has the wrong `this` in Workers ("Illegal invocation").
    geocodeFetch: (input, init) => fetch(input, init),
    clientId,
    limiter: limiterFor(env, num(env.RATE_LIMIT_SCALE, 1)),
    globalLimit: globalLimitFor(env),
    geoCache,
    signingKey: env.MARKET_SIGNING_KEY && env.MARKET_SIGNING_KEY.length >= 16 ? env.MARKET_SIGNING_KEY : null,
  };
}

// The counter Durable Object class must be exported from the Worker entry.
export { Counters } from "./counters-do";

export default {
  fetch: (request: Request, env: Env) => (new URL(request.url).pathname === "/api/warm" ? warmFetch(request, env, depsFor(env).agent) : route(request, depsFor(env))),
  // The pre-warm cron (wrangler.toml [triggers]).
  scheduled: async (_event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runWarm(depsFor(env).agent).then((s) => console.log("warm", JSON.stringify({ warmed: s.warmed, alreadySaved: s.alreadySaved, failed: s.failed, stoppedBecause: s.stoppedBecause }))));
  },
} satisfies ExportedHandler<Env>;
