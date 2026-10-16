// Builds the reference set: every third club (alphabetical) of the club list, 40 of 120. The club list is MLB-derived,
// so it is read OFFLINE here (only club, city, state, lat, lon), and nothing from it is written down: the output is
// per-theme aggregates (n, mean, population SD of the bundle score) and nothing else.
// Requests: one per entity type per market.
import { readFileSync, writeFileSync } from "node:fs";
import { bundleScore } from "../src/app/score";
import { idsOfType } from "../src/app/themes/ids";
import { mean, populationSd } from "../src/study/stats";
import { REF_PATH, announce, client, dry, liveLibrary, typesOf } from "./lib";

const CLUBS = process.env.HOMESTAND_CLUBS ?? "data/derived/clubs-2025.json";
const rows = JSON.parse(readFileSync(CLUBS, "utf8")) as Array<Record<string, unknown>>;
const points = rows
  .map((r) => ({ club: String(r.club), lat: Number(r.lat), lon: Number(r.lon) }))
  .sort((a, b) => a.club.localeCompare(b.club))
  .filter((_, i) => i % 3 === 0)
  .map(({ lat, lon }) => ({ lat, lon })); // names are dropped immediately
if (points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon))) throw new Error("a reference club lacks coordinates");
const lib = liveLibrary();
const types = typesOf(lib);
announce(`qloo:reference (${points.length} markets x ${types.length} types)`, points.length * types.length);
if (dry) process.exit(0);

const q = client();
const perTheme: Record<string, number[]> = Object.fromEntries(lib.map((t) => [t.id, []]));
for (const [i, p] of points.entries()) {
  const byId = new Map<string, number | null>();
  for (const type of types) {
    const ids = idsOfType(lib, type);
    const res = await q.localAffinity({
      type, entityIds: ids, lon: p.lon, lat: p.lat, radiusM: 80000,
      ...(type === "movie" ? { releaseYearMin: 1900 } : {}), ...(ids.length > 20 ? { take: ids.length } : {}),
    });
    for (const r of res) byId.set(r.entityId, r.affinity);
  }
  for (const t of lib) {
    const s = bundleScore(t.entities.map((e) => byId.get(e.id) ?? null));
    if (s !== null) perTheme[t.id]!.push(s);
  }
  console.log(`market ${i + 1}/${points.length} done`);
}
const themes: Record<string, { n: number; mean: number; sd: number }> = {};
for (const [id, xs] of Object.entries(perTheme)) {
  if (xs.length === 0) { console.log(`theme ${id}: no market had a full bundle, left out`); continue; }
  themes[id] = { n: xs.length, mean: Number(mean(xs).toFixed(6)), sd: Number(populationSd(xs).toFixed(6)) };
}
writeFileSync(REF_PATH, JSON.stringify({ synthetic: false, note: "Per-theme aggregates of the bundle score over a 40-market reference set (every third club in alphabetical order). No market-level values are stored.", markets: points.length, pulledAt: new Date().toISOString(), themes }, null, 2) + "\n");
console.log(`\nWrote ${Object.keys(themes).length} themes. Requests made: ${q.requests}.`);
