// Resolves every library entity that has no committed ID, using pickEntity's exact-name (+year) rule.
// One /search request per unresolved entity. Writes only IDs and names to src/app/data/entity-ids.json.
import { pickEntity } from "../src/study/day1";
import { allEntities, announce, client, dry, readIds, writeIds } from "./lib";

const file = readIds();
const todo = allEntities().filter((e) => !file.ids[e.key] && !file.dropped?.[e.key]);
announce("qloo:resolve", todo.length);
if (dry) {
  todo.forEach((e) => console.log(`  would search ${e.type} "${e.query}"${e.year ? ` (${e.year})` : ""}`));
  process.exit(0);
}
const q = client();
const missed: string[] = [];
for (const e of todo) {
  const cands = await q.search(e.query, e.type, 5);
  const pick = pickEntity(cands, { names: e.names, year: e.year });
  console.log(`${e.key}  ${pick ? `* ${pick.name} (${pick.releaseYear ?? "-"})` : "NO EXACT MATCH"}`);
  if (!pick) {
    missed.push(e.key);
    for (const c of cands) console.log(`     candidate: ${c.name} (${c.releaseYear ?? "-"})`);
    continue;
  }
  file.ids[e.key] = { id: pick.entityId, name: pick.name };
  writeIds(file);
}
console.log(`\nResolved ${todo.length - missed.length}/${todo.length}. Requests made: ${q.requests}.`);
if (missed.length) console.log(`Unresolved (no exact name match, so not guessed): ${missed.join(", ")}`);
