import { activeLibrary, COMMITTED_IDS } from "../app/themes/ids";
import { VENUE_LIBRARY } from "../app/themes/artists";
import { ACTS_REFERENCE, syntheticActsReference } from "../app/acts";
import { REFERENCE, SYNTHETIC_REFERENCE } from "../app/score";
import type { Deps } from "./agent";
import type { Env } from "./env";
import { DISCOVERY_REFERENCE, syntheticDiscoveryReference } from "../app/discovery";
import { memoryLimiter, ipBucket, type Limiter } from "./limits";
import { route, type RouterDeps } from "./router";
import { syntheticQlooFetch } from "./synthetic";

async function clientId(req: Request): Promise<string> {
  const ip = ipBucket(req.headers.get("cf-connecting-ip") ?? "local");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(buf).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let fallback: { scale: number; limiter: Limiter } | null = null;

/** Cloudflare's Rate Limiting binding per route; the in-memory counter when a binding is absent. A binding error lets the request through. */
function limiterFor(env: Env, scale: number): Limiter {
  const bound: Record<string, RateLimit | undefined> = { geocode: env.LIMIT_GEOCODE, analyze: env.LIMIT_ANALYZE, propose: env.LIMIT_PROPOSE, recheck: env.LIMIT_RECHECK };
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

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function depsFor(env: Env): RouterDeps {
  const synthetic = env.QLOO_MODE === "synthetic";
  const agent: Deps = {
    kv: env.CACHE,
    ai: env.AI ?? null,
    mode: synthetic ? "synthetic" : "live",
    qlooFetch: synthetic ? syntheticQlooFetch : (input, init) => fetch(input, init),
    qlooBase: env.QLOO_API_URL ?? (synthetic ? "https://synthetic.invalid" : ""),
    qlooKey: env.QLOO_API_KEY ?? "",
    library: activeLibrary(COMMITTED_IDS, synthetic),
    venueLibrary: activeLibrary(COMMITTED_IDS, synthetic, VENUE_LIBRARY),
    actsRef: synthetic ? syntheticActsReference() : ACTS_REFERENCE,
    ...(synthetic ? { popularityOf: (id: string) => (id.startsWith("SYN-") ? 0.9 : undefined) } : {}),
    reference: synthetic ? SYNTHETIC_REFERENCE : REFERENCE,
    discoveryRef: synthetic ? syntheticDiscoveryReference() : DISCOVERY_REFERENCE,
    now: () => new Date(),
    qlooDailyCap: num(env.QLOO_DAILY_CAP, 400),
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
    signingKey: env.MARKET_SIGNING_KEY && env.MARKET_SIGNING_KEY.length >= 16 ? env.MARKET_SIGNING_KEY : null,
  };
}

export default {
  fetch: (request: Request, env: Env) => route(request, depsFor(env)),
} satisfies ExportedHandler<Env>;
