/** Bindings and vars for the Worker. Secrets come from .dev.vars locally and `wrangler secret` in production; never printed. */
export interface Env {
  CACHE: KVNamespace;
  /** The counter Durable Object (SQLite-backed, wrangler.toml). Absent: counters live in memory (tests, plain local runs). */
  COUNTERS?: DurableObjectNamespace<import("./counters-do").Counters>;
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  QLOO_API_KEY?: string;
  QLOO_API_URL?: string;
  /** "synthetic" answers Qloo calls from a local made-up function (local runs and e2e only). */
  QLOO_MODE?: string;
  ALLOWED_ORIGINS?: string;
  QLOO_DAILY_CAP?: string;
  AI_DAILY_CAP?: string;
  /** Multiplies the per-minute rate limits of the in-memory fallback. Local test runs only. */
  RATE_LIMIT_SCALE?: string;
  /** Secret: signs the places /api/geocode returns. Production needs it set (`wrangler secret put MARKET_SIGNING_KEY`). */
  MARKET_SIGNING_KEY?: string;
  /** Secret: lets POST /api/warm start a pre-warm run (see warm.ts). Unset means the route does not exist. */
  WARM_TOKEN?: string;
  /** Cloudflare Rate Limiting bindings, one per route (wrangler.toml). */
  LIMIT_GEOCODE?: RateLimit;
  LIMIT_ANALYZE?: RateLimit;
  LIMIT_PROPOSE?: RateLimit;
  LIMIT_RECHECK?: RateLimit;
  LIMIT_HEALTH?: RateLimit;
  LIMIT_MCP?: RateLimit;
  /** One constant key each: a ceiling on live new-city pulls and on model calls for everyone together, per minute. */
  LIMIT_GLOBAL_PULL?: RateLimit;
  LIMIT_GLOBAL_MODEL?: RateLimit;
}
