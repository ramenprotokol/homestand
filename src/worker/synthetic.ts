import { COMMITTED_IDS } from "../app/themes/ids";
import { mulberry32 } from "../study/stats";

// Local test data in Qloo's response shape. Nothing here comes from Qloo: it is a deterministic made-up function so the
// whole app, the Worker and the tests run offline. Every response using it is labeled "synthetic".

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Two made-up entities whose readings barely differ between towns (within 0.006 of 0.9), the way a very popular title's real readings do. They exist
 * so the offline app and its tests show a "Leans weak" night with an optional swap (Super Mario) and one with no swap at all (Taylor Swift).
 */
const COMPRESSED_KEYS = ["super-mario:film", "taylor-swift:artist"];
/** Entity id (the made-up SYN id, or the committed Qloo id the Worker uses offline) to its key. The reading is made from the key, so both ids agree. */
const COMPRESSED_BY_ID: ReadonlyMap<string, string> = new Map(COMPRESSED_KEYS.flatMap((k) => [[`SYN-${k}`, k], [COMMITTED_IDS[k]?.id ?? "", k]] as Array<[string, string]>).filter(([id]) => id !== ""));
export const COMPRESSED_ENTITIES: ReadonlySet<string> = new Set(COMPRESSED_BY_ID.keys());

/** A made-up affinity in 0.42 to 0.99 for an entity at a point; varies with both. */
export function syntheticAffinity(entityId: string, lon: number, lat: number): number | null {
  // One test entity has no reading in far-northern markets, so the "Not scored" path is exercised offline.
  if (entityId === "SYN-minecraft:film" && lat > 43) return null;
  const base = 0.5 + 0.35 * mulberry32(hash(entityId))();
  const swing = (mulberry32(hash(`${entityId}|${lon.toFixed(1)}|${lat.toFixed(1)}`))() - 0.5) * 0.3;
  const ck = COMPRESSED_BY_ID.get(entityId);
  if (ck) return Number((0.9 + ((mulberry32(hash(`${ck}|${lon.toFixed(1)}|${lat.toFixed(1)}`))() - 0.5) / 0.5) * 0.003).toFixed(5));
  return Math.min(0.99, Math.max(0.42, base + swing));
}

const DISCOVER_MOVIES = ["Moonpie Pirates", "Captain Pocketwatch", "The Marmalade Express", "Zippy and the Cloud Zoo", "Little Lantern Dragon", "Biscuit Bay Heroes", "Pip the Rocket Mouse", "The Tiny Tuba Parade", "Sunny Side Sleuths", "Wobbly Knight"];
const DISCOVER_SHOWS = ["Puddle Patrol", "The Jellybean Bus", "Mango Moon Club", "Clementine Calling", "Fizz and Flick", "Treehouse Tuesday", "Sprocket Street", "The Pudding Pals", "Kite Runners", "Nimbus Nights"];
const DISCOVER_YOUNG = ["Glitter Garage", "Nova Nook", "Skatepark Sparrow", "The Snack Squad", "Pixel Playhouse", "Moonwalk Middle School"];

/** A fetch that answers Qloo's /v2/insights from the function above. */
export const syntheticQlooFetch: typeof fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.searchParams.get("filter.tags")) {
    // Discovery: made-up family titles, clearly labeled, in a fixed order.
    const type = (url.searchParams.get("filter.type") ?? "").replace("urn:entity:", "");
    const young = url.searchParams.has("signal.demographics.age");
    const names = young ? DISCOVER_YOUNG : type === "movie" ? DISCOVER_MOVIES : DISCOVER_SHOWS;
    const take = Number(url.searchParams.get("take") ?? names.length);
    const entities = names.slice(0, take).map((n, i) => ({ entity_id: `SYN-D-${type}${young ? "-y" : ""}-${i}`, name: `${n} (made up)`, query: { affinity: Math.round((0.95 - i * 0.03) * 100) / 100 } }));
    return new Response(JSON.stringify({ results: { entities } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  const ids = (url.searchParams.get("filter.results.entities") ?? "").split(",").filter(Boolean);
  const point = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(url.searchParams.get("signal.location") ?? "");
  const lon = point ? Number(point[1]) : 0;
  const lat = point ? Number(point[2]) : 0;
  const entities = ids.flatMap((id) => {
    const a = syntheticAffinity(id, lon, lat);
    return a === null ? [] : [{ entity_id: id, name: id, query: { affinity: a }, popularity: 0.9 }];
  });
  return new Response(JSON.stringify({ results: { entities } }), { status: 200, headers: { "content-type": "application/json" } });
};
