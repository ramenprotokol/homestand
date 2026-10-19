// Builds the fixed pool of popular touring acts that "Discovered by Qloo" scores in every venue market, and each act's spread
// over the same 40 reference markets the library uses. Two steps, same method as the family-title pool:
//   1. Pool: we declare the acts we would book (by genre, below). Qloo's artist genre tags give each genre's top 50 artists at two
//      spread-out reference markets (10 genres x 2 markets = 20 requests); a declared act is in the pool when its exact name is in
//      those lists with a national popularity of 0.9 or more. No fuzzy matching. Artists that are already library themes are dropped.
//   2. Reference: the pool scored at all 40 markets, one request per market with filter.results.entities (40 requests).
// Raw responses are checkpointed in data/raw (gitignored). What is committed (src/app/data/acts-reference.json) is derived: the pool as
// {entityId, name, genre, popularity} and per-act aggregates (n, mean, population SD). No market-level values.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { MIN_DISCOVERY_N } from "../src/app/discovery";
import { actBatches, MAX_POOL, type ActsReference, type PoolAct } from "../src/app/acts";
import { COMMITTED_IDS } from "../src/app/themes/ids";
import { normTitle } from "../src/app/themes/match";
import type { Genre } from "../src/app/themes/library";
import { mean, populationSd } from "../src/study/stats";
import { announce, client, dry } from "./lib";

const OUT = new URL("../src/app/data/acts-reference.json", import.meta.url);
const CLUBS = process.env.HOMESTAND_CLUBS ?? "data/derived/clubs-2025.json";
const POPULARITY_FLOOR = 0.9;
// An act whose reading barely moves between the 40 markets (Qloo's affinity saturates near 1 for the biggest names) cannot be ranked. 0.002 is about
// the spread of the flattest library artist the app already scores (Kenny Chesney); anything flatter is left out.
const MIN_POOL_SD = 0.002;

// Declared by us (genres checked by hand; acts that no longer tour, such as Elton John, Bob Seger, Aerosmith and Ozzy Osbourne, are not on the list): touring acts a promoter could hold a date for, by genre. Not every name will be in Qloo's lists; those that are not are left out.
type PoolGenre = Exclude<Genre, "yacht-rock">;
const DECLARED: Record<PoolGenre, string[]> = {
  country: ["Kane Brown", "Thomas Rhett", "Tim McGraw", "Keith Urban", "Eric Church", "Miranda Lambert", "Cody Johnson", "Tyler Childers", "Old Dominion", "Zac Brown Band", "Dierks Bentley", "Brad Paisley", "Darius Rucker", "Kelsea Ballerini", "Maren Morris", "Blake Shelton", "Kacey Musgraves"],
  rock: ["Metallica", "Pearl Jam", "Coldplay", "The Killers", "Twenty One Pilots", "Weezer", "Linkin Park", "John Mayer", "Greta Van Fleet", "Avril Lavigne", "Cage the Elephant"],
  pop: ["Harry Styles", "Olivia Rodrigo", "Billie Eilish", "Katy Perry", "Lady Gaga", "Sabrina Carpenter", "Shawn Mendes", "Demi Lovato", "Ariana Grande", "Halsey", "Khalid"],
  "hip-hop": ["Drake", "J. Cole", "Lil Wayne", "Megan Thee Stallion", "Cardi B", "Snoop Dogg", "Chance the Rapper", "DaBaby", "Lil Baby", "A$AP Rocky", "Machine Gun Kelly", "Tyler, the Creator", "Eminem", "Latto"],
  "r&b": ["Beyoncé", "Usher", "Alicia Keys", "Chris Brown", "Ciara", "Jhené Aiko", "Kehlani"],
  latin: ["J Balvin", "Shakira", "Maluma", "Ozuna", "Becky G", "Enrique Iglesias", "Romeo Santos", "Marc Anthony", "Rauw Alejandro", "Camilo", "Manuel Turizo"],
  "classic-rock": ["Bruce Springsteen", "The Rolling Stones", "Billy Joel", "Def Leppard", "Lynyrd Skynyrd", "Santana", "Rod Stewart", "ZZ Top", "John Mellencamp", "Queen"],
  jam: ["Billy Strings", "Tedeschi Trucks Band"],
  indie: ["My Morning Jacket", "The Revivalists", "Rainbow Kitten Surprise", "Mt. Joy", "Death Cab for Cutie", "Noah Kahan", "Hozier", "Mumford & Sons", "Vampire Weekend", "The 1975", "Glass Animals", "Bon Iver", "Lana Del Rey", "Phoebe Bridgers", "HAIM"],
  emo: ["blink-182", "Panic! at the Disco", "All Time Low", "Pierce the Veil", "Jimmy Eat World", "Taking Back Sunday", "Dashboard Confessional"],
};
const TAGS: Record<PoolGenre, string> = {
  country: "urn:tag:genre:music:country", rock: "urn:tag:genre:music:rock", pop: "urn:tag:genre:music:pop", "hip-hop": "urn:tag:genre:music:hip_hop", "r&b": "urn:tag:genre:music:r_b",
  latin: "urn:tag:genre:music:latin", "classic-rock": "urn:tag:genre:music:classic_rock", jam: "urn:tag:genre:music:jam_band", indie: "urn:tag:genre:music:indie", emo: "urn:tag:genre:music:emo",
};
const GENRES = Object.keys(DECLARED) as PoolGenre[];

const rows = JSON.parse(readFileSync(CLUBS, "utf8")) as Array<Record<string, unknown>>;
const points = rows
  .map((r) => ({ club: String(r.club), lat: Number(r.lat), lon: Number(r.lon) }))
  .sort((a, b) => a.club.localeCompare(b.club))
  .filter((_, i) => i % 3 === 0)
  .map(({ lat, lon }) => ({ lat, lon })); // the same 40 markets as qloo:reference; names dropped immediately
const byLon = [...points].sort((a, b) => a.lon - b.lon);
const poolMarkets = [byLon[Math.round(byLon.length * 0.2)]!, byLon[Math.round(byLon.length * 0.75)]!];
announce(`qloo:acts-reference (pool: ${GENRES.length} genres x ${poolMarkets.length} markets, then reference: ${points.length} markets)`, GENRES.length * poolMarkets.length + points.length * 2);
if (dry) process.exit(0);

const q = client();
const CK = "data/raw/acts-pull";
mkdirSync(CK, { recursive: true });
const libraryIds = new Set(Object.values(COMMITTED_IDS).map((v) => v.id));

// 1. Pool
const seen = new Map<string, { name: string; popularity: number }>();
for (const [mi, m] of poolMarkets.entries()) {
  for (const genre of GENRES) {
    const file = `${CK}/pool-${mi}-${genre.replace("&", "n")}.json`;
    const hits = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Array<{ entityId: string; name: string; popularity: number | null }>) : (await q.discoverArtists({ lon: m.lon, lat: m.lat, take: 50, tag: TAGS[genre] })).map((r) => ({ entityId: r.entityId, name: r.name, popularity: r.popularity }));
    writeFileSync(file, JSON.stringify(hits));
    for (const h of hits) if (h.popularity !== null) seen.set(h.entityId, { name: h.name, popularity: Math.max(h.popularity, seen.get(h.entityId)?.popularity ?? 0) });
  }
}
const byName = new Map<string, Array<[string, { name: string; popularity: number }]>>();
for (const e of seen.entries()) byName.set(normTitle(e[1].name), [...(byName.get(normTitle(e[1].name)) ?? []), e]);
const pool: PoolAct[] = [];
for (const genre of GENRES) {
  for (const name of DECLARED[genre]) {
    const found = byName.get(normTitle(name)) ?? [];
    if (found.length !== 1) { console.log(`not in the pool (${found.length === 0 ? "not in Qloo's lists" : "two entities share the name"}): ${name}`); continue; }
    const [entityId, v] = found[0]!;
    if (libraryIds.has(entityId)) { console.log(`already a library entity: ${name}`); continue; }
    if (v.popularity < POPULARITY_FLOOR) { console.log(`not in the pool (popularity under ${POPULARITY_FLOOR}): ${name}`); continue; }
    pool.push({ entityId, name: v.name, genre, popularity: Number(v.popularity.toFixed(4)) });
  }
}
console.log(`pool: ${pool.length} acts`);
if (pool.length > MAX_POOL) throw new Error(`pool of ${pool.length} is over ${MAX_POOL}`);
if (process.argv.includes("--pool-only")) process.exit(0);

// 2. Reference: the pool at every reference market, one batched artist request. The checkpoint name carries a hash of the pool, so a changed pool is never read from an old file.
const poolKey = createHash("sha256").update(pool.map((p) => p.entityId).join(",")).digest("hex").slice(0, 8);
const readings = new Map<string, number[]>(pool.map((p) => [p.entityId, []]));
for (const [i, m] of points.entries()) {
  // Qloo takes at most 50 entities per request, so the pool is asked about in batches of 50 (the same batches the app uses).
  for (const [c, ids] of actBatches(pool).entries()) {
    const file = `${CK}/ref-${poolKey}-${i}-${c}.json`;
    const res = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Array<{ entityId: string; affinity: number | null }>) : await q.localAffinity({ type: "artist", entityIds: ids, lon: m.lon, lat: m.lat, radiusM: 80000, take: ids.length });
    writeFileSync(file, JSON.stringify(res.map((r) => ({ entityId: r.entityId, affinity: r.affinity }))));
    for (const r of res) if (r.affinity !== null) readings.get(r.entityId)?.push(r.affinity);
  }
  console.log(`market ${i + 1}/${points.length} done`);
}
const stats: ActsReference["stats"] = {};
const usable: PoolAct[] = [];
for (const p of pool) {
  const xs = readings.get(p.entityId)!;
  if (xs.length < MIN_DISCOVERY_N || populationSd(xs) < MIN_POOL_SD) {
    console.log(`left out (${xs.length} readings, flat or thin): ${p.name}`);
    continue;
  }
  stats[p.entityId] = { n: xs.length, mean: Number(mean(xs).toFixed(6)), sd: Number(populationSd(xs).toFixed(6)) };
  usable.push(p);
}
const ref: ActsReference = { synthetic: false, markets: points.length, pulledAt: new Date().toISOString(), pool: usable, stats };
writeFileSync(OUT, JSON.stringify({ note: "A fixed pool of popular touring acts Qloo is asked about in every venue market, with per-act aggregates (n, mean, population SD of the local affinity) over the same 40-market reference set as reference-stats.json. Genres are declared by us. No market-level values are stored.", ...ref }, null, 2) + "\n");
console.log(`\nWrote a pool of ${usable.length} acts. Requests made: ${q.requests}.`);
