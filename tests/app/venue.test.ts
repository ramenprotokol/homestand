import { describe, expect, it } from "vitest";
import type { AnalyzeResponse, ProposeResponse } from "../../src/app/api-types";
import { ACT_POPULARITY, actBatches, rankActs, syntheticActsReference, worthABooking } from "../../src/app/acts";
import { parseCalendar } from "../../src/app/calendar/csv";
import { resolveTheme } from "../../src/app/calendar/resolve";
import { cityOfLabel, copyFor, shortLabel } from "../../src/app/kind";
import { SAMPLE_MARKETS } from "../../src/app/markets";
import { genreRank, genreTier, propose, type Discovered, type PlanNight, type ThemeFit } from "../../src/app/propose/propose";
import { sampleCsv, VENUE_CALENDAR_IDS } from "../../src/app/samples";
import { SYNTHETIC_REFERENCE } from "../../src/app/score";
import { ALL_THEMES, ARTIST_LIBRARY, VENUE_CLASSIC_PHRASES, VENUE_LIBRARY } from "../../src/app/themes/artists";
import { activeLibrary, COMMITTED_IDS } from "../../src/app/themes/ids";
import { THEME_LIBRARY } from "../../src/app/themes/library";
import { analyze, forKind, proposeSwaps, type Deps } from "../../src/worker/agent";
import { memoryKv } from "../../src/worker/ports";
import { syntheticDiscoveryReference } from "../../src/app/discovery";
import { syntheticQlooFetch } from "../../src/worker/synthetic";

function deps(over: Partial<Deps> = {}): Deps {
  const base: Deps = {
    kv: memoryKv(), ai: null, mode: "live", qlooFetch: syntheticQlooFetch, qlooBase: "https://qloo.test", qlooKey: "k", library: activeLibrary({}, true), reference: SYNTHETIC_REFERENCE,
    now: () => new Date("2026-10-15T12:00:00.000Z"), qlooDailyCap: 1000, aiDailyCap: 0, qlooDelayMs: 0, discoveryRef: syntheticDiscoveryReference(),
    venueLibrary: activeLibrary({}, true, VENUE_LIBRARY), actsRef: syntheticActsReference(),
  };
  return { ...base, ...over };
}

const raleigh = SAMPLE_MARKETS.find((m) => m.id === "raleigh")!;
const market = { label: raleigh.label, lon: raleigh.lon, lat: raleigh.lat };

describe("the venue sample", () => {
  it("is a made-up calendar for a sample amphitheatre", () => {
    expect(VENUE_CALENDAR_IDS).toEqual(["raleigh"]);
    expect(raleigh.kind).toBe("venue");
    expect(raleigh.label).toBe("Raleigh, NC sample amphitheatre");
    const { rows, errors } = parseCalendar(sampleCsv("raleigh"));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(18);
    for (const r of rows) expect(r.date >= "2027-05-01" && r.date <= "2027-09-30").toBe(true);
    expect(rows.filter((r) => r.locked)).toHaveLength(5);
    expect(rows.filter((r) => r.locked).every((r) => /contract signed/i.test(r.notes))).toBe(true);
  });
  it("has the intended mix: two tribute nights, two classic dates, tentative holds across genres, nothing ambiguous", () => {
    const rows = parseCalendar(sampleCsv("raleigh")).rows;
    const res = rows.map((r) => resolveTheme(r.theme, VENUE_LIBRARY, VENUE_CLASSIC_PHRASES));
    expect(res.filter((r) => r.kind === "classic")).toHaveLength(2);
    expect(res.filter((r) => r.kind === "ambiguous")).toHaveLength(0);
    expect(res.filter((r) => r.kind === "unknown")).toHaveLength(0);
    // Every act on the calendar still tours: a hold for an act that has stopped touring would not be a real date.
    for (const r of rows) {
      const x = resolveTheme(r.theme, VENUE_LIBRARY, VENUE_CLASSIC_PHRASES);
      if (x.kind === "theme") expect(ALL_THEMES.find((t) => t.id === x.themeId)!.touring, r.theme).not.toBe(false);
    }
    const themes = rows.flatMap((r, i) => (res[i]!.kind === "theme" ? [{ row: r, theme: ALL_THEMES.find((t) => t.id === (res[i] as { themeId: string }).themeId)! }] : []));
    expect(themes.filter((x) => x.theme.id === "yacht-rock" || x.theme.id === "emo-night")).toHaveLength(2);
    const holds = themes.filter((x) => !x.row.locked && !["yacht-rock", "emo-night"].includes(x.theme.id));
    expect(holds.length).toBeGreaterThanOrEqual(8);
    expect(new Set(holds.map((x) => x.theme.genre)).size).toBeGreaterThanOrEqual(3);
    // None of it resolves under the club library, so a club run could never read this calendar as baseball.
    expect(rows.map((r) => resolveTheme(r.theme, THEME_LIBRARY).kind).filter((k) => k === "theme").length).toBeLessThan(rows.length);
  });
  it("names no real venue or company, and no personal identity", () => {
    const text = sampleCsv("raleigh") + JSON.stringify(raleigh);
    expect(text).not.toMatch(/live nation|ticketmaster|coastal credit|walnut creek|red hat|pnc/i);
  });
});

describe("the artist library", () => {
  it("marks acts that no longer tour, and tribute nights", () => {
    for (const id of ["margaritaville", "elvis", "grateful-dead", "beatles", "fleetwood-mac"]) expect(ALL_THEMES.find((t) => t.id === id)!.touring, id).toBe(false);
    expect(ALL_THEMES.filter((t) => t.tribute).map((t) => t.id).sort()).toEqual(["emo-night", "yacht-rock"]);
  });
  it("has 20 to 40 artist themes, each with a genre, in its own library", () => {
    expect(ARTIST_LIBRARY.length).toBeGreaterThanOrEqual(20);
    expect(ARTIST_LIBRARY.length).toBeLessThanOrEqual(40);
    expect(ARTIST_LIBRARY.every((t) => t.category === "music" && t.genre !== undefined && t.entities.every((e) => e.type === "artist"))).toBe(true);
    const ids = new Set([...THEME_LIBRARY, ...ARTIST_LIBRARY].map((t) => t.id));
    expect(ids.size).toBe(THEME_LIBRARY.length + ARTIST_LIBRARY.length);
  });
  it("gives every existing music theme a genre, and leaves the club library the same size", () => {
    for (const t of THEME_LIBRARY.filter((x) => x.category === "music")) expect(t.genre, t.id).toBeDefined();
    expect(THEME_LIBRARY).toHaveLength(41);
    expect(THEME_LIBRARY.some((t) => ARTIST_LIBRARY.some((a) => a.id === t.id))).toBe(false);
  });
  it("is never part of a club run's library", () => {
    const club = deps();
    expect(club.library.some((t) => ARTIST_LIBRARY.some((a) => a.id === t.id))).toBe(false);
    expect(forKind(club, "club")).toBe(club);
    expect(forKind(club, "venue").library.some((t) => t.id === "zach-bryan")).toBe(true);
  });
  it("scores only entities that have a committed Qloo ID in live mode, and resolved them by exact name", () => {
    const live = activeLibrary(COMMITTED_IDS, false, VENUE_LIBRARY);
    expect(live.length).toBeGreaterThanOrEqual(30);
    expect(live.some((t) => t.id === "zach-bryan")).toBe(true);
  });
});

describe("genre-aware ranking", () => {
  it("is the same genre first, then a related genre, then anything", () => {
    expect(genreTier("rock", "rock")).toBe(0);
    expect(genreTier("classic-rock", "jam")).toBe(1);
    expect(genreTier("rock", "country")).toBe(2);
    expect(genreTier("hip-hop", "latin")).toBe(1);
    expect(genreTier(undefined, "rock")).toBe(2);
    const o = { genre: "rock" as const, audience: "adult" as const };
    expect(genreRank(o, { genre: "rock", audience: "adult" })).toBeLessThan(genreRank(o, { genre: "jam", audience: "adult" }));
    expect(genreRank(o, { genre: "jam", audience: "adult" })).toBeLessThan(genreRank(o, { genre: "country", audience: "adult" }));
  });

  const ent = [{ key: "k", type: "artist" as const, query: "q", names: ["q"], id: "x" }];
  const themes = (["a", "b", "c", "d", "e"] as const).map((x, i) => ({
    id: x, label: x.toUpperCase(), aliases: [], category: "music" as const, audience: "adult" as const, genre: (["rock", "country", "rock", "hip-hop", "indie"] as const)[i]!, entities: ent,
  }));
  const fits: Record<string, ThemeFit> = { a: { label: "leans-away", z: -1.2, score: 0.5 }, b: { label: "leans-in", z: 1.5, score: 0.9 }, c: { label: "leans-in", z: 0.7, score: 0.8 }, d: { label: "leans-in", z: 1.1, score: 0.8 }, e: { label: "leans-in", z: 0.9, score: 0.8 } };
  const nights: PlanNight[] = [{ index: 0, date: "2027-06-05", themeId: "a", sponsor: "", locked: false, notes: "" }];

  it("puts a same-genre act ahead of a stronger one in a related genre, and never offers another genre family, in a venue run", () => {
    const venue = propose({ nights, library: themes, fits, allowDuplicates: false, now: "t", venue: true });
    expect(venue.proposals[0]!.toThemeId).toBe("c"); // rock, the same genre
    expect(venue.proposals[0]!.alternates.map((x) => x.toThemeId)).toEqual(["e"]); // indie is related; country (b) and hip-hop (d) are not offered
    const club = propose({ nights, library: themes, fits, allowDuplicates: false, now: "t" });
    expect(club.proposals[0]!.toThemeId).toBe("c"); // a club music night also keeps to the same genre first
  });

  it("never swaps to a genre bundle or an act that no longer tours, and says so when nothing is left", () => {
    const bundle = { ...themes[2]!, entities: [...ent, ...ent] };
    const retired = { ...themes[4]!, touring: false };
    const r = propose({ nights, library: [themes[0]!, themes[1]!, bundle, retired, themes[3]!], fits, allowDuplicates: false, now: "t", venue: true });
    expect(r.proposals).toEqual([]);
    expect(r.unfixed).toHaveLength(1);
    expect(r.unfixed[0]!.reason).toBe("No rock act, or act in a related genre, is a strong fit here for this date.");
  });

  it("lets a tribute night fill a tribute date only", () => {
    const tribute = { ...themes[2]!, tribute: true, entities: [...ent, ...ent] };
    const fromTribute = { ...themes[0]!, tribute: true };
    expect(propose({ nights, library: [themes[0]!, tribute], fits, allowDuplicates: false, now: "t", venue: true }).proposals).toEqual([]);
    expect(propose({ nights, library: [fromTribute, tribute], fits, allowDuplicates: false, now: "t", venue: true }).proposals[0]!.toThemeId).toBe("c");
  });

  it("offers a discovered act of the same genre before a library theme of a related genre, and none from another family", () => {
    const act: Discovered = { name: "Sunset Strip", entityId: "E1", type: "artist", genre: "rock", affinity: 0.9, z: 1.4, popularity: 0.99 };
    const noRock = themes.filter((t) => t.id !== "c");
    const r = propose({ nights, library: noRock, fits, allowDuplicates: false, now: "t", venue: true, acts: [act] });
    expect(r.proposals[0]!.discovered?.name).toBe("Sunset Strip");
    expect(r.proposals[0]!.to.label).toBe("found");
    const tie = propose({ nights, library: themes, fits, allowDuplicates: false, now: "t", venue: true, acts: [act] });
    expect(tie.proposals[0]!.toThemeId).toBe("c");
    const far: Discovered = { ...act, genre: "country" };
    expect(propose({ nights, library: [themes[0]!], fits, allowDuplicates: false, now: "t", venue: true, acts: [far] }).proposals).toEqual([]);
  });

  it("gives every locked headliner an angle, even one that leans in, and never swaps it", () => {
    const locked: PlanNight[] = [{ index: 0, date: "2027-06-05", themeId: "b", sponsor: "Acme", locked: true, notes: "Contract signed" }, ...nights.map((n) => ({ ...n, index: 1 }))];
    const r = propose({ nights: locked, library: themes, fits, allowDuplicates: false, now: "t", venue: true });
    expect(r.angles.map((a) => a.themeId)).toEqual(["b"]);
    expect(r.proposals.some((p) => p.index === 0)).toBe(false);
  });
});

describe("a venue run end to end on the synthetic data", () => {
  async function run(): Promise<{ a: AnalyzeResponse; p: ProposeResponse; d: Deps }> {
    const d = forKind(deps(), "venue");
    const a = await analyze(d, { market, rows: parseCalendar(sampleCsv("raleigh")).rows });
    const nights = a.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.resolution.kind === "classic" || n.resolution.kind === "ambiguous" ? null : n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    return { a, p: await proposeSwaps(d, { market, nights, allowDuplicates: false }), d };
  }

  it("scores the artist themes and labels the response a venue run", async () => {
    const { a } = await run();
    expect(a.kind).toBe("venue");
    expect(a.nights).toHaveLength(18);
    expect(a.nights.filter((n) => n.resolution.kind === "classic")).toHaveLength(2);
    expect(a.trace.map((t) => t.text).join(" ")).not.toMatch(/ballpark|baseball|nights/i);
  });
  it("makes a support-act idea for each of the five locked headliners from the taste graph, and discovery uses the act pool", async () => {
    const { p, d } = await run();
    expect(p.discovery).toBeNull();
    expect(p.acts).not.toBeNull();
    expect(p.acts!.poolSize).toBe(d.actsRef!.pool.length);
    expect(p.angles).toHaveLength(5);
    for (const x of p.angles) {
      expect(x.text).toMatch(/^.+ on .+ is locked, so it stays exactly as planned\. Support act idea: fans of .+ near Raleigh also like .+, so an act like .+ could fit the opening slot\.$/);
      expect(x.act?.name).toBeTruthy();
    }
    expect(p.trace.map((t) => t.text).join(" ")).toMatch(/what fans of .+ also like/);
  });
  it("calls it a promo tie-in, not a support act, when no act sits a tier below the headliner", async () => {
    // Every pool act is at the headliners' own tier, so none sits a tier below.
    const flat = syntheticActsReference();
    flat.pool = flat.pool.map((x) => ({ ...x, tier: "amphitheatre" as const }));
    const d = forKind(deps({ actsRef: flat }), "venue");
    const a = await analyze(d, { market, rows: parseCalendar(sampleCsv("raleigh")).rows });
    const nights = a.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.resolution.kind === "theme" ? n.themeId : null, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    const p = await proposeSwaps(d, { market, nights, allowDuplicates: false });
    expect(p.angles).toHaveLength(5);
    for (const x of p.angles) {
      expect(x.text).toContain("a pre-show playlist or promo tie-in");
      expect(x.text).not.toContain("Support act idea");
    }
  });
  it("spends one library call, the pool batches, and one taste call per locked headliner", async () => {
    const urls: string[] = [];
    const d = forKind(deps({ qlooFetch: async (i, init) => { urls.push(String(i)); return syntheticQlooFetch(i, init); } }), "venue");
    const a = await analyze(d, { market, rows: parseCalendar(sampleCsv("raleigh")).rows });
    expect(urls).toHaveLength(1); // artists only: one request scores the whole venue library
    const nights = a.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.resolution.kind === "theme" ? n.themeId : null, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    await proposeSwaps(d, { market, nights, allowDuplicates: false });
    const batches = actBatches(d.actsRef!.pool).length;
    expect(urls.length).toBe(1 + batches + 5);
    expect(urls.filter((u) => u.includes("signal.interests.entities"))).toHaveLength(5);
    // A second look at the same market costs nothing.
    urls.length = 0;
    await proposeSwaps(d, { market, nights, allowDuplicates: false });
    expect(urls).toHaveLength(0);
  });
  it("keeps every swap in the library or the pool, never repeats an act, and keeps dates and sponsors", async () => {
    const { a, p } = await run();
    const to = p.proposals.map((x) => x.toThemeId);
    expect(new Set(to).size).toBe(to.length);
    for (const x of p.proposals) {
      const night = a.nights[x.index]!;
      expect(night.locked).toBe(false);
      expect(x.date).toBe(night.date);
      expect(x.sponsor).toBe(night.sponsor);
    }
  });
});

describe("the act pool", () => {
  it("is ranked by z against each act's own spread, and an act must be well known to be booked", () => {
    const ref = syntheticActsReference();
    const ranked = rankActs(new Map([["SYN-A-country-0", 0.9], ["SYN-A-rock-0", 0.5], ["SYN-A-pop-0", null]]), ref);
    expect(ranked.map((x) => x.entityId)).toEqual(["SYN-A-country-0", "SYN-A-rock-0"]);
    expect(ranked[0]!.genre).toBe("country");
    expect(ACT_POPULARITY).toBe(0.95);
    expect(worthABooking({ z: 1, popularity: 0.95 })).toBe(true);
    expect(worthABooking({ z: 1, popularity: 0.94 })).toBe(false);
    expect(worthABooking({ z: 0.2, popularity: 0.99 })).toBe(false);
  });
  it("is asked about in batches of at most 50 (Qloo's limit)", () => {
    const pool = Array.from({ length: 57 }, (_, i) => ({ entityId: `E${i}` }));
    expect(actBatches(pool).map((b) => b.length)).toEqual([50, 7]);
  });
});

describe("wording", () => {
  it("says venue, reference markets, summer series and date for a venue; club wording is unchanged", () => {
    expect(copyFor("venue")).toMatchObject({ place: "city", season: "summer series", themeNight: "date", night: "date", sample: "sample venue" });
    expect(copyFor("club")).toMatchObject({ place: "town", season: "season", themeNight: "theme night", night: "night", sample: "sample club" });
    expect(copyFor(undefined)).toBe(copyFor("club"));
    expect(cityOfLabel("Raleigh, NC sample amphitheatre")).toBe("Raleigh");
    expect(cityOfLabel("Biloxi, MS sample club")).toBe("Biloxi");
    expect(shortLabel("Raleigh, NC sample amphitheatre")).toBe("Raleigh, NC");
    expect(shortLabel("Tulsa, OK")).toBe("Tulsa, OK");
  });
});

describe("the API takes a kind", () => {
  it("scores the venue library for a venue request, and rejects venue-only themes for a club request", async () => {
    const { route } = await import("../../src/worker/router");
    const { memoryLimiter } = await import("../../src/worker/limits");
    const agent = deps();
    const rd = { agent, allowedOrigins: [], geocodeFetch: async () => new Response("{}"), clientId: async () => "a", limiter: memoryLimiter(1, () => 0), signingKey: null };
    const post = (path: string, body: unknown): Request => new Request(`https://api.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    const rows = parseCalendar(sampleCsv("raleigh")).rows;
    const venue = await route(post("/api/analyze", { market, rows, kind: "venue" }), rd);
    expect(venue.status).toBe(200);
    expect(((await venue.json()) as AnalyzeResponse).kind).toBe("venue");
    const club = await route(post("/api/analyze", { market, rows }), rd);
    expect(((await club.json()) as AnalyzeResponse).kind).toBeUndefined();
    const bad = await route(post("/api/propose", { market, nights: [{ index: 0, date: "2027-06-05", themeId: "zach-bryan", sponsor: "", locked: false, notes: "" }], allowDuplicates: false }), rd);
    expect(bad.status).toBe(400);
    const ok = await route(post("/api/propose", { market, nights: [{ index: 0, date: "2027-06-05", themeId: "zach-bryan", sponsor: "", locked: false, notes: "" }], allowDuplicates: false, kind: "venue" }), rd);
    expect(ok.status).toBe(200);
  });
});
