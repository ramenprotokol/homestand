// Builds the fixed pool of family-friendly animated titles that "Discovered by Qloo" scores in every market, and each title's
// spread over the same 40 reference markets the library uses. Two steps:
//   1. Pool: the top 30 family+animation (intersection) movies and top 30 shows at 8 evenly spread reference markets (16 requests).
//      Titles that are already library themes are dropped; a title with no popularity from Qloo, or under 0.7, is dropped; 60 per type at most.
//   2. Reference: the pool scored at all 40 markets, one request per type per market with filter.results.entities (80 requests).
// Raw responses are checkpointed in data/raw (gitignored). What is committed (src/app/data/discovery-reference.json) is derived:
// the pool as {entityId, name, type} and per-title aggregates (n, mean, population SD). No market-level values, same as reference-stats.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { MIN_DISCOVERY_N, type DiscoveryReference, type PoolTitle } from "../src/app/discovery";
import { COMMITTED_IDS } from "../src/app/themes/ids";
import { libraryTitleMatcher } from "../src/app/themes/match";
import { THEME_LIBRARY } from "../src/app/themes/library";
import { mean, populationSd } from "../src/study/stats";
import { announce, client, dry } from "./lib";

const OUT = new URL("../src/app/data/discovery-reference.json", import.meta.url);
const CLUBS = process.env.HOMESTAND_CLUBS ?? "data/derived/clubs-2025.json";
const POPULARITY_FLOOR = 0.7;
const PER_TYPE = 60;

const rows = JSON.parse(readFileSync(CLUBS, "utf8")) as Array<Record<string, unknown>>;
const points = rows
  .map((r) => ({ club: String(r.club), lat: Number(r.lat), lon: Number(r.lon) }))
  .sort((a, b) => a.club.localeCompare(b.club))
  .filter((_, i) => i % 3 === 0)
  .map(({ lat, lon }) => ({ lat, lon })); // the same 40 markets as qloo:reference; names dropped immediately
// Eight markets spread from west to east for the pool step.
const byLon = [...points].sort((a, b) => a.lon - b.lon);
const poolMarkets = Array.from({ length: 8 }, (_, i) => byLon[Math.round((i * (byLon.length - 1)) / 7)]!);
announce(`qloo:discovery-reference (pool: ${poolMarkets.length} markets x 2 types, then reference: ${points.length} markets x 2 types)`, poolMarkets.length * 2 + points.length * 2);
if (dry) process.exit(0);

const q = client();
const CK = "data/raw/discovery-pull";
mkdirSync(CK, { recursive: true });
const isLibrary = libraryTitleMatcher(new Set(Object.values(COMMITTED_IDS).map((v) => v.id)), THEME_LIBRARY);
const types = ["movie", "tv_show"] as const;

// 1. Pool
const seen = new Map<string, { name: string; type: PoolTitle["type"]; appearances: number; popularity: number | null }>();
for (const [i, m] of poolMarkets.entries()) {
  for (const type of types) {
    const file = `${CK}/pool-${i}-${type}.json`;
    const hits = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Awaited<ReturnType<typeof q.discoverFamily>>) : await q.discoverFamily({ type, lon: m.lon, lat: m.lat, radiusM: 80000, take: 30 });
    writeFileSync(file, JSON.stringify(hits));
    for (const h of hits) {
      const cur = seen.get(h.entityId);
      if (cur) {
        cur.appearances++;
        cur.popularity = Math.max(cur.popularity ?? 0, h.popularity ?? 0) || cur.popularity;
      } else seen.set(h.entityId, { name: h.name, type, appearances: 1, popularity: h.popularity });
    }
  }
}
const pool: PoolTitle[] = [];
for (const type of types) {
  const kept = [...seen.entries()]
    .filter(([id, v]) => v.type === type && !isLibrary(id, v.name) && v.popularity !== null && v.popularity >= POPULARITY_FLOOR)
    .sort((a, b) => b[1].appearances - a[1].appearances || (b[1].popularity ?? 0) - (a[1].popularity ?? 0) || a[1].name.localeCompare(b[1].name))
    .slice(0, PER_TYPE);
  console.log(`${type}: ${[...seen.values()].filter((v) => v.type === type).length} candidates, ${kept.length} kept`);
  for (const [entityId, v] of kept) pool.push({ entityId, name: v.name, type, popularity: Number(v.popularity!.toFixed(4)) });
}

// 2. Reference: the pool at every reference market
const readings = new Map<string, number[]>(pool.map((p) => [p.entityId, []]));
for (const [i, m] of points.entries()) {
  for (const type of types) {
    const ids = pool.filter((p) => p.type === type).map((p) => p.entityId);
    const file = `${CK}/ref-${i}-${type}.json`;
    const res = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Array<{ entityId: string; affinity: number | null }>) : await q.localAffinity({ type, entityIds: ids, lon: m.lon, lat: m.lat, radiusM: 80000, take: ids.length, ...(type === "movie" ? { releaseYearMin: 1900 } : {}) });
    writeFileSync(file, JSON.stringify(res.map((r) => ({ entityId: r.entityId, affinity: r.affinity }))));
    for (const r of res) if (r.affinity !== null) readings.get(r.entityId)?.push(r.affinity);
  }
  console.log(`market ${i + 1}/${points.length} done`);
}
const stats: DiscoveryReference["stats"] = {};
const usable: PoolTitle[] = [];
for (const p of pool) {
  const xs = readings.get(p.entityId)!;
  if (xs.length < MIN_DISCOVERY_N || populationSd(xs) < 0.005) {
    console.log(`left out (${xs.length} readings, flat or thin): ${p.name}`);
    continue;
  }
  stats[p.entityId] = { n: xs.length, mean: Number(mean(xs).toFixed(6)), sd: Number(populationSd(xs).toFixed(6)) };
  usable.push(p);
}
const ref: DiscoveryReference = { synthetic: false, markets: points.length, pulledAt: new Date().toISOString(), pool: usable, stats };
writeFileSync(OUT, JSON.stringify({ note: "A fixed pool of family-friendly animated titles Qloo is asked about in every market, with per-title aggregates (n, mean, population SD of the local affinity) over the same 40-market reference set as reference-stats.json. No market-level values are stored.", ...ref }, null, 2) + "\n");
console.log(`\nWrote a pool of ${usable.length} titles (${usable.filter((p) => p.type === "movie").length} movies, ${usable.filter((p) => p.type === "tv_show").length} shows). Requests made: ${q.requests}.`);
