import referenceFile from "./data/discovery-reference.json";
import { labelForZ } from "./score";
import type { Discovered } from "./propose/propose";

/** One title in the fixed pool Qloo is asked about in every market. */
export interface PoolTitle {
  entityId: string;
  name: string;
  type: "movie" | "tv_show";
}

export interface DiscoveryReference {
  synthetic: boolean;
  markets: number;
  pulledAt: string | null;
  pool: PoolTitle[];
  /** Per-title aggregates over the reference markets: how many markets had a reading, and their mean and population SD. No market-level values. */
  stats: Record<string, { n: number; mean: number; sd: number }>;
}

export const DISCOVERY_REFERENCE: DiscoveryReference = referenceFile as DiscoveryReference;

/** Titles with fewer reference readings than this, or no spread between markets, cannot be ranked. */
export const MIN_DISCOVERY_N = 20;
const MIN_SD = 1e-6;

/** Made-up pool and aggregates for the offline synthetic mode (local runs and tests). Never from Qloo. */
export function syntheticDiscoveryReference(): DiscoveryReference {
  const movies = ["Moonpie Pirates", "Captain Pocketwatch", "The Marmalade Express", "Zippy and the Cloud Zoo", "Little Lantern Dragon", "Biscuit Bay Heroes", "Pip the Rocket Mouse", "The Tiny Tuba Parade", "Sunny Side Sleuths", "Wobbly Knight"];
  const shows = ["Puddle Patrol", "The Jellybean Bus", "Mango Moon Club", "Clementine Calling", "Fizz and Flick", "Treehouse Tuesday", "Sprocket Street", "The Pudding Pals", "Kite Runners", "Nimbus Nights"];
  const pool: PoolTitle[] = [
    ...movies.map((n, i) => ({ entityId: `SYN-D-movie-${i}`, name: `${n} (made up)`, type: "movie" as const })),
    ...shows.map((n, i) => ({ entityId: `SYN-D-tv_show-${i}`, name: `${n} (made up)`, type: "tv_show" as const })),
  ];
  return { synthetic: true, markets: 40, pulledAt: null, pool, stats: Object.fromEntries(pool.map((p) => [p.entityId, { n: 40, mean: 0.7, sd: 0.1 }])) };
}

/** z of one title's reading at this market against its spread over the reference markets. Null when it cannot be ranked. */
export function discoveryZ(affinity: number | null, stat: { n: number; mean: number; sd: number } | undefined): number | null {
  if (affinity === null || !stat || stat.n < MIN_DISCOVERY_N || stat.sd < MIN_SD) return null;
  return (affinity - stat.mean) / stat.sd;
}

/** Every pool title with a reading here, ranked by z, best first. */
export function rankPool(readings: ReadonlyMap<string, number | null>, ref: DiscoveryReference, type: PoolTitle["type"]): Discovered[] {
  const out: Discovered[] = [];
  for (const p of ref.pool) {
    if (p.type !== type) continue;
    const affinity = readings.get(p.entityId) ?? null;
    const z = discoveryZ(affinity, ref.stats[p.entityId]);
    if (z !== null) out.push({ name: p.name, entityId: p.entityId, type: p.type, affinity, z });
  }
  return out.sort((a, b) => (b.z ?? 0) - (a.z ?? 0) || a.name.localeCompare(b.name));
}

/** A title stands out when its z clears the same bar the library uses for "Leans in". */
export const standsOut = (d: Pick<Discovered, "z">): boolean => d.z !== undefined && d.z !== null && labelForZ(d.z) === "leans-in";
