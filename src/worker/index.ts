import { activeLibrary, COMMITTED_IDS } from "../app/themes/ids";
import { REFERENCE } from "../app/score";
import type { Deps } from "./agent";
import type { Env } from "./env";
import { route, type RouterDeps } from "./router";
import { syntheticQlooFetch } from "./synthetic";

async function clientId(req: Request): Promise<string> {
  const ip = req.headers.get("cf-connecting-ip") ?? "local";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(buf).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
    qlooFetch: synthetic ? syntheticQlooFetch : fetch,
    qlooBase: env.QLOO_API_URL ?? (synthetic ? "https://synthetic.invalid" : ""),
    qlooKey: env.QLOO_API_KEY ?? "",
    library: activeLibrary(COMMITTED_IDS, synthetic),
    reference: REFERENCE,
    now: () => new Date(),
    qlooDailyCap: num(env.QLOO_DAILY_CAP, 400),
    aiDailyCap: num(env.AI_DAILY_CAP, 150),
    qlooDelayMs: synthetic ? 0 : 260,
  };
  return {
    agent,
    kv: env.CACHE,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    geocodeFetch: fetch,
    clientId,
  };
}

export default {
  fetch: (request: Request, env: Env) => route(request, depsFor(env)),
} satisfies ExportedHandler<Env>;
