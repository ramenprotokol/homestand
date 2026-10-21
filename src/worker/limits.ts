/** Per-minute limits by route (raised for judging: several judges can share one office address), used by the in-memory fallback and as the numbers wrangler.toml's rate limit bindings mirror. */
export const LIMITS: Record<string, number> = { analyze: 30, propose: 40, recheck: 15, geocode: 20, health: 30, mcp: 60 };

export type Limiter = (route: string, clientId: string) => Promise<boolean>;

/** Per-isolate fallback when the Rate Limiting binding is absent (unit tests, plain local runs). Production uses the binding. */
export function memoryLimiter(scale = 1, now: () => number = Date.now): Limiter {
  const counts = new Map<string, number>();
  return async (route, id) => {
    const minute = Math.floor(now() / 60_000);
    for (const k of counts.keys()) if (!k.endsWith(`:${minute}`)) counts.delete(k);
    const key = `${route}:${id}:${minute}`;
    const n = counts.get(key) ?? 0;
    if (n >= (LIMITS[route] ?? 10) * scale) return false;
    counts.set(key, n + 1);
    return true;
  };
}

/**
 * The part of an IP that identifies a household. An IPv6 user can change the low 64 bits at will, so only the /64 counts.
 * IPv4 and anything unrecognized are returned as they are.
 */
export function ipBucket(ip: string): string {
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;
  const [head, tail] = ip.split("::");
  const a = head ? head.split(":") : [];
  const b = tail !== undefined && tail ? tail.split(":") : [];
  const groups = tail === undefined ? a : [...a, ...Array<string>(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b];
  if (groups.length !== 8) return ip;
  return groups.slice(0, 4).map((g) => g.toLowerCase().padStart(4, "0")).join(":") + "::/64";
}

export type QuotaKind = "pull" | "recheck" | "model" | "taste";
/**
 * Per client, per UTC day. A client is one IP (or one IPv6 /64), and during judging a whole office of judges can share one, so the new-city
 * allowance is 30 (the rules ask that nothing restricts a judge). The shared daily caps in agent.ts, not these, keep the total bounded.
 */
export const DAILY_QUOTA: Record<QuotaKind, number> = { pull: 30, recheck: 20, model: 60, taste: 40 };
