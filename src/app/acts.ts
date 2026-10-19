import referenceFile from "./data/acts-reference.json";
import { discoveryZ, standsOut } from "./discovery";
import type { Discovered } from "./propose/propose";
import type { Genre } from "./themes/library";

/** One touring act in the fixed pool Qloo is asked about in every venue market. The genre is ours (declared in the pool script). */
export interface PoolAct {
  entityId: string;
  name: string;
  genre: Genre;
  /** Qloo's national popularity for the artist (0 to 1): a promoter only books an act people know. */
  popularity: number;
}

/** A discovered act must be nationally well known to be offered. */
export const ACT_POPULARITY = 0.95;

export interface ActsReference {
  synthetic: boolean;
  markets: number;
  pulledAt: string | null;
  pool: PoolAct[];
  /** Per-act aggregates over the reference markets: how many markets had a reading, and their mean and population SD. No market-level values. */
  stats: Record<string, { n: number; mean: number; sd: number }>;
}

export const ACTS_REFERENCE: ActsReference = referenceFile as ActsReference;

/** Qloo takes at most 50 entities per request: the pool is asked about in batches of this size (so at most two requests). */
export const BATCH = 50;
export const MAX_POOL = 2 * BATCH;

/** The pool's Qloo ids in the fixed batches the app and the reference script both use. */
export function actBatches(pool: readonly Pick<PoolAct, "entityId">[]): string[][] {
  const ids = pool.map((p) => p.entityId);
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH) out.push(ids.slice(i, i + BATCH));
  return out;
}

/** Made-up pool and aggregates for the offline synthetic mode (local runs and tests). Never from Qloo. */
export function syntheticActsReference(): ActsReference {
  const names: Array<[Genre, string[]]> = [
    ["country", ["Dusty Lantern Band", "Hollis Creek"]], ["rock", ["The Static Parade", "Brass Comet"]], ["pop", ["Velvet Arcade", "Mina Starling"]], ["hip-hop", ["Lowtide Kid", "Cassette Royal"]],
    ["latin", ["Luna Cobre", "Sol y Marea"]], ["classic-rock", ["The Midnight Ramblers", "Silver Canyon"]], ["jam", ["Parade of Owls", "Fern & Lantern"]], ["indie", ["Paper Lighthouse", "Quiet Maple"]],
    ["r&b", ["Satin Hours", "Dev Marlowe"]], ["emo", ["Lights Out Sunday", "Paper Hearts Club"]],
  ];
  const pool: PoolAct[] = names.flatMap(([genre, list]) => list.map((n, i) => ({ entityId: `SYN-A-${genre}-${i}`, name: `${n} (made up)`, genre, popularity: 0.99 })));
  return { synthetic: true, markets: 40, pulledAt: null, pool, stats: Object.fromEntries(pool.map((p) => [p.entityId, { n: 40, mean: 0.7, sd: 0.1 }])) };
}

/** Every pool act with a reading here, ranked by z against its own spread over the reference markets, best first. */
export function rankActs(readings: ReadonlyMap<string, number | null>, ref: ActsReference): Discovered[] {
  const out: Discovered[] = [];
  for (const p of ref.pool) {
    const affinity = readings.get(p.entityId) ?? null;
    const z = discoveryZ(affinity, ref.stats[p.entityId]);
    if (z !== null) out.push({ name: p.name, entityId: p.entityId, type: "artist", genre: p.genre, affinity, z, popularity: p.popularity });
  }
  return out.sort((a, b) => (b.z ?? 0) - (a.z ?? 0) || a.name.localeCompare(b.name));
}

/** Stands out here (the same z bar as "Leans in") and is well known enough to book. */
export const worthABooking = (d: Pick<Discovered, "z" | "popularity">): boolean => standsOut(d) && (d.popularity ?? 0) >= ACT_POPULARITY;


