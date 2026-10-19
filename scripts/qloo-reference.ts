// Builds the reference set: every third club (alphabetical) of the club list, 40 of 120. The club list is MLB-derived,
// so it is read OFFLINE here (only club, city, state, lat, lon), and nothing from it is written down: the output is
// per-theme aggregates (n, mean, population SD of the bundle score) and nothing else.
// Requests: one per entity type per market.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { bundleScore } from "../src/app/score";
import { idsOfType } from "../src/app/themes/ids";
import { mean, populationSd } from "../src/study/stats";
import { ARTIST_LIBRARY } from "../src/app/themes/artists";
import { REF_PATH, announce, client, dry, liveLibrary, liveVenueLibrary, readIds, typesOf, writeIds } from "./lib";

const CLUBS = process.env.HOMESTAND_CLUBS ?? "data/derived/clubs-2025.json";
const rows = JSON.parse(readFileSync(CLUBS, "utf8")) as Array<Record<string, unknown>>;
const points = rows
  .map((r) => ({ club: String(r.club), lat: Number(r.lat), lon: Number(r.lon) }))
  .sort((a, b) => a.club.localeCompare(b.club))
  .filter((_, i) => i % 3 === 0)
  .map(({ lat, lon }) => ({ lat, lon })); // names are dropped immediately
if (points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon))) throw new Error("a reference club lacks coordinates");
// --venue: pull only the artist themes that exist for concert venues (src/app/themes/artists.ts) and add their aggregates to the existing
// file. The club themes already in the file are left exactly as they are.
const venue = process.argv.includes("--venue");
const venueOnly = new Set(ARTIST_LIBRARY.map((t) => t.id));
const lib = venue ? liveVenueLibrary().filter((t) => venueOnly.has(t.id)) : liveLibrary();
const types = typesOf(lib);
announce(`qloo:reference (${points.length} markets x ${types.length} types)`, points.length * types.length);
if (dry) process.exit(0);

const q = client();
// Checkpoint per market in data/raw (gitignored), so a stopped run resumes without repeating requests.
const CK = venue ? "data/raw/reference-pull-venue" : "data/raw/reference-pull";
mkdirSync(CK, { recursive: true });
const readings: Array<Map<string, number | null>> = [];
for (const [i, p] of points.entries()) {
  const ckFile = `${CK}/${i}.json`;
  const byId = new Map<string, number | null>(existsSync(ckFile) ? (JSON.parse(readFileSync(ckFile, "utf8")) as Array<[string, number | null]>) : []);
  for (const type of byId.size > 0 ? [] : types) {
    const ids = idsOfType(lib, type);
    const res = await q.localAffinity({
      type, entityIds: ids, lon: p.lon, lat: p.lat, radiusM: 80000,
      ...(type === "movie" ? { releaseYearMin: 1900 } : {}), ...(ids.length > 20 ? { take: ids.length } : {}),
    });
    for (const r of res) byId.set(r.entityId, r.affinity);
  }
  writeFileSync(ckFile, JSON.stringify([...byId]));
  readings.push(byId);
  console.log(`market ${i + 1}/${points.length} done`);
}
// Venue themes: an artist with no reading at any of the 40 markets has no local signal. Same rule as qloo:coverage: its ID is dropped, and the theme
// is scored on the entities that remain (or is left out when none remain).
const dead = new Set<string>();
if (venue) {
  const file = readIds();
  for (const t of lib) {
    for (const e of t.entities) {
      if (readings.some((r) => r.get(e.id) != null)) continue;
      dead.add(e.id);
      delete file.ids[e.key];
      (file.dropped ??= {})[e.key] = "no local affinity at any of the 40 reference markets";
      console.log(`dropped ${e.key}: no reading at any reference market`);
    }
  }
  writeIds(file);
}
const perTheme: Record<string, number[]> = Object.fromEntries(lib.map((t) => [t.id, []]));
for (const byId of readings) {
  for (const t of lib) {
    const live = t.entities.filter((e) => !dead.has(e.id));
    const s = live.length === 0 ? null : bundleScore(live.map((e) => byId.get(e.id) ?? null));
    if (s !== null) perTheme[t.id]!.push(s);
  }
}
const themes: Record<string, { n: number; mean: number; sd: number }> = {};
for (const [id, xs] of Object.entries(perTheme)) {
  if (xs.length === 0) { console.log(`theme ${id}: no market had a full bundle, left out`); continue; }
  themes[id] = { n: xs.length, mean: Number(mean(xs).toFixed(6)), sd: Number(populationSd(xs).toFixed(6)) };
}
if (venue) {
  const file = JSON.parse(readFileSync(REF_PATH, "utf8")) as { themes: Record<string, unknown>; venueThemesPulledAt?: string };
  Object.assign(file.themes, themes);
  file.venueThemesPulledAt = new Date().toISOString();
  writeFileSync(REF_PATH, JSON.stringify(file, null, 2) + "\n");
} else writeFileSync(REF_PATH, JSON.stringify({ synthetic: false, note: "Per-theme aggregates of the bundle score over a 40-market reference set (every third club in alphabetical order). No market-level values are stored.", markets: points.length, pulledAt: new Date().toISOString(), themes }, null, 2) + "\n");
console.log(`\nWrote ${Object.keys(themes).length} themes. Requests made: ${q.requests}.`);
