import { memoryCounters, type CounterPort } from "../../src/worker/ports";

/** Counters that can be made to fail for some keys, and that remember what was asked. */
export function spyCounters(opts: { failKeys?: (key: string) => boolean; failAll?: boolean } = {}): CounterPort & { takes: Array<{ key: string; by: number; cap: number; ttl: number }>; marks: Array<{ key: string; ttl: number }>; inner: ReturnType<typeof memoryCounters> } {
  const inner = memoryCounters();
  const boom = (): never => {
    throw new Error("counter Durable Object unreachable");
  };
  const bad = (k: string): boolean => opts.failAll === true || (opts.failKeys?.(k) ?? false);
  const takes: Array<{ key: string; by: number; cap: number; ttl: number }> = [];
  const marks: Array<{ key: string; ttl: number }> = [];
  return {
    inner,
    takes,
    marks,
    take: async (key, by, cap, ttl) => (bad(key) ? boom() : (takes.push({ key, by, cap, ttl }), inner.take(key, by, cap, ttl))),
    read: async (keys) => (keys.some(bad) ? boom() : inner.read(keys)),
    mark: async (key, ttl) => (bad(key) ? boom() : (marks.push({ key, ttl }), inner.mark(key, ttl))),
    marked: async (key) => (bad(key) ? boom() : inner.marked(key)),
  };
}
