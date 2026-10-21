import { describe, expect, it } from "vitest";
import { buildMemoHtml, type MemoData } from "../../src/app/export/memo";
import { propose, type PlanNight, type ThemeFit } from "../../src/app/propose/propose";
import { fitMeaning, fitWordFor, rawGap, RAW_FLOOR, slightNote, strengthOf } from "../../src/app/score";
import { checkHeadline, swapName, titleCase } from "../../src/app/text";
import { THEME_LIBRARY } from "../../src/app/themes/library";

describe("slight lean", () => {
  it("is a Strong or Weak label whose raw gap (index x spread) is under 0.01", () => {
    expect(RAW_FLOOR).toBe(0.01);
    expect(strengthOf(0.3, 0.005)).toBeNull(); // Average is never slight
    expect(strengthOf(0.6, 0.005)).toBe("slight"); // gap 0.003
    expect(strengthOf(-0.6, 0.005)).toBe("slight");
    expect(strengthOf(2, 0.0049)).toBe("slight"); // gap 0.0098
    expect(strengthOf(2, 0.005)).toBe("clear"); // gap 0.01 is clear
    expect(strengthOf(-1.5, 0.02)).toBe("clear");
    expect(strengthOf(1, undefined)).toBe("clear");
    expect(strengthOf(null, 0.1)).toBeNull();
    expect(rawGap(0.6, 0.005)).toBeCloseTo(0.003);
    expect(rawGap(null, 0.1)).toBeNull();
  });
  it("words the chip, and the note carries the real gap", () => {
    expect(fitWordFor("leans-away", true)).toBe("Leans weak");
    expect(fitWordFor("leans-in", true)).toBe("Leans strong");
    expect(fitWordFor("leans-away", false)).toBe("Weak fit");
    expect(fitWordFor("average", true)).toBe("Average fit");
    expect(slightNote(-0.0042)).toBe("Slight: only 0.004 from this town's usual. Qloo says gaps this small usually mean similar relevance, so treat it as a lean, not a verdict.");
  });
});

describe("Check headline", () => {
  const c = { clearAway: 0, slightAway: 0, total: 25, graded: 25, classic: 0, notScored: 0 };
  it("keeps the usual line and adds the slight leans", () => {
    expect(checkHeadline({ ...c, clearAway: 3 }, "Tulsa")).toBe("3 of 25 nights are a weak fit for Tulsa.");
    expect(checkHeadline({ ...c, clearAway: 3, slightAway: 2 }, "Tulsa")).toBe("3 of 25 nights are a weak fit for Tulsa. 2 more only lean weak.");
    expect(checkHeadline({ ...c, slightAway: 1 }, "Tulsa")).toBe("None of the 25 nights is a weak fit for Tulsa. 1 more only leans weak.");
  });
  it("says plainly when nothing could be graded", () => {
    expect(checkHeadline({ clearAway: 0, slightAway: 0, total: 2, graded: 0, classic: 0, notScored: 2 }, "Tulsa")).toBe("Nothing could be graded for these 2 nights: Homestand has no data for their themes. They stay as planned.");
    expect(checkHeadline({ clearAway: 0, slightAway: 0, total: 2, graded: 0, classic: 2, notScored: 0 }, "Tulsa")).toContain("they are proven promos, which Homestand does not grade");
    expect(checkHeadline({ clearAway: 0, slightAway: 0, total: 2, graded: 0, classic: 1, notScored: 1 }, "Tulsa")).toContain("or names it has no data for");
    expect(checkHeadline({ clearAway: 0, slightAway: 0, total: 1, graded: 0, classic: 0, notScored: 1 }, "Tulsa", "date", "dates")).toBe("Nothing could be graded for this date: Homestand has no data for its theme. They stay as planned.");
  });
});

describe("swaps for slight leans", () => {
  const fit = (label: ThemeFit["label"], z: number, slight = false): ThemeFit => ({ label, z, score: 0.9, ...(slight ? { slight: true } : {}) });
  const fits: Record<string, ThemeFit> = {};
  for (const t of THEME_LIBRARY) fits[t.id] = fit("average", 0);
  const night = (index: number, date: string, themeId: string): PlanNight => ({ index, date, themeId, sponsor: "", locked: false, notes: "" });
  const base = { library: THEME_LIBRARY, allowDuplicates: false, now: "2026-10-15T00:00:00.000Z" };

  it("marks the swap for a slight Weak night optional, and leaves a clear one alone", () => {
    const f = { ...fits, elvis: fit("leans-away", -1.2, true), "taylor-swift": fit("leans-away", -1.5), "grateful-dead": fit("leans-in", 1.9), yellowstone: fit("leans-in", 1.0) };
    const res = propose({ ...base, fits: f, nights: [night(0, "2026-07-03", "elvis"), night(1, "2026-07-10", "taylor-swift")] });
    const byFrom = Object.fromEntries(res.proposals.map((p) => [p.fromThemeId, p]));
    expect(byFrom["elvis"]!.optional).toBe(true);
    expect(byFrom["taylor-swift"]!.optional).toBeUndefined();
    expect(res.trace[0]!.text).toContain("1 night is a clear weak fit");
    expect(res.trace[0]!.text).toContain("1 more is only a slight lean");
  });
  it("gives a contested theme to the clear Weak night, not the slight one", () => {
    const f = { ...fits, elvis: fit("leans-away", -1.2, true), "taylor-swift": fit("leans-away", -1.5), "grateful-dead": fit("leans-in", 1.9) };
    const res = propose({ ...base, fits: f, nights: [night(0, "2026-07-03", "elvis"), night(1, "2026-07-10", "taylor-swift")] });
    expect(res.proposals.find((p) => p.fromThemeId === "taylor-swift")?.toThemeId).toBe("grateful-dead");
    expect(res.proposals.find((p) => p.fromThemeId === "elvis")).toBeUndefined();
    expect(res.unfixed).toEqual([]); // a slight lean with no swap is not "could not fix"
  });
  it("prefers a clear Strong theme over a slight one", () => {
    // Both are kids TV, so they rank alike; the slight one has the bigger index but loses to the clear one.
    const f = { ...fits, bluey: fit("leans-away", -1.5), "paw-patrol": fit("leans-in", 1.9, true), "ninja-turtles": fit("leans-in", 1.2) };
    const res = propose({ ...base, fits: f, nights: [night(0, "2026-07-04", "bluey")] });
    expect(res.proposals[0]!.toThemeId).toBe("ninja-turtles");
  });
});

describe("memo sections and wording", () => {
  const d: MemoData = { club: "Fresno, CA", generatedOn: "2026-10-20", swaps: [], angles: [], nights: 20, suggested: 2, classic: 0, synthetic: false, recordedLabel: null };
  it("splits a swap that was offered from a night with no swap available", () => {
    const html = buildMemoHtml({ ...d, offered: ["Jun 5, 2027 Bluey Day (offered: Moana Night)"], stillWeak: ["Jun 12, 2027 Star Trek Night"] });
    expect(html).toContain("<h2>Swap offered, not approved</h2><p>Jun 5, 2027 Bluey Day (offered: Moana Night).</p>");
    expect(html).toContain("<h2>No swap available</h2><p>Jun 12, 2027 Star Trek Night.</p>");
    expect(html).not.toContain("Still weak");
  });
  it("leaves out an empty promo count and a sponsor column nobody filled", () => {
    const html = buildMemoHtml({ ...d, swaps: [{ date: "2027-06-05", weekday: "Saturday", from: "Bluey Day", to: "Moana Night", sponsor: "", fromZ: -1, toZ: 1, fromScore: 0.9, toScore: 0.9, why: "x" }] });
    expect(html).not.toContain("0 proven");
    expect(html).not.toContain("none");
    expect(html).not.toContain("<th>Sponsor</th>");
    expect(buildMemoHtml({ ...d, classic: 2 })).toContain("2 proven promos");
  });
  it("writes a swapped night's name in title case", () => {
    expect(titleCase("Country music")).toBe("Country Music");
    expect(titleCase("Lord of the Rings")).toBe("Lord of the Rings");
    expect(titleCase("Moonpie Pirates (made up)")).toBe("Moonpie Pirates (made up)");
    expect(swapName("Star Wars Night", "Pro wrestling")).toBe("Pro Wrestling Night");
    expect(swapName("Bluey Day", "LEGO Movie")).toBe("LEGO Movie Day");
  });
  it("says city, not town, for a venue", () => {
    expect(fitMeaning("leans-in", "venue")).toBe("People here like it more than this city's other acts.");
    expect(fitMeaning("found", "venue")).toBe("People in this city like it more than people in most cities do.");
  });
});
