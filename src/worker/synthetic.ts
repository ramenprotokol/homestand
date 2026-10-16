import { mulberry32 } from "../study/stats";

// Local test data in Qloo's response shape. Nothing here comes from Qloo: it is a deterministic made-up function so the
// whole app, the Worker and the tests run offline. Every response using it is labelled "synthetic".

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A made-up affinity in 0.42 to 0.99 for an entity at a point; varies with both. */
export function syntheticAffinity(entityId: string, lon: number, lat: number): number | null {
  // One test entity has no reading in far-northern markets, so the "Not scored" path is exercised offline.
  if (entityId === "SYN-minecraft:film" && lat > 43) return null;
  const base = 0.5 + 0.35 * mulberry32(hash(entityId))();
  const swing = (mulberry32(hash(`${entityId}|${lon.toFixed(1)}|${lat.toFixed(1)}`))() - 0.5) * 0.3;
  return Math.min(0.99, Math.max(0.42, base + swing));
}

/** A fetch that answers Qloo's /v2/insights from the function above. */
export const syntheticQlooFetch: typeof fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
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
