import { describe, expect, it } from "vitest";
import type { Night } from "../../src/study/parse";
import { summarize, themeNights } from "../../src/study/summary";

const night = (gamePk: number, club: string, promo: string[]): Night => ({
  gamePk, sportId: 12, clubId: 1, club, date: `2025-06-${String(gamePk).padStart(2, "0")}`, weekday: 6, month: 6,
  attendance: 5000, doubleHeader: false, promoNames: promo, promoTypes: [], fireworks: false, giveaway: false,
  city: "X", state: "OH", lat: 40, lon: -80, venueId: 1, rescheduled: false,
});

describe("themeNights and summarize", () => {
  const nights = [
    night(1, "A", ["Bluey Night"]),
    night(2, "A", ["Star Wars Night"]),
    night(3, "A", ["Princess Night"]),
    night(4, "B", ["Bluey Night"]),
    night(5, "B", ["Bluey Night", "Star Wars Night"]),
    night(6, "C", ["Fireworks"]),
  ];
  const residuals = new Map([[1, 0.1], [2, -0.05], [3, 0], [4, 0.2], [5, 0.3], [6, 0]]);
  it("keeps single-theme nights only, carrying the residual lift", () => {
    const rows = themeNights(nights, residuals);
    expect(rows.map((r) => [r.gamePk, r.theme, r.lift])).toEqual([[1, "bluey", 0.1], [2, "star-wars", -0.05], [3, "princess", 0], [4, "bluey", 0.2]]);
  });
  it("counts nights, clubs and within-club pairs", () => {
    const s = summarize(themeNights(nights, residuals));
    expect(s.total).toBe(4);
    expect(s.perTheme.bluey).toEqual({ nights: 2, clubs: 2 });
    expect(s.perTheme["star-wars"]).toEqual({ nights: 1, clubs: 1 });
    expect(s.clubsWithTwoPlusThemes).toBe(1);
    expect(s.withinClubPairs).toBe(3);
  });
});
