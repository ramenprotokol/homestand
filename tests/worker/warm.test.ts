import { describe, expect, it } from "vitest";
import { syntheticDiscoveryReference } from "../../src/app/discovery";
import { activeLibrary } from "../../src/app/themes/ids";
import type { Deps } from "../../src/worker/agent";
import { METROS } from "../../src/worker/metros";
import { memoryKv, type KvPort } from "../../src/worker/ports";
import { SYNTHETIC_REFERENCE } from "../../src/worker/reference";
import { syntheticQlooFetch } from "../../src/worker/synthetic";
import { runWarm, warmFetch } from "../../src/worker/warm";
import { spyCounters } from "./counters";

function setup(over: Partial<Deps> = {}) {
  const inner = memoryKv();
  const puts: string[] = [];
  const kv: KvPort & { data: Map<string, string> } = { data: inner.data, get: inner.get, put: async (k, v, o) => (puts.push(k), inner.put(k, v, o)) };
  const counters = spyCounters();
  const d: Deps = {
    kv, counters, ai: null, mode: "live", qlooFetch: syntheticQlooFetch, qlooBase: "https://qloo.test", qlooKey: "k", library: activeLibrary({}, true), reference: SYNTHETIC_REFERENCE,
    now: () => new Date("2026-10-25T03:00:00.000Z"), qlooDailyCap: 1500, aiDailyCap: 0, qlooDelayMs: 0, discoveryRef: syntheticDiscoveryReference(), ...over,
  };
  return { d, puts, counters };
}

describe("the pre-warm", () => {
  it("lists about 150 metros or more, each with a unique label and sane coordinates", () => {
    expect(METROS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(METROS.map((m) => m.label)).size).toBe(METROS.length);
    for (const m of METROS) {
      expect(m.lon).toBeGreaterThan(-170);
      expect(m.lon).toBeLessThan(-50);
      expect(m.lat).toBeGreaterThan(20);
      expect(m.lat).toBeLessThan(75);
    }
  });

  it("saves a few towns a run for 2 KV writes each, and does nothing for a town already saved", async () => {
    const { d, puts, counters } = setup();
    const first = await runWarm(d, { max: 3 });
    expect(first).toMatchObject({ warmed: 3, alreadySaved: 0, stoppedBecause: "per-run limit" });
    expect(first.towns).toEqual(METROS.slice(0, 3).map((m) => m.label));
    const content = puts.filter((k) => !k.startsWith("cap:"));
    expect(content.filter((k) => k.startsWith("lib:"))).toHaveLength(3);
    expect(content.filter((k) => k.startsWith("disc:"))).toHaveLength(3);
    expect(counters.takes.filter((t) => t.key.startsWith("cap:qloo:"))).toHaveLength(3); // one counter step per town, not two
    const writesBefore = puts.length;
    const second = await runWarm(d, { max: 3 });
    expect(second.alreadySaved).toBe(3);
    expect(second.towns).toEqual(METROS.slice(3, 6).map((m) => m.label));
    expect(puts.length - writesBefore).toBe(6); // two saved results per new town, and no counter in KV
  });

  it("stops at its share of the day's Qloo allowance so visitors keep headroom", async () => {
    const { d } = setup({ qlooDailyCap: 30 }); // 40% of 30 is 12 calls: two towns (7 calls each) fit, a third is refused
    const out = await runWarm(d, { max: 8 });
    expect(out.warmed).toBe(2);
    expect(out.stoppedBecause).toBe("daily share");
  });

  it("stops when the key is refused, and does not run at all in synthetic mode", async () => {
    const refused = setup({ qlooFetch: async () => new Response("{}", { status: 401 }) });
    expect((await runWarm(refused.d)).stoppedBecause).toBe("key refused");
    const syn = setup({ mode: "synthetic" });
    expect(await runWarm(syn.d)).toMatchObject({ warmed: 0, stoppedBecause: null });
    expect(syn.puts).toEqual([]);
  });

  it("the on-demand route needs the secret token, and does not exist without one", async () => {
    const { d } = setup();
    const post = (auth?: string) => new Request("https://api.test/api/warm?max=1", { method: "POST", headers: auth ? { authorization: auth } : {} });
    const env = (token?: string) => ({ WARM_TOKEN: token });
    expect((await warmFetch(post("Bearer x".padEnd(20, "x")), env(), d)).status).toBe(404);
    expect((await warmFetch(post(), env("t".repeat(20)), d)).status).toBe(403);
    expect((await warmFetch(post("Bearer wrong"), env("t".repeat(20)), d)).status).toBe(403);
    const ok = await warmFetch(post(`Bearer ${"t".repeat(20)}`), env("t".repeat(20)), d);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { warmed: number }).warmed).toBe(1);
  });
});
