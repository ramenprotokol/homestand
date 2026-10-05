import { mkdirSync, writeFileSync } from "node:fs";

// Minor League levels: 11 Triple-A, 12 Double-A, 13 High-A, 14 Single-A. 2025 regular season.
// Data is MLB Advanced Media's: fetched for individual, non-commercial study on this machine only. Never commit it.
const SPORTS = [11, 12, 13, 14];
const SEASON = 2025;

mkdirSync("data/raw", { recursive: true });
for (const sportId of SPORTS) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=${sportId}&season=${SEASON}&gameType=R&hydrate=game(promotions),gameInfo,venue(location)`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB schedule ${sportId}: HTTP ${res.status}`);
  const body = await res.text();
  writeFileSync(`data/raw/schedule-${SEASON}-${sportId}.json`, body);
  console.log(`sport ${sportId}: ${(body.length / 1e6).toFixed(1)} MB`);
}
