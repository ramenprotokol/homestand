import type { Night } from "./parse";
import { STUDY_THEMES, classifyThemes, type StudyThemeId } from "./themes";

export interface ThemeNight {
  gamePk: number;
  club: string;
  date: string;
  theme: StudyThemeId;
  lift: number;
  lat: number | null;
  lon: number | null;
  city: string | null;
  state: string | null;
}

export function themeNights(nights: Night[], residualByPk: Map<number, number>): ThemeNight[] {
  const out: ThemeNight[] = [];
  for (const n of nights) {
    const themes = classifyThemes(n.promoNames);
    const lift = residualByPk.get(n.gamePk);
    if (themes.length !== 1 || lift === undefined) continue;
    out.push({ gamePk: n.gamePk, club: n.club, date: n.date, theme: themes[0], lift, lat: n.lat, lon: n.lon, city: n.city, state: n.state });
  }
  return out;
}

export function summarize(rows: ThemeNight[]) {
  const perTheme = Object.fromEntries(STUDY_THEMES.map((t) => [t.id, { nights: 0, clubs: 0 }])) as Record<StudyThemeId, { nights: number; clubs: number }>;
  const clubsByTheme = new Map<StudyThemeId, Set<string>>();
  const themesByClub = new Map<string, Set<StudyThemeId>>();
  for (const r of rows) {
    perTheme[r.theme].nights++;
    if (!clubsByTheme.has(r.theme)) clubsByTheme.set(r.theme, new Set());
    clubsByTheme.get(r.theme)!.add(r.club);
    if (!themesByClub.has(r.club)) themesByClub.set(r.club, new Set());
    themesByClub.get(r.club)!.add(r.theme);
  }
  for (const [t, clubs] of clubsByTheme) perTheme[t].clubs = clubs.size;
  let clubsWithTwoPlusThemes = 0;
  let withinClubPairs = 0;
  for (const themes of themesByClub.values()) {
    const k = themes.size;
    if (k >= 2) clubsWithTwoPlusThemes++;
    withinClubPairs += (k * (k - 1)) / 2;
  }
  return { perTheme, total: rows.length, clubsWithTwoPlusThemes, withinClubPairs };
}
