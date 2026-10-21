// Warms the deployed Worker's cache for the largest US and Canadian metros on demand (the cron does the same a few towns at a time).
// Usage: WARM_TOKEN=... npx tsx scripts/warm-metros.ts <api base> [runs]
// The token is the Worker's WARM_TOKEN secret (never printed). Each run warms up to 8 new towns; stops early at the Worker's own daily limits.
const [base, runsArg] = process.argv.slice(2);
const token = process.env.WARM_TOKEN;
if (!base || !token) throw new Error("Usage: WARM_TOKEN=... tsx scripts/warm-metros.ts <api base> [runs]");
const runs = Math.max(1, Math.min(30, Number(runsArg) || 1));

for (let i = 1; i <= runs; i++) {
  const res = await fetch(`${base.replace(/\/$/, "")}/api/warm`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`warm run ${i}: HTTP ${res.status}`);
  const s = (await res.json()) as { warmed: number; alreadySaved: number; failed: number; stoppedBecause: string | null; towns: string[] };
  console.log(`run ${i}: warmed ${s.warmed} (${s.towns.join(", ") || "none"}), already saved ${s.alreadySaved}, failed ${s.failed}${s.stoppedBecause ? `, stopped: ${s.stoppedBecause}` : ""}`);
  if (s.stoppedBecause && s.stoppedBecause !== "per-run limit") break;
  if (s.warmed === 0 && s.stoppedBecause === null) break;
}
export {};
