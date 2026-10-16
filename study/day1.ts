import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createQlooClient, type QlooType, type SearchHit } from "../src/qloo/client";
import { BUNDLE_ENTITIES } from "../src/study/bundles";
import {
  bundleScore, chooseRadius, emptyThemes, evaluateShape, maxAbsDiff, nationalPopularity, needsLocalityFallback, noLocalSignal, pickEntity, withoutKeys,
  type AffinityTable, type RadiusResult,
} from "../src/study/day1";
import { STUDY_THEMES, type StudyThemeId } from "../src/study/themes";

// Day-1 Qloo go/no-go (pre-registration Amendment 1, A4). Reads ONLY club, city, state, lat, lon from the
// club list; never any attendance or lift data. Raw responses stay in data/raw (gitignored), never committed.
process.loadEnvFile(".dev.vars");
const raw: unknown[] = [];
const client = createQlooClient({
  baseUrl: process.env.QLOO_API_URL ?? "",
  apiKey: process.env.QLOO_API_KEY ?? "",
  onResponse: (path, params, body) => raw.push({ path, params, body }),
});

const KEYS = ["city", "club", "lat", "lon", "state"];
const rows = JSON.parse(readFileSync("data/derived/clubs-2025.json", "utf8")) as Record<string, unknown>[];
for (const r of rows) if (Object.keys(r).sort().join() !== KEYS.join()) throw new Error(`clubs-2025.json keys are not exactly ${KEYS}`);
const clubs = rows
  .map((r) => ({ club: r.club as string, city: r.city as string, state: r.state as string, lat: r.lat as number, lon: r.lon as number }))
  .sort((x, y) => x.club.localeCompare(y.club))
  .slice(0, 10);
if (clubs.some((c) => typeof c.lat !== "number" || typeof c.lon !== "number")) throw new Error("a Day-1 club lacks coordinates");
console.log(`Day-1 clubs (${clubs.length}, alphabetical):`);
clubs.forEach((c, i) => console.log(`  ${i + 1}. ${c.club} — ${c.city}, ${c.state} (${c.lat}, ${c.lon})`));

// 1. Resolve every bundle entity (or reuse the IDs from the previous run's raw file to save quota).
interface Resolved { key: string; theme: StudyThemeId; type: QlooType; id: string; name: string }
const RAW_PATH = "data/raw/qloo-day1.json";
let resolved: Resolved[] = [];
if (process.argv.includes("--reuse-resolution")) {
  resolved = (JSON.parse(readFileSync(RAW_PATH, "utf8")) as { resolved: Resolved[] }).resolved;
  console.log(`\n== Resolution reused from ${RAW_PATH} (${resolved.length}/${BUNDLE_ENTITIES.length}) ==`);
} else {
  console.log("\n== Resolution (top-5 candidates per attempt; * = picked) ==");
  for (const ent of BUNDLE_ENTITIES) {
    let hit: Resolved | null = null;
    for (const att of ent.attempts) {
      const cands: SearchHit[] = await client.search(att.query, att.type, 5);
      const pick = pickEntity(cands, { names: att.names, year: ent.year });
      console.log(`${ent.key}  [${att.type} "${att.query}"${ent.year ? ` ${ent.year}` : ""}]`);
      for (const c of cands) console.log(`   ${c === pick ? "*" : " "} ${c.name} | ${c.entityId} | ${c.types.join(",")} | ${c.releaseYear ?? "-"} | pop ${c.popularity ?? "-"}`);
      if (cands.length === 0) console.log("     (no candidates)");
      if (pick) { hit = { key: ent.key, theme: ent.theme, type: att.type, id: pick.entityId, name: pick.name }; break; }
    }
    if (hit) resolved.push(hit);
    else console.log(`   => UNRESOLVED ${ent.key}`);
  }
}
console.log(`\nResolved ${resolved.length}/${BUNDLE_ENTITIES.length}:`);
for (const r of resolved) console.log(`  ${r.key.padEnd(24)} ${r.type.padEnd(8)} ${r.id}  ${r.name}`);
const entityTheme = Object.fromEntries(resolved.map((r) => [r.key, r.theme]));

// 2. Request helpers.
type Row = { affinity: number | null; popularity: number | null };
type Club = (typeof clubs)[number];
type Shape = { radiusM: number } | { locality: true };
const types = [...new Set(resolved.map((r) => r.type))];

async function pull(club: Club, shape: Shape, perEntity: boolean, only?: QlooType): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  const items = resolved.filter((r) => only === undefined || r.type === only);
  const groups: Array<{ type: QlooType; items: Resolved[] }> = perEntity
    ? items.map((r) => ({ type: r.type, items: [r] }))
    : types.filter((t) => only === undefined || t === only).map((t) => ({ type: t, items: items.filter((r) => r.type === t) }));
  for (const g of groups) {
    // Qloo's default recency floor hides older films from movie insights; 1900 lifts it.
    const q = { type: g.type, entityIds: g.items.map((i) => i.id), lon: club.lon, lat: club.lat, ...(g.type === "movie" ? { releaseYearMin: 1900 } : {}) };
    let got: Awaited<ReturnType<typeof client.localAffinity>> = [];
    try {
      got = await client.localAffinity("radiusM" in shape ? { ...q, radiusM: shape.radiusM } : { ...q, locationQuery: `${club.city}, ${club.state}` });
    } catch (e) {
      if (!("locality" in shape)) throw e;
      console.log(`   locality ${club.city}, ${club.state}: ${(e as Error).message}`);
    }
    for (const item of g.items) {
      const row = got.find((x) => x.entityId === item.id);
      out.set(item.key, { affinity: row?.affinity ?? null, popularity: row?.popularity ?? null });
    }
  }
  return out;
}
const vec = (m: Map<string, Row>, f: "affinity" | "popularity", rs = resolved) => rs.map((r) => m.get(r.key)?.[f] ?? null);

// 3. Batching check, movie type only, club #1 at 40 km. (The repeat check passed on the first run.)
console.log("\n== Batching check (club 1, 40 km, movie type only) ==");
const movies = resolved.filter((r) => r.type === "movie");
const batched = await pull(clubs[0], { radiusM: 40000 }, false, "movie");
const single = await pull(clubs[0], { radiusM: 40000 }, true, "movie");
const diff = maxAbsDiff(vec(batched, "affinity", movies), vec(single, "affinity", movies));
const batchOk = diff <= 1e-9;
const nVal = (m: Map<string, Row>) => vec(m, "affinity", movies).filter((v) => v !== null).length;
console.log(`movies with a value: ${nVal(batched)}/${movies.length} batched, ${nVal(single)}/${movies.length} per-entity`);
console.log(`max abs diff batched vs per-entity: ${diff} -> ${batchOk ? "batching is safe" : "USE ONE CALL PER ENTITY"}`);

// 5. Radius ladder, then locality fallback only if POINT fails (1) everywhere.
// Entities with no affinity at any club at any shape tried so far are "no local signal" and leave their bundle.
const perEntity = !batchOk;
const all = new Map<string, Map<string, Map<string, Row>>>(); // shape label -> club -> entity -> row
const tableOf = (label: string): AffinityTable =>
  Object.fromEntries(resolved.map((r) => [r.key, clubs.map((c) => all.get(label)?.get(c.club)?.get(r.key)?.affinity ?? null)]));
const tried: AffinityTable[] = [];
let excluded: string[] = [];
function evaluate(label: string) {
  tried.push(tableOf(label));
  excluded = noLocalSignal(tried);
  const t = tableOf(label);
  console.log(`  coverage (clubs with a value, of ${clubs.length}):`);
  for (const r of resolved) console.log(`    ${r.key.padEnd(24)} ${String(t[r.key].filter((v) => v !== null).length).padStart(2)}/${clubs.length}${excluded.includes(r.key) ? "  no local signal (excluded)" : ""}`);
  const evaluation = evaluateShape(withoutKeys(t, excluded));
  console.log(`${label}: ${evaluation.pass ? "PASS" : "FAIL"} (coverage ${evaluation.coverage ? "ok" : "FAIL"}, varies ${evaluation.varies ? "ok" : "FAIL"})` +
    (evaluation.missing.length ? ` | partial coverage: ${evaluation.missing.join(", ")}` : "") + (evaluation.flat.length ? ` | flat: ${evaluation.flat.join(", ")}` : ""));
  return evaluation;
}
const ladder: RadiusResult[] = [];
console.log(`\n== Radius ladder (${perEntity ? "per-entity" : "batched per type"} calls) ==`);
for (const km of [40, 60, 80, 100]) {
  const label = `${km}km`;
  const m = new Map<string, Map<string, Row>>();
  for (const c of clubs) m.set(c.club, await pull(c, { radiusM: km * 1000 }, perEntity));
  all.set(label, m);
  const evaluation = evaluate(label);
  ladder.push({ radiusM: km * 1000, evaluation });
  if (evaluation.pass) break;
}
let chosenLabel: string | null = null;
const radius = chooseRadius(ladder);
if (radius !== null) chosenLabel = `${radius / 1000}km`;
else if (needsLocalityFallback(ladder)) {
  console.log("\n== POINT failed coverage at every radius: trying locality fallback ==");
  const m = new Map<string, Map<string, Row>>();
  for (const c of clubs) m.set(c.club, await pull(c, { locality: true }, perEntity));
  all.set("locality", m);
  if (evaluate("locality").pass) chosenLabel = "locality";
}
const kept = resolved.filter((r) => !excluded.includes(r.key));
console.log(`\nNo local signal (excluded from bundles): ${excluded.length ? excluded.join(", ") : "none"}`);
const themes = STUDY_THEMES.map((t) => t.id);
const dead = emptyThemes(entityTheme, themes, kept.map((r) => r.key));
if (dead.length) console.log(`HARD FAILURE: no scored entity left for theme(s): ${dead.join(", ")}`);
console.log(`\nCHOSEN SHAPE: ${chosenLabel ? (chosenLabel === "locality" ? 'signal.location.query="{city}, {state}"' : `signal.location=POINT(lon lat), radius ${chosenLabel}, filter.release_year.min=1900 on movie calls`) : "NONE PASSES"}`);

// 6. Sanity table (Qloo data only) and national popularity, from the chosen shape (else every shape tried).
const showLabels = chosenLabel ? [chosenLabel] : [...all.keys()].filter((k) => k === "40km" || k === "locality");
if (!chosenLabel) console.log(`(no shape passed; tables below cover the 40km POINT and locality shapes: ${showLabels.join(", ")})`);
for (const showLabel of showLabels) {
  const shown = all.get(showLabel)!;
  console.log(`\n== Bundle score per club x theme (${showLabel}; kept entities only) ==`);
  console.log(["club".padEnd(26), ...themes.map((t) => t.slice(0, 9).padStart(9))].join(" "));
  for (const c of clubs) {
    const cells = themes.map((t) => {
      const s = bundleScore(kept.filter((r) => r.theme === t).map((r) => shown.get(c.club)?.get(r.key)?.affinity ?? null));
      return (s === null ? "n/a" : s.toFixed(3)).padStart(9);
    });
    console.log([c.club.slice(0, 26).padEnd(26), ...cells].join(" "));
  }
  console.log(`\n== National popularity per theme (${showLabel}; club 1 values, mean over the kept entities listed) ==`);
  const popOf = (club: string, t: StudyThemeId) => nationalPopularity(kept.filter((r) => r.theme === t).map((r) => shown.get(club)?.get(r.key)?.popularity ?? null));
  for (const t of themes) console.log(`  ${t.padEnd(15)} ${popOf(clubs[0].club, t)?.toFixed(4) ?? "n/a"}  [${kept.filter((r) => r.theme === t).map((r) => r.key).join(", ")}]`);
  const popSpread = Math.max(0, ...kept.map((r) => {
    const v = clubs.map((c) => shown.get(c.club)?.get(r.key)?.popularity).filter((x): x is number => typeof x === "number");
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  }));
  console.log(`popularity ${popSpread < 1e-9 ? "is CONSTANT" : `VARIES (max spread ${popSpread.toFixed(4)})`} across the ${clubs.length} locations`);
}

// 7. Budget.
const keptTypes = new Set(kept.map((r) => r.type)).size;
const perPull = perEntity ? kept.length : keptTypes;
console.log(`\n== Requests ==\nused in this run: ${client.requests}`);
console.log(`projected full pull, 120 clubs x ${perEntity ? "1 call per kept entity" : "1 call per type"} = ${120 * perPull} requests`);

mkdirSync("data/raw", { recursive: true });
writeFileSync(RAW_PATH, JSON.stringify({ ranAt: new Date().toISOString(), clubs, resolved, excluded, chosenLabel, ladder, requests: client.requests, raw }, null, 1));
console.log("raw + summary written to data/raw/qloo-day1.json (gitignored)");
