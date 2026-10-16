// Warms the deployed Worker's Qloo cache for the four sample clubs, so the demo is instant for the first visitor.
// Usage: npx tsx scripts/warm-cache.ts <api base> <site origin>
// About 5 Qloo requests per sample market on a cold cache, 0 when already cached.
import { parseCalendar } from "../src/app/calendar/csv";
import { SAMPLE_MARKETS } from "../src/app/markets";
import { sampleCsv } from "../src/app/samples";

const [base, origin] = process.argv.slice(2);
if (!base || !origin) throw new Error("Usage: tsx scripts/warm-cache.ts <api base> <site origin>");

for (const m of SAMPLE_MARKETS) {
  const { rows } = parseCalendar(sampleCsv(m.id));
  const res = await fetch(`${base.replace(/\/$/, "")}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ market: { label: m.label, lon: m.lon, lat: m.lat }, rows }),
  });
  const body = (await res.json()) as { nights?: Array<{ label?: string }> };
  const counts = new Map<string, number>();
  for (const n of body.nights ?? []) counts.set(n.label ?? "?", (counts.get(n.label ?? "?") ?? 0) + 1);
  console.log(`${m.city.padEnd(16)} HTTP ${res.status} · ${[...counts].map(([k, v]) => `${v} ${k}`).join(", ")}`);
  if (!res.ok) process.exitCode = 1;
}
