import { describe, expect, it } from "vitest";
import type { AnalyzeResponse, ProposeResponse } from "../../src/app/api-types";
import { SPORT_CLASSIC_PHRASES } from "../../src/app/calendar/classic";
import { CSV_TEMPLATE, parseCalendar } from "../../src/app/calendar/csv";
import { resolveTheme } from "../../src/app/calendar/resolve";
import { syntheticDiscoveryReference } from "../../src/app/discovery";
import { buildMemoHtml, memoOpener, type MemoData } from "../../src/app/export/memo";
import { cityOfLabel, copyFor, isSport, shortLabel, SPORTS, sportOf } from "../../src/app/kind";
import { SAMPLE_MARKETS } from "../../src/app/markets";
import { angleText } from "../../src/app/propose/propose";
import { exampleCsv, sampleCsv, csvTemplate } from "../../src/app/samples";
import { CLASSIC_REASON, classicReason } from "../../src/app/score";
import { SYNTHETIC_REFERENCE } from "../../src/worker/reference";
import { activeLibrary } from "../../src/app/themes/ids";
import { THEME_LIBRARY } from "../../src/app/themes/library";
import { analyze, proposeSwaps, type Deps } from "../../src/worker/agent";
import { memoryLimiter } from "../../src/worker/limits";
import { memoryKv, type AiPort } from "../../src/worker/ports";
import { route } from "../../src/worker/router";
import { syntheticQlooFetch } from "../../src/worker/synthetic";

function deps(over: Partial<Deps> = {}): Deps {
  return {
    kv: memoryKv(), ai: null, mode: "live", qlooFetch: syntheticQlooFetch, qlooBase: "https://qloo.test", qlooKey: "k", library: activeLibrary({}, true), reference: SYNTHETIC_REFERENCE,
    now: () => new Date("2026-10-15T12:00:00.000Z"), qlooDailyCap: 1000, aiDailyCap: 100, qlooDelayMs: 0, discoveryRef: syntheticDiscoveryReference(), ...over,
  };
}

const boise = SAMPLE_MARKETS.find((m) => m.id === "boise")!;
const market = { label: boise.label, lon: boise.lon, lat: boise.lat };

describe("sports", () => {
  it("are the four minor league sports, baseball by default, and nothing else", () => {
    expect(SPORTS).toEqual(["baseball", "basketball", "hockey", "soccer"]);
    expect(SPORTS).not.toContain("football");
    for (const s of SPORTS) expect(isSport(s)).toBe(true);
    for (const v of ["football", "Baseball", "", null, undefined, 3, {}]) expect(isSport(v)).toBe(false);
    expect(sportOf("hockey")).toBe("hockey");
    expect(sportOf("football")).toBe("baseball");
    expect(sportOf(undefined)).toBe("baseball");
  });
});

describe("copy per sport", () => {
  it("names the venue, the team and the months for each sport", () => {
    expect(copyFor("club", "baseball")).toMatchObject({ team: "club", venueWord: "ballpark", sport: "baseball", months: "April to September", sample: "sample club" });
    expect(copyFor("club", "basketball")).toMatchObject({ team: "team", venueWord: "arena", sport: "basketball", months: "November to April", sample: "sample team" });
    expect(copyFor("club", "hockey")).toMatchObject({ team: "team", venueWord: "arena", sport: "hockey", months: "October to April", sample: "sample team" });
    expect(copyFor("club", "soccer")).toMatchObject({ team: "team", venueWord: "stadium", sport: "soccer", months: "March to October", sample: "sample team" });
  });
  it("keeps baseball exactly as it was", () => {
    expect(copyFor("club")).toBe(copyFor("club", "baseball"));
    expect(copyFor(undefined)).toBe(copyFor("club"));
    expect(copyFor("club")).toMatchObject({ place: "town", markets: "towns", season: "season", night: "night", nights: "nights", themeNight: "theme night", themeNights: "theme nights", memoTitle: "Theme-night rationale", slab: "THEME NIGHT" });
    expect(classicReason("club")).toBe(CLASSIC_REASON);
    expect(classicReason("club", "baseball")).toBe(CLASSIC_REASON);
    expect(CLASSIC_REASON).toBe("Proven promos (fireworks, giveaways, heritage nights) aren't graded, because they aren't a pop-culture taste. They stay as planned.");
  });
  it("only changes the words, not the engine words (night, theme night, town) for another sport", () => {
    for (const s of ["basketball", "hockey", "soccer"] as const) expect(copyFor("club", s)).toMatchObject({ place: "town", night: "night", themeNight: "theme night", season: "season" });
  });
  it("ignores the sport for a venue run", () => {
    expect(copyFor("venue", "hockey")).toBe(copyFor("venue"));
    expect(copyFor("venue").sample).toBe("sample venue");
  });
  it("reads a sample team's label as a city", () => {
    expect(cityOfLabel("Boise, ID sample team")).toBe("Boise");
    expect(shortLabel("Boise, ID sample team")).toBe("Boise, ID");
    expect(cityOfLabel("Biloxi, MS sample club")).toBe("Biloxi");
  });
  it("gives each non-baseball sport its own proven-promo examples and sponsor moments", () => {
    expect(classicReason("club", "hockey")).toContain("teddy bear toss");
    expect(classicReason("club", "basketball")).toContain("T-shirt nights");
    expect(classicReason("club", "soccer")).toContain("scarf giveaways");
    for (const s of ["basketball", "hockey", "soccer"] as const) expect(classicReason("club", s)).not.toMatch(/baseball|ballpark/i);
  });
});

describe("sponsor ideas for a locked night", () => {
  const night = { index: 0, date: "2027-12-18", themeId: "marvel", sponsor: "Sawtooth Savings", locked: true, notes: "" };
  const marvel = THEME_LIBRARY.find((t) => t.id === "marvel")!;
  it("reads exactly as before for baseball, whether or not the sport is given", () => {
    const old = "Marvel on Sat Dec 18 is locked, so it stays exactly as planned. A sponsor idea: give Sawtooth Savings a featured moment on the night (a PA read, the first pitch or a giveaway tied to Marvel).";
    expect(angleText(night, marvel, null)).toBe(old);
    expect(angleText(night, marvel, null, "baseball")).toBe(old);
    expect(angleText(night, marvel, THEME_LIBRARY[0]!)).toContain("(walk-up songs, PA clips or a photo spot)");
  });
  it("uses the sport's ceremonial moment otherwise", () => {
    expect(angleText(night, marvel, null, "hockey")).toContain("the ceremonial puck drop");
    expect(angleText(night, marvel, null, "basketball")).toContain("the ceremonial tip-off");
    expect(angleText(night, marvel, null, "soccer")).toContain("the ceremonial kickoff");
    expect(angleText(night, marvel, THEME_LIBRARY[0]!, "hockey")).not.toMatch(/walk-up/);
    expect(angleText(night, marvel, null, "hockey")).not.toMatch(/first pitch/);
  });
});

describe("proven promos per sport", () => {
  const lib = activeLibrary({}, true);
  const kindOfNight = (text: string, sport: (typeof SPORTS)[number]): string => resolveTheme(text, lib, SPORT_CLASSIC_PHRASES[sport]).kind;
  it("keeps the baseball list as it was", () => {
    expect(SPORT_CLASSIC_PHRASES.baseball).toEqual([]);
    for (const t of ["Fireworks Friday", "Dollar Dog Night", "Bobblehead Giveaway", "Hispanic Heritage Night", "Military Appreciation Night"]) expect(kindOfNight(t, "baseball"), t).toBe("classic");
    expect(kindOfNight("Teddy Bear Toss", "baseball")).toBe("unknown");
    expect(kindOfNight("T-Shirt Night", "baseball")).toBe("unknown");
  });
  it("knows the staples of each sport", () => {
    for (const t of ["Teddy Bear Toss", "Scarf Night", "Chuck-a-Puck", "Jersey Giveaway", "T-Shirt Night"]) expect(kindOfNight(t, "hockey"), t).toBe("classic");
    for (const t of ["T-Shirt Night", "Rally Towel Giveaway", "Whiteout", "Student Night", "Bobblehead Giveaway"]) expect(kindOfNight(t, "basketball"), t).toBe("classic");
    for (const t of ["Scarf Giveaway Night", "Supporters Night", "Kit Giveaway", "T-Shirt Night", "Fan Appreciation Night"]) expect(kindOfNight(t, "soccer"), t).toBe("classic");
  });
  it("still lets a pop-culture name win, and shares the common staples", () => {
    expect(kindOfNight("Harry Potter Scarf Night", "soccer")).toBe("theme");
    expect(kindOfNight("Star Wars Teddy Bear Toss", "hockey")).toBe("theme");
    for (const s of SPORTS) expect(kindOfNight("Military Appreciation Night", s)).toBe("classic");
  });
  it("rates a hockey teddy bear toss as a proven promo through the worker", async () => {
    const rows = parseCalendar("date,theme,sponsor,locked,notes\n2027-12-03,Teddy Bear Toss,,no,\n2027-12-04,Bluey Day,,no,\n").rows;
    const hockey = await analyze(deps({ sport: "hockey" }), { market, rows });
    expect(hockey.nights[0]!.label).toBe("classic");
    const baseball = await analyze(deps(), { market, rows });
    expect(baseball.nights[0]!.label).toBe("not-scored");
    expect(hockey.nights[1]!.label).toBe(baseball.nights[1]!.label);
  });
});

describe("the made-up basketball sample", () => {
  const rows = parseCalendar(sampleCsv("boise")).rows;
  it("is a sample team, not a real one", () => {
    expect(boise).toMatchObject({ kind: "club", sport: "basketball", label: "Boise, ID sample team" });
    expect(SAMPLE_MARKETS.filter((m) => m.kind === "club" && m.sport === undefined).map((m) => m.id)).toEqual(["biloxi", "albuquerque", "akron", "portland-me"]);
  });
  it("has about twenty nights from November to April on game days, a few locks, promos, one ambiguous name and one unknown", () => {
    expect(parseCalendar(sampleCsv("boise")).errors).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(18);
    expect(rows.length).toBeLessThanOrEqual(22);
    for (const r of rows) expect(r.date >= "2027-11-01" && r.date <= "2028-04-30", r.date).toBe(true);
    for (const r of rows) expect([5, 6]).toContain(new Date(`${r.date}T12:00:00Z`).getUTCDay());
    expect(rows.filter((r) => r.locked)).toHaveLength(3);
    const res = rows.map((r) => resolveTheme(r.theme, THEME_LIBRARY, SPORT_CLASSIC_PHRASES.basketball));
    expect(res.filter((r) => r.kind === "classic").length).toBeGreaterThanOrEqual(4);
    expect(res.filter((r) => r.kind === "ambiguous")).toHaveLength(1);
    expect(res.filter((r) => r.kind === "unknown")).toHaveLength(1);
  });
  it("uses fictional sponsors only", () => {
    const sponsors = new Set(rows.map((r) => r.sponsor).filter(Boolean));
    expect([...sponsors].sort()).toEqual(["Capitol Credit Union", "Foothills Brewing", "Gem State Dental", "Sawtooth Savings", "Snake River Auto"]);
  });
  it("checks and fixes end to end on the synthetic data", async () => {
    const d = deps({ sport: "basketball" });
    const a = await analyze(d, { market, rows });
    expect(a.nights).toHaveLength(rows.length);
    expect(a.nights.filter((n) => n.label === "classic").length).toBeGreaterThanOrEqual(4);
    const nights = a.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.resolution.kind === "classic" || n.resolution.kind === "ambiguous" ? null : n.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
    const p = await proposeSwaps(d, { market, nights, allowDuplicates: false });
    const text = JSON.stringify(p.angles);
    expect(text).not.toMatch(/first pitch|walk-up/);
    expect(text).toContain("tip-off");
  });
});

describe("example and template calendars", () => {
  it("leaves baseball's example and template alone", () => {
    expect(exampleCsv(undefined, "2027-03-22")).toBe(exampleCsv("baseball", "2027-03-22"));
    expect(exampleCsv("baseball", "2027-03-22")).toContain("2027-04-09,Fireworks Friday,Prairie Bank,no,");
    expect(exampleCsv("baseball", "2027-03-22")).toContain("Day game");
    expect(csvTemplate("baseball", "2027-03-22")).toBe(CSV_TEMPLATE);
  });
  it("moves another sport's example into its season with its own promo and notes", () => {
    const hockey = parseCalendar(exampleCsv("hockey", "2026-10-20")).rows;
    expect(hockey).toHaveLength(20);
    expect(hockey.some((r) => r.theme === "Teddy Bear Toss")).toBe(true);
    expect(hockey.some((r) => /fireworks/i.test(r.theme))).toBe(false);
    expect(hockey.every((r) => r.date >= "2026-11-01" && r.date <= "2027-04-30")).toBe(true);
    const base = parseCalendar(exampleCsv("baseball", "2027-03-22")).rows;
    hockey.forEach((r, i) => expect(new Date(`${r.date}T12:00:00Z`).getUTCDay()).toBe(new Date(`${base[i]!.date}T12:00:00Z`).getUTCDay()));
    const hoops = parseCalendar(exampleCsv("basketball", "2026-10-20")).rows;
    expect(hoops.every((r) => r.date >= "2026-11-01" && r.date <= "2027-04-30")).toBe(true);
    expect(csvTemplate("soccer")).toContain("Scarf Giveaway Night");
    for (const s of ["basketball", "hockey", "soccer"] as const) expect(parseCalendar(csvTemplate(s)).errors).toEqual([]);
  });
});

describe("the memo", () => {
  const data: MemoData = { club: "Boise, ID sample team", city: "Boise", generatedOn: "2027-01-01", swaps: [], angles: [], nights: 22, suggested: 0, classic: 5, synthetic: false, recordedLabel: null };
  it("reads exactly as before for baseball", () => {
    const html = buildMemoHtml({ ...data, club: "Akron, OH sample club", sample: true });
    expect(html).toContain("(fireworks, giveaways, heritage nights and similar)");
    expect(html).not.toContain("made-up calendar");
    expect(memoOpener(data)).toBe("Homestand checked 22 theme nights for Boise, ID sample team against local taste data from Qloo. It suggested no swaps, so the calendar is unchanged.");
  });
  it("names the sport's promos and says a sample team is made up", () => {
    const html = buildMemoHtml({ ...data, sport: "basketball", sample: true });
    expect(html).toContain("(T-shirt nights, towel giveaways, heritage nights and similar)");
    expect(html).toContain("This is a made-up calendar for a sample basketball team, not a real team's schedule.");
    expect(buildMemoHtml({ ...data, sport: "hockey" })).not.toContain("made-up calendar");
    expect(html).not.toMatch(/ballpark|baseball/i);
  });
});

describe("the API takes a sport", () => {
  const harness = (ai: AiPort | null = null): { rd: Parameters<typeof route>[1]; agent: Deps } => {
    const agent = deps({ ai });
    return { agent, rd: { agent, allowedOrigins: [], geocodeFetch: async () => new Response("{}"), clientId: async () => "a", limiter: memoryLimiter(1, () => 0), signingKey: null } };
  };
  const post = (body: unknown): Request => new Request("https://api.test/api/analyze", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  const rows = parseCalendar("date,theme,sponsor,locked,notes\n2027-12-03,Teddy Bear Toss,,no,\n2027-12-04,Bluey Day,,no,\n").rows;
  it("accepts the four names, and no sport at all", async () => {
    for (const sport of [undefined, ...SPORTS]) {
      const res = await route(post({ market, rows, ...(sport ? { sport } : {}) }), harness().rd);
      expect(res.status, String(sport)).toBe(200);
    }
  });
  it("rejects anything else, whatever kind of run", async () => {
    for (const sport of ["football", "BASKETBALL", "", 7, null, ["hockey"], {}]) {
      const res = await route(post({ market, rows, sport }), harness().rd);
      expect(res.status, JSON.stringify(sport)).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("bad-request");
    }
    const venue = await route(post({ market, rows, kind: "venue", sport: "football" }), harness().rd);
    expect(venue.status).toBe(400);
  });
  it("uses the sport's proven promos and leaves a venue run alone", async () => {
    const hockey = (await (await route(post({ market, rows, sport: "hockey" }), harness().rd)).json()) as AnalyzeResponse;
    expect(hockey.nights[0]!.label).toBe("classic");
    const baseball = (await (await route(post({ market, rows }), harness().rd)).json()) as AnalyzeResponse;
    expect(baseball.nights[0]!.label).toBe("not-scored");
    const venue = (await (await route(post({ market, rows, kind: "venue", sport: "hockey" }), harness().rd)).json()) as AnalyzeResponse;
    expect(venue.kind).toBe("venue");
    expect(venue.nights[0]!.label).not.toBe("classic");
  });
  it("accepts a sport on propose and recheck", async () => {
    const { rd } = harness();
    const req = (path: string, body: unknown): Request => new Request(`https://api.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    const nights = [{ index: 0, date: "2027-12-18", themeId: "marvel", sponsor: "", locked: true, notes: "" }];
    const ok = await route(req("/api/propose", { market, nights, allowDuplicates: false, sport: "hockey" }), rd);
    expect(ok.status).toBe(200);
    expect(JSON.stringify(((await ok.json()) as ProposeResponse).angles)).toContain("puck drop");
    expect((await route(req("/api/propose", { market, nights, allowDuplicates: false, sport: "nfl" }), rd)).status).toBe(400);
    expect((await route(req("/api/recheck", { market, themeId: "marvel", sport: "nfl" }), rd)).status).toBe(400);
  });
  it("asks the model about sports-team promotions for every sport, and caches the same way for every sport", async () => {
    const prompts: string[] = [];
    const ai: AiPort = { run: async (_m, input) => (prompts.push((input as { messages: Array<{ content: string }> }).messages[0]!.content), { response: '{"0": []}' }) };
    const unknown = parseCalendar("date,theme,sponsor,locked,notes\n2027-12-03,Zorp Gathering,,no,\n").rows;
    const keys: string[][] = [];
    for (const sport of ["baseball", "hockey"] as const) {
      const kv = memoryKv();
      await analyze(deps({ ai, kv, sport }), { market, rows: unknown });
      keys.push([...kv.data.keys()].sort());
    }
    expect(prompts).toHaveLength(2);
    for (const p of prompts) expect(p).toMatch(/^You match sports-team promotion names to a fixed list/);
    for (const p of prompts) expect(p).not.toMatch(/baseball/i);
    expect(keys[0]).toEqual(keys[1]);
    expect(keys[0]!.some((k) => k.startsWith("ai:res:v1:"))).toBe(true);
    expect(keys[0]!.every((k) => !/hockey|baseball|basketball|soccer/.test(k))).toBe(true);
  });
});
