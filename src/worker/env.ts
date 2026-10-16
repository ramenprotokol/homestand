/** Bindings and vars for the Worker. Secrets come from .dev.vars locally and `wrangler secret` in production; never printed. */
export interface Env {
  CACHE: KVNamespace;
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  QLOO_API_KEY?: string;
  QLOO_API_URL?: string;
  /** "synthetic" answers Qloo calls from a local made-up function (local runs and e2e only). */
  QLOO_MODE?: string;
  ALLOWED_ORIGINS?: string;
  QLOO_DAILY_CAP?: string;
  AI_DAILY_CAP?: string;
  /** Multiplies the per-minute rate limits. Local test runs only. */
  RATE_LIMIT_SCALE?: string;
}
