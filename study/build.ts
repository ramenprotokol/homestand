import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fitBaseline } from "../src/study/model";
import { mergeNights, parseSchedule, type Night } from "../src/study/parse";
import { summarize, themeNights } from "../src/study/summary";
import { otherPromoCount } from "../src/study/themes";

const SPORTS = [11, 12, 13, 14];
const nights = mergeNights(SPORTS.map((s) => parseSchedule(JSON.parse(readFileSync(`data/raw/schedule-2025-${s}.json`, "utf8")), s)))
  .filter((n) => !n.doubleHeader && !n.rescheduled);
// Keep only nights at each club's most-used venue (drops special-venue and borrowed-park games).
const venueCounts = new Map<string, Map<number | null, number>>();
for (const n of nights) {
  const m = venueCounts.get(n.club) ?? new Map<number | null, number>();
  m.set(n.venueId, (m.get(n.venueId) ?? 0) + 1);
  venueCounts.set(n.club, m);
}
const homeVenue = new Map([...venueCounts].map(([club, m]) => [club, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
const homeNights = nights.filter((n) => n.venueId === homeVenue.get(n.club));
const fit = fitBaseline(homeNights);
// Robustness baseline (pre-registration, Amendment 1, R2): adds the number of other (non-study-theme) promos.
const fitR2 = fitBaseline(homeNights, [{ name: "otherPromos", value: (n) => otherPromoCount(n.promoNames) }]);
const residualByPk = new Map(homeNights.map((n, i) => [n.gamePk, fit.residuals[i]]));
const residualR2ByPk = new Map(homeNights.map((n, i) => [n.gamePk, fitR2.residuals[i]]));
const rows = themeNights(homeNights, residualByPk, residualR2ByPk);

// The club list for the Day-1 tests and the full pull: each baseline club's most-used venue location. No outcome data.
type Location = Pick<Night, "city" | "state" | "lat" | "lon">;
function clubLocation(club: string): Location {
  const counts = new Map<string, { loc: Location; n: number }>();
  for (const n of homeNights.filter((x) => x.club === club)) {
    const loc = { city: n.city, state: n.state, lat: n.lat, lon: n.lon };
    const k = JSON.stringify(loc);
    counts.set(k, { loc, n: (counts.get(k)?.n ?? 0) + 1 });
  }
  if (counts.size > 1) console.warn(`  note: ${club} has ${counts.size} location records at its home venue; using the most common`);
  return [...counts.values()].sort((a, b) => b.n - a.n)[0].loc;
}
const clubs = [...new Set(homeNights.map((n) => n.club))].sort().map((club) => ({ club, ...clubLocation(club) }));

mkdirSync("data/derived", { recursive: true });
writeFileSync("data/derived/theme-nights-2025.json", JSON.stringify(rows));
writeFileSync("data/derived/clubs-2025.json", JSON.stringify(clubs, null, 2));
const s = summarize(rows);
console.log(`nights in baseline: ${homeNights.length} (dropped ${nights.length - homeNights.length} away-venue) · clubs: ${new Set(homeNights.map((n) => n.club)).size} · R² ${fit.rSquared.toFixed(3)} (robustness baseline with other promos: R² ${fitR2.rSquared.toFixed(3)})`);
console.log(`clubs-2025.json: ${clubs.length} clubs (${clubs.filter((c) => c.lat === null || c.lon === null).length} without coordinates)`);
console.log(`single-theme study nights: ${s.total} · clubs with 2+ themes: ${s.clubsWithTwoPlusThemes} · within-club pairs: ${s.withinClubPairs}`);
for (const [theme, v] of Object.entries(s.perTheme)) console.log(`  ${theme.padEnd(15)} nights ${String(v.nights).padStart(4)} · clubs ${v.clubs}`);
