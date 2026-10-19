// National popularity (0 to 1) of every venue-library artist, from one /v2/insights request (popularity does not depend on the place).
// Support-act ideas use it so a smaller act can open for a bigger one and never the reverse. One request. Only {Qloo id: popularity} is committed.
import { writeFileSync } from "node:fs";
import { ARTIST_LIBRARY } from "../src/app/themes/artists";
import { announce, client, dry, readIds } from "./lib";

const OUT = new URL("../src/app/data/artist-popularity.json", import.meta.url);
const ids = [...new Set(ARTIST_LIBRARY.flatMap((t) => t.entities.map((e) => readIds().ids[e.key]?.id)).filter((x): x is string => !!x))];
const legacy = ["margaritaville", "taylor-swift", "elvis", "grateful-dead", "beatles", "garth-brooks", "dolly-parton", "kenny-chesney", "bad-bunny", "country"];
announce("qloo:popularity", 1);
if (dry) process.exit(0);
const lib = (await import("../src/app/themes/library")).THEME_LIBRARY.filter((t) => legacy.includes(t.id));
const all = [...new Set([...ids, ...lib.flatMap((t) => t.entities.map((e) => readIds().ids[e.key]?.id)).filter((x): x is string => !!x)])].slice(0, 50);
const q = client();
const rows = await q.localAffinity({ type: "artist", entityIds: all, lon: -78.63861, lat: 35.7721, radiusM: 80000, take: all.length });
const out: Record<string, number> = {};
for (const r of rows) if (r.popularity !== null) out[r.entityId] = Number(r.popularity.toFixed(4));
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`Wrote popularity for ${Object.keys(out).length} of ${all.length} artists. Requests made: ${q.requests}.`);
