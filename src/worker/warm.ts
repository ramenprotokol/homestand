import { QlooUnavailableError } from "../qloo/client";
import { capsOf, CappedError, warmMarket, type Deps } from "./agent";
import { METROS } from "./metros";

// Pre-warm: saves the ratings for the largest US and Canadian metros so a judge's first search is instant and costs no live Qloo call.
// Runs from a cron trigger (wrangler.toml) a few towns at a time, and on demand through POST /api/warm with a secret token.
// Budget (Cloudflare free plan): a new town is 3 KV writes, so 8 a run x 8 runs a day is about 190 writes of the 1,000 allowed, and about 7 Qloo
// calls per town. Towns already saved cost only reads, so once the list is warm a run does nothing.

/** Most towns warmed in one run. */
export const WARM_PER_RUN = 8;
/** A run stops once this share of the day's Qloo allowance is spent, so live visitors always keep headroom. */
export const WARM_SHARE_OF_CAP = 0.4;

export interface WarmSummary {
  warmed: number;
  alreadySaved: number;
  failed: number;
  /** Why the run stopped early, or null when it ran through. */
  stoppedBecause: "per-run limit" | "daily share" | "daily cap" | "key refused" | "counters" | "failures" | null;
  /** The towns warmed in this run. */
  towns: string[];
}

export async function runWarm(d: Deps, opts: { max?: number; metros?: ReadonlyArray<{ label: string; lon: number; lat: number }> } = {}): Promise<WarmSummary> {
  const max = opts.max ?? WARM_PER_RUN;
  const out: WarmSummary = { warmed: 0, alreadySaved: 0, failed: 0, stoppedBecause: null, towns: [] };
  if (d.mode !== "live") return out;
  let failuresInARow = 0;
  for (const m of opts.metros ?? METROS) {
    if (out.warmed >= max) {
      out.stoppedBecause = "per-run limit";
      break;
    }
    const caps = await capsOf(d);
    if (caps.qlooRemaining < d.qlooDailyCap * (1 - WARM_SHARE_OF_CAP)) {
      out.stoppedBecause = "daily share";
      break;
    }
    try {
      if ((await warmMarket(d, m)) === "cached") out.alreadySaved++;
      else {
        out.warmed++;
        out.towns.push(m.label);
      }
      failuresInARow = 0;
    } catch (err) {
      if (err instanceof CappedError) {
        out.stoppedBecause = err.countersDown ? "counters" : "daily cap";
        break;
      }
      if (err instanceof QlooUnavailableError && err.why === "auth") {
        out.stoppedBecause = "key refused";
        break;
      }
      out.failed++;
      console.error("warm failed", m.label, err instanceof Error ? err.message : String(err));
      if (++failuresInARow >= 3) {
        out.stoppedBecause = "failures";
        break;
      }
    }
  }
  return out;
}

const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** POST /api/warm?max=N with `Authorization: Bearer <WARM_TOKEN>`. Without a WARM_TOKEN secret the route does not exist. */
export async function warmFetch(request: Request, env: { WARM_TOKEN?: string }, d: Deps): Promise<Response> {
  const token = env.WARM_TOKEN;
  if (!token || token.length < 16 || request.method !== "POST") return new Response(JSON.stringify({ error: "not-found", message: "No such route." }), { status: 404, headers: { "content-type": "application/json" } });
  if (!sameText(request.headers.get("authorization") ?? "", `Bearer ${token}`)) return new Response(JSON.stringify({ error: "forbidden", message: "Not allowed." }), { status: 403, headers: { "content-type": "application/json" } });
  const asked = Number(new URL(request.url).searchParams.get("max"));
  const max = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 25) : WARM_PER_RUN;
  return new Response(JSON.stringify(await runWarm(d, { max })), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
