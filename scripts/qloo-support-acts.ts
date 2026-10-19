// Adds rising and touring theatre-tier acts to the act pool, so a support-act idea has real candidates one tier below an amphitheatre headliner.
//   1. Resolve: each declared name is searched on Qloo and accepted only on an exact name match (one request per name; nothing fuzzy).
//   2. Reference: the resolved acts are scored at the same 40 reference markets as the rest of the pool, one batched request per market.
//      An act with fewer than 20 readings, or whose reading barely moves between markets (spread under 0.002), is left out.
// Genre and tier are declared by us (the tier is our own judgement of the room an act headlines, not Qloo data). These acts need no popularity floor:
// they are used only as support acts. What is committed is derived: {id, name, genre, tier, popularity} and per-act aggregates. Raw responses stay in data/raw.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { MIN_DISCOVERY_N } from "../src/app/discovery";
import type { ActsReference, PoolAct } from "../src/app/acts";
import type { Genre } from "../src/app/themes/library";
import { pickEntity } from "../src/study/day1";
import { mean, populationSd } from "../src/study/stats";
import { announce, client, dry } from "./lib";

const OUT = new URL("../src/app/data/acts-reference.json", import.meta.url);
const CLUBS = process.env.HOMESTAND_CLUBS ?? "data/derived/clubs-2025.json";
const MIN_SD = 0.002;

const DECLARED: Array<[string, Genre]> = [
  ["Zach Top", "country"], ["Ian Munsick", "country"], ["Nate Smith", "country"], ["Dylan Gossett", "country"], ["Corey Kent", "country"], ["Tucker Wetmore", "country"],
  ["Charley Crockett", "country"], ["Sierra Ferrell", "country"], ["Colter Wall", "country"], ["Margo Price", "country"],
  ["Briston Maroney", "indie"], ["Gregory Alan Isakov", "indie"], ["Lord Huron", "indie"], ["Wallows", "indie"], ["Sam Fender", "indie"],
  ["The Struts", "rock"], ["Dirty Honey", "rock"], ["Palaye Royale", "rock"],
  ["Goose", "jam"], ["Umphrey's McGee", "jam"], ["Billy Strings", "jam"],
  ["Gracie Abrams", "pop"], ["Role Model", "pop"],
  ["Danny Ocean", "latin"], ["Young Miko", "latin"], ["Kali Uchis", "latin"],
];

const rows = JSON.parse(readFileSync(CLUBS, "utf8")) as Array<Record<string, unknown>>;
const points = rows
  .map((r) => ({ club: String(r.club), lat: Number(r.lat), lon: Number(r.lon) }))
  .sort((a, b) => a.club.localeCompare(b.club))
  .filter((_, i) => i % 3 === 0)
  .map(({ lat, lon }) => ({ lat, lon })); // the same 40 markets as qloo:reference; names dropped immediately
announce(`qloo:support-acts (resolve ${DECLARED.length} names, then reference: ${points.length} markets)`, DECLARED.length + points.length);
if (dry) process.exit(0);

const q = client();
const CK = "data/raw/support-acts";
mkdirSync(CK, { recursive: true });
const ref = JSON.parse(readFileSync(OUT, "utf8")) as ActsReference & { note?: string };
const have = new Set(ref.pool.map((p) => p.entityId));

const found: Array<PoolAct> = [];
for (const [name, genre] of DECLARED) {
  const file = `${CK}/search-${name.replace(/[^a-z0-9]+/gi, "-")}.json`;
  const cands = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Awaited<ReturnType<typeof q.search>>) : await q.search(name, "artist", 5);
  writeFileSync(file, JSON.stringify(cands));
  const hit = pickEntity(cands, { names: [name] });
  if (!hit) { console.log(`not resolved (no exact name match, so not guessed): ${name}`); continue; }
  if (have.has(hit.entityId)) { console.log(`already in the pool: ${name}`); continue; }
  found.push({ entityId: hit.entityId, name: hit.name, genre, tier: "theatre", popularity: Number((hit.popularity ?? 0.5).toFixed(4)) });
}
console.log(`resolved ${found.length} of ${DECLARED.length}`);

const readings = new Map<string, number[]>(found.map((p) => [p.entityId, []]));
for (const [i, m] of points.entries()) {
  const file = `${CK}/ref-${i}.json`;
  const ids = found.map((p) => p.entityId);
  const res = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Array<{ entityId: string; affinity: number | null }>) : await q.localAffinity({ type: "artist", entityIds: ids, lon: m.lon, lat: m.lat, radiusM: 80000, take: ids.length });
  writeFileSync(file, JSON.stringify(res.map((r) => ({ entityId: r.entityId, affinity: r.affinity }))));
  for (const r of res) if (r.affinity !== null) readings.get(r.entityId)?.push(r.affinity);
  console.log(`market ${i + 1}/${points.length} done`);
}
let added = 0;
for (const p of found) {
  const xs = readings.get(p.entityId)!;
  if (xs.length < MIN_DISCOVERY_N || populationSd(xs) < MIN_SD) {
    console.log(`left out (${xs.length} readings, flat or thin): ${p.name}`);
    continue;
  }
  ref.stats[p.entityId] = { n: xs.length, mean: Number(mean(xs).toFixed(6)), sd: Number(populationSd(xs).toFixed(6)) };
  ref.pool.push(p);
  added++;
}
writeFileSync(OUT, JSON.stringify(ref, null, 2) + "\n");
console.log(`\nAdded ${added} support acts; the pool is now ${ref.pool.length}. Requests made: ${q.requests}.`);
