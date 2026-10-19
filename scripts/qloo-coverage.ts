// Drops entities that have no local affinity at any of the 4 sample markets (Amendment 4's "no local signal" rule),
// then removes themes left empty (the live library does that on its own). One request per entity type per market.
// Prints only counts and keys, never affinity values.
import { SAMPLE_MARKETS } from "../src/app/markets";
import { idsOfType } from "../src/app/themes/ids";
import { STUDY_THEME_IDS } from "../src/app/themes/library";
import { announce, client, dry, liveLibrary, readIds, typesOf, writeIds } from "./lib";

const lib = liveLibrary();
const types = typesOf(lib);
const CLUBS = SAMPLE_MARKETS.filter((m) => m.kind === "club"); // the coverage rule is about the club library at the four ballpark samples
announce("qloo:coverage", CLUBS.length * types.length);
if (dry) process.exit(0);
const q = client();
const seen = new Map<string, boolean>(); // entity id -> any value at any sample market
const counts: string[] = [];
for (const m of CLUBS) {
  for (const type of types) {
    const ids = idsOfType(lib, type);
    const rows = await q.localAffinity({
      type, entityIds: ids, lon: m.lon, lat: m.lat, radiusM: 80000,
      ...(type === "movie" ? { releaseYearMin: 1900 } : {}), ...(ids.length > 20 ? { take: ids.length } : {}),
    });
    const got = rows.filter((r) => r.affinity !== null).length;
    counts.push(`${m.id} ${type}: asked ${ids.length}, got ${got}`);
    for (const r of rows) seen.set(r.entityId, (seen.get(r.entityId) ?? false) || r.affinity !== null);
  }
}
counts.forEach((c) => console.log(c));
const file = readIds();
const dropped: string[] = [];
for (const t of lib) {
  for (const e of t.entities) {
    if (seen.get(e.id)) continue;
    if (STUDY_THEME_IDS.includes(t.id)) {
      console.log(`WARNING: study entity ${e.key} had no value at the sample markets. Kept (it was verified at 10 other markets).`);
      continue;
    }
    delete file.ids[e.key];
    (file.dropped ??= {})[e.key] = "no local affinity at the 4 sample markets";
    dropped.push(e.key);
  }
}
writeIds(file);
console.log(`\nDropped ${dropped.length}: ${dropped.join(", ") || "none"}. Requests made: ${q.requests}.`);
const left = liveLibrary();
console.log(`Library now has ${left.length} themes and ${left.flatMap((t) => t.entities).length} entities.`);
