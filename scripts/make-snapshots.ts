// Saves what the API returns for each sample's own calendar (Check, then Fix) as public/snapshots/<id>.json, so the samples still open if the live
// server does not answer (the site shows "Showing a saved copy"). The files hold Qloo-derived scores, so they are gitignored and never committed:
// run this before building the site you deploy.
//
// Usage: npx tsx scripts/make-snapshots.ts <api base> <site origin>
//   e.g. npx tsx scripts/make-snapshots.ts https://homestand-api.example.workers.dev https://homestand-6az.pages.dev
// The API answers from its own saved results for the samples, so this normally costs no live Qloo calls. No key or secret is needed here:
// the key stays on the Worker. A clean clone that skips this step still builds; it just has no saved copies.
import { mkdirSync, writeFileSync } from "node:fs";
import type { AnalyzeResponse, ProposeResponse } from "../src/app/api-types";
import { parseCalendar, sortRowsByDate } from "../src/app/calendar/csv";
import { sportOf } from "../src/app/kind";
import { SAMPLE_MARKETS } from "../src/app/markets";
import { sampleCsv } from "../src/app/samples";

const [baseArg, origin] = process.argv.slice(2);
if (!baseArg || !origin) throw new Error("Usage: tsx scripts/make-snapshots.ts <api base> <site origin>");
const base = baseArg.replace(/\/$/, "");
const outDir = new URL("../public/snapshots/", import.meta.url);
mkdirSync(outDir, { recursive: true });

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

for (const m of SAMPLE_MARKETS) {
  const rows = sortRowsByDate(parseCalendar(sampleCsv(m.id)).rows);
  const market = { label: m.label, lon: m.lon, lat: m.lat };
  // The same request body the site sends: a baseball club says nothing extra, another sport says its sport, a venue says its kind.
  const extra = m.kind === "venue" ? { kind: "venue" } : sportOf(m.sport) !== "baseball" ? { sport: sportOf(m.sport) } : {};
  const analyze = await post<AnalyzeResponse>("/api/analyze", { market, rows, ...extra });
  // The same nights the site sends for its first Fix: a recognised theme keeps its id, a promo or an unclear name goes in as unknown.
  const nights = analyze.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.resolution.kind === "classic" || n.resolution.kind === "ambiguous" ? null : n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
  const propose = await post<ProposeResponse>("/api/propose", { market, nights, allowDuplicates: false, ...extra });
  writeFileSync(new URL(`${m.id}.json`, outDir), JSON.stringify({ v: 1, generatedAt: new Date().toISOString(), analyze, propose }));
  console.log(`${m.id.padEnd(12)} ${analyze.nights.length} nights, ${propose.proposals.length} swaps`);
}
