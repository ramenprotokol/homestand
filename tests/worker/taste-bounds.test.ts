import { describe, expect, it } from "vitest";
import { syntheticActsReference } from "../../src/app/acts";
import { syntheticDiscoveryReference } from "../../src/app/discovery";
import { parseCalendar } from "../../src/app/calendar/csv";
import { SAMPLE_MARKETS } from "../../src/app/markets";
import { sampleCsv } from "../../src/app/samples";
import { SYNTHETIC_REFERENCE } from "../../src/app/score";
import { VENUE_LIBRARY } from "../../src/app/themes/artists";
import { activeLibrary } from "../../src/app/themes/ids";
import { analyze, forKind, MAX_LIVE_TASTE, proposeSwaps, type Deps } from "../../src/worker/agent";
import { DAILY_QUOTA } from "../../src/worker/limits";
import { memoryKv } from "../../src/worker/ports";
import { syntheticQlooFetch } from "../../src/worker/synthetic";

const raleigh = SAMPLE_MARKETS.find((m) => m.id === "raleigh")!;
const market = { label: raleigh.label, lon: raleigh.lon, lat: raleigh.lat };

function setup(over: Partial<Deps> = {}): { d: Deps; urls: URL[] } {
  const urls: URL[] = [];
  const d: Deps = {
    kv: memoryKv(), ai: null, mode: "live", qlooFetch: async (i, init) => (urls.push(new URL(String(i))), syntheticQlooFetch(i, init)), qlooBase: "https://qloo.test", qlooKey: "k",
    library: activeLibrary({}, true), reference: SYNTHETIC_REFERENCE, now: () => new Date("2026-10-15T12:00:00.000Z"), qlooDailyCap: 1000, aiDailyCap: 0, qlooDelayMs: 0,
    discoveryRef: syntheticDiscoveryReference(), venueLibrary: activeLibrary({}, true, VENUE_LIBRARY), actsRef: syntheticActsReference(), ...over,
  };
  return { d: forKind(d, "venue"), urls };
}
const tasteCalls = (urls: URL[]): URL[] => urls.filter((u) => u.searchParams.has("signal.interests.entities"));

async function plan(d: Deps, tweak: (n: Array<{ index: number; date: string; themeId: string | null; sponsor: string; locked: boolean; notes: string }>) => void = () => undefined) {
  const a = await analyze(d, { market, rows: parseCalendar(sampleCsv("raleigh")).rows });
  const nights = a.nights.map((n) => ({ index: n.index, date: n.date, themeId: n.resolution.kind === "theme" ? n.themeId : null, sponsor: n.sponsor, locked: n.locked, notes: n.notes }));
  tweak(nights);
  return nights;
}

describe("the taste graph is bounded", () => {
  it("is keyed on the market and the headliner only: changing another act on the calendar makes no new live call", async () => {
    const { d, urls } = setup();
    const nights = await plan(d);
    await proposeSwaps(d, { market, nights, allowDuplicates: false });
    expect(tasteCalls(urls).length).toBe(5);
    urls.length = 0;
    const changed = nights.map((n) => (!n.locked && n.themeId === "zac-brown-band" ? { ...n, themeId: "hozier" } : n)); // an unlocked hold becomes a different act
    await proposeSwaps(d, { market, nights: changed, allowDuplicates: false });
    expect(tasteCalls(urls)).toHaveLength(0);
  });

  it("makes at most five live lookups per request, and says so; the rest stay generic until recorded", async () => {
    const { d, urls } = setup();
    // Eight different locked headliners in one request.
    const nights = await plan(d, (n) => {
      const ids = ["dave-matthews-band", "luke-bryan", "phish", "the-lumineers", "jason-aldean", "zac-brown-band", "old-dominion", "hozier"];
      n.slice(0, 8).forEach((x, i) => Object.assign(x, { themeId: ids[i], locked: true }));
    });
    const out = await proposeSwaps(d, { market, nights, allowDuplicates: false });
    expect(tasteCalls(urls)).toHaveLength(MAX_LIVE_TASTE);
    expect(out.trace.some((t) => /at most 5 live lookups are made per request/.test(t.text))).toBe(true);
    expect(out.angles.filter((a) => a.options === undefined).length).toBe(3); // generic wording for the three beyond the cap
    // Asking again finishes the rest from what is recorded plus up to five more.
    urls.length = 0;
    await proposeSwaps(d, { market, nights, allowDuplicates: false });
    expect(tasteCalls(urls)).toHaveLength(3);
  });

  it("looks the same headliner up once, even on two dates", async () => {
    const { d, urls } = setup();
    const nights = await plan(d, (n) => {
      n.slice(0, 3).forEach((x) => Object.assign(x, { themeId: "dave-matthews-band", locked: true }));
    });
    const out = await proposeSwaps(d, { market, nights, allowDuplicates: false });
    expect(tasteCalls(urls).filter((u) => u.searchParams.get("signal.interests.entities")!.includes("dave-matthews-band"))).toHaveLength(1);
    expect(out.angles.filter((a) => a.themeId === "dave-matthews-band")).toHaveLength(3);
  });

  it("counts against the client's daily taste quota even on a sample market, and a recorded answer does not count", async () => {
    expect(DAILY_QUOTA.taste).toBe(20);
    const asked: string[] = [];
    const { d, urls } = setup({ gate: { allow: async (k) => (asked.push(k), k !== "taste") } });
    const nights = await plan(d);
    const out = await proposeSwaps(d, { market, nights, allowDuplicates: false });
    expect(asked).toContain("taste");
    expect(tasteCalls(urls)).toHaveLength(0);
    expect(out.trace.some((t) => /daily allowance is used up or could not be checked/.test(t.text))).toBe(true);
    // Record the answers, then run with the quota spent: nothing live is needed and the gate is not asked about taste.
    const open = setup();
    const n2 = await plan(open.d);
    await proposeSwaps(open.d, { market, nights: n2, allowDuplicates: false });
    const asked2: string[] = [];
    const gated = { ...open.d, gate: { allow: async (k: string) => (asked2.push(k), false) } } as Deps;
    await proposeSwaps(gated, { market, nights: n2, allowDuplicates: false });
    expect(asked2).not.toContain("taste");
  });

  it("makes no live call when a usage counter cannot be written, and says so", async () => {
    const { d, urls } = setup();
    const nights = await plan(d); // records the scores
    urls.length = 0;
    const put = d.kv.put.bind(d.kv);
    d.kv.put = async (k, v, o) => {
      if (k.startsWith("cap:")) throw new Error("KV put() limit exceeded for the day");
      return put(k, v, o);
    };
    const out = await proposeSwaps(d, { market, nights, allowDuplicates: false });
    expect(urls).toHaveLength(0);
    expect(out.trace.some((t) => /usage counters are unavailable/.test(t.text))).toBe(true);
    expect(out.angles.every((a) => a.options === undefined)).toBe(true); // generic wording
  });
});
