// End-to-end check of the real code path with the real Qloo key, in-process (no wrangler, no AI): analyze the first
// sample calendar (cold cache, so the 5-type batch runs), analyze again (must make 0 requests), propose, and re-check
// one theme. Prints counts and labels only.
import { parseCalendar } from "../src/app/calendar/csv";
import { SAMPLE_MARKETS } from "../src/app/markets";
import { sampleCsv } from "../src/app/samples";
import { REFERENCE } from "../src/app/score";
import { analyze, proposeSwaps, recheck, type Deps } from "../src/worker/agent";
import { memoryKv } from "../src/worker/ports";
import { announce, dry, liveLibrary, typesOf } from "./lib";

const lib = liveLibrary();
announce("qloo:smoke", typesOf(lib).length + 1);
if (dry) process.exit(0);
let calls = 0;
const counting: typeof fetch = (i, init) => (calls++, fetch(i, init));
const d: Deps = {
  kv: memoryKv(), ai: null, mode: "live", qlooFetch: counting, qlooBase: process.env.QLOO_API_URL!, qlooKey: process.env.QLOO_API_KEY!,
  library: lib, reference: REFERENCE, now: () => new Date(), qlooDailyCap: 400, aiDailyCap: 0, qlooDelayMs: 300,
};
const m = SAMPLE_MARKETS[0]!;
const market = { label: m.label, lon: m.lon, lat: m.lat };
const rows = parseCalendar(sampleCsv(m.id)).rows;
const a = await analyze(d, { market, rows });
console.log(`analyze: ${calls} requests`);
const tally: Record<string, number> = {};
a.nights.forEach((n) => (tally[n.label] = (tally[n.label] ?? 0) + 1));
console.log("labels:", JSON.stringify(tally), "reference synthetic:", REFERENCE.synthetic);
const before = calls;
await analyze(d, { market, rows });
console.log(`second analyze: ${calls - before} requests (expected 0)`);
const p = await proposeSwaps(d, { market, allowDuplicates: false, nights: a.nights });
console.log(`propose: ${p.proposals.length} proposals, ${p.angles.length} locked-night angles, ${calls - before} requests (expected 0)`);
const theme = lib.find((t) => t.id === "bluey") ?? lib[0]!;
const b2 = calls;
const r = await recheck(d, { market, themeId: theme.id });
console.log(`recheck ${theme.id}: ${calls - b2} requests, label ${r.theme.label}, source ${r.theme.source}`);
console.log(`Total Qloo requests: ${calls}`);
