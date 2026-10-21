import { labelForZ } from "./score";
import type { Discovered } from "./propose/propose";

/** One title in the fixed pool Qloo is asked about in every market. */
export interface PoolTitle {
  entityId: string;
  name: string;
  type: "movie" | "tv_show";
  /** Qloo's national popularity for the title (0 to 1): a director only runs a night for a title people know. */
  popularity: number;
  /** Declared by us: a big theatrical title any family knows. Only these are offered as swaps or listed as ideas (a title can be popular on Qloo and still unknown to most people). */
  major?: boolean;
}

/** A discovered title must be a big-studio name to be run as a theme night (0.97), and nearly as well known to be listed as an idea (0.90). */
export const SWAP_POPULARITY = 0.97;
export const IDEA_POPULARITY = 0.9;

export interface DiscoveryReference {
  synthetic: boolean;
  markets: number;
  pulledAt: string | null;
  pool: PoolTitle[];
  /** Per-title aggregates over the reference markets: how many markets had a reading, and their mean and population SD. No market-level values. */
  stats: Record<string, { n: number; mean: number; sd: number }>;
}


/** Titles with fewer reference readings than this, or no spread between markets, cannot be ranked. */
export const MIN_DISCOVERY_N = 20;
const MIN_SD = 1e-6;

/** Made-up pool and aggregates for the offline synthetic mode (local runs and tests). Never from Qloo. */
export function syntheticDiscoveryReference(): DiscoveryReference {
  const movies = ["Moonpie Pirates", "Captain Pocketwatch", "The Marmalade Express", "Zippy and the Cloud Zoo", "Little Lantern Dragon", "Biscuit Bay Heroes", "Pip the Rocket Mouse", "The Tiny Tuba Parade", "Sunny Side Sleuths", "Wobbly Knight"];
  const shows = ["Puddle Patrol", "The Jellybean Bus", "Mango Moon Club", "Clementine Calling", "Fizz and Flick", "Treehouse Tuesday", "Sprocket Street", "The Pudding Pals", "Kite Runners", "Nimbus Nights"];
  const pool: PoolTitle[] = [
    ...movies.map((n, i) => ({ entityId: `SYN-D-movie-${i}`, name: `${n} (made up)`, type: "movie" as const, popularity: 0.99, major: true })),
    ...shows.map((n, i) => ({ entityId: `SYN-D-tv_show-${i}`, name: `${n} (made up)`, type: "tv_show" as const, popularity: 0.99, major: true })),
  ];
  return { synthetic: true, markets: 40, pulledAt: null, pool, stats: Object.fromEntries(pool.map((p) => [p.entityId, { n: 40, mean: 0.7, sd: 0.1 }])) };
}

/** z of one title's reading at this market against its spread over the reference markets. Null when it cannot be ranked. */
export function discoveryZ(affinity: number | null, stat: { n: number; mean: number; sd: number } | undefined): number | null {
  if (affinity === null || !stat || stat.n < MIN_DISCOVERY_N || stat.sd < MIN_SD) return null;
  return (affinity - stat.mean) / stat.sd;
}

/** Fewer scored pool titles than this and the market's own average over the pool is too thin to centre on (the library's rule is the same). */
export const MIN_POOL_FOR_CENTRE = 5;

/**
 * How far this market sits above or below the other markets on the whole pool: the mean z of every pool entry that has a reading here.
 * Subtracting it centres each z on the market's own average, the way the library index is centred, so a market that scores high on
 * everything does not show most of the pool as standing out. Zero when too few entries were scored.
 */
export function poolOffset(readings: ReadonlyMap<string, number | null>, pool: ReadonlyArray<{ entityId: string }>, stats: DiscoveryReference["stats"]): number {
  const zs = pool.flatMap((p) => {
    const z = discoveryZ(readings.get(p.entityId) ?? null, stats[p.entityId]);
    return z === null ? [] : [z];
  });
  return zs.length < MIN_POOL_FOR_CENTRE ? 0 : zs.reduce((s, z) => s + z, 0) / zs.length;
}

/** Every pool title with a reading here, ranked by its z centred on this market's own average over the pool (`offset`), best first. */
export function rankPool(readings: ReadonlyMap<string, number | null>, ref: DiscoveryReference, type: PoolTitle["type"], offset = 0): Discovered[] {
  const out: Discovered[] = [];
  for (const p of ref.pool) {
    if (p.type !== type) continue;
    const affinity = readings.get(p.entityId) ?? null;
    const z = discoveryZ(affinity, ref.stats[p.entityId]);
    if (z !== null) out.push({ name: p.name, entityId: p.entityId, type: p.type, affinity, z: z - offset, zRaw: z, popularity: p.popularity, ...(p.major ? { major: true } : {}) });
  }
  return out.sort((a, b) => (b.z ?? 0) - (a.z ?? 0) || a.name.localeCompare(b.name));
}

/** A title stands out when its z clears the same bar the library uses for "Leans in". */
export const standsOut = (d: Pick<Discovered, "z">): boolean => d.z !== undefined && d.z !== null && labelForZ(d.z) === "leans-in";

/** Stands out here and is well known enough to be a night. */
export const worthASwap = (d: Pick<Discovered, "z" | "popularity">): boolean => standsOut(d) && (d.popularity ?? 0) >= SWAP_POPULARITY;
export const worthAnIdea = (d: Pick<Discovered, "z" | "popularity">): boolean => standsOut(d) && (d.popularity ?? 0) >= IDEA_POPULARITY;
