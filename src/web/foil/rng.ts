/** Small seeded generator, so the painted hero and the crowds are the same on every load. */
export interface Rand {
  /** 0 up to 1. */
  R: () => number;
  /** a up to b. */
  rr: (a: number, b: number) => number;
}

export function makeRand(seed: number): Rand {
  let a = seed;
  const R = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { R, rr: (lo, hi) => lo + (hi - lo) * R() };
}

/** Shared, unseeded randomness for effects that should differ on each run. */
export const rand = (lo: number, hi: number): number => lo + (hi - lo) * Math.random();
