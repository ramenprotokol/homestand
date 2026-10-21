export interface KvPort {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface AiPort {
  run(model: string, input: unknown): Promise<unknown>;
}

export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** In-memory KV for tests. */
export function memoryKv(): KvPort & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    put: async (k, v) => void data.set(k, v),
  };
}

/**
 * Counters and gates: the shared daily Qloo and model caps, each client's daily allowances and the once-a-day re-check markers. In production they
 * live in one SQLite-backed Durable Object (counters-do.ts), because KV's free plan allows only 1,000 writes a day and one write a second per key.
 * Every method is atomic: `take` reads and writes the count in one step, so two requests can never both pass the last unit.
 */
export interface CounterPort {
  /** Adds `by` to the count under `key` unless that would pass `cap`. `used` is the count afterwards (or unchanged when refused). The count expires `ttlSec` after its last increase. */
  take(key: string, by: number, cap: number, ttlSec: number): Promise<{ ok: boolean; used: number }>;
  /** The current counts, in the order of `keys` (0 for a missing or expired one). */
  read(keys: string[]): Promise<number[]>;
  /** Sets a marker that lives `ttlSec`, and says whether one was already live. */
  mark(key: string, ttlSec: number): Promise<boolean>;
  /** Whether a live marker exists. */
  marked(key: string): Promise<boolean>;
}

/** In-memory counters for tests and local runs without the Durable Object. Same rules as the real one. */
export function memoryCounters(now: () => number = Date.now): CounterPort & { rows: Map<string, { n: number; exp: number }> } {
  const rows = new Map<string, { n: number; exp: number }>();
  const live = (k: string): { n: number; exp: number } | undefined => {
    const r = rows.get(k);
    return r && r.exp > now() ? r : undefined;
  };
  return {
    rows,
    take: async (key, by, cap, ttlSec) => {
      const n = live(key)?.n ?? 0;
      if (n + by > cap) return { ok: false, used: n };
      rows.set(key, { n: n + by, exp: now() + ttlSec * 1000 });
      return { ok: true, used: n + by };
    },
    read: async (keys) => keys.map((k) => live(k)?.n ?? 0),
    mark: async (key, ttlSec) => {
      const had = live(key) !== undefined;
      if (!had) rows.set(key, { n: 1, exp: now() + ttlSec * 1000 });
      return had;
    },
    marked: async (key) => live(key) !== undefined,
  };
}
