import { describe, expect, it } from "vitest";
import { SYNTHETIC_REFERENCE as REFERENCE } from "../../src/app/score";
import { SAMPLE_MARKETS } from "../../src/app/markets";
import { activeLibrary } from "../../src/app/themes/ids";
import { memoSummary, replyText, type Deps } from "../../src/worker/agent";
import { memoryKv, type AiPort } from "../../src/worker/ports";
import { syntheticQlooFetch } from "../../src/worker/synthetic";

const biloxi = SAMPLE_MARKETS[0]!;
const market = { label: biloxi.label, lon: biloxi.lon, lat: biloxi.lat };
const TEXT = "The new theme sits closer to what people near the ballpark like than the planned one.";

function deps(ai: AiPort | null, over: Partial<Deps> = {}): Deps {
  return {
    kv: memoryKv(), ai, mode: "live", qlooFetch: syntheticQlooFetch, qlooBase: "https://qloo.test", qlooKey: "k", library: activeLibrary({}, true), reference: REFERENCE,
    now: () => new Date("2026-10-15T12:00:00.000Z"), qlooDailyCap: 400, aiDailyCap: 150, qlooDelayMs: 0, ...over,
  };
}
const swap = { date: "2026-07-03", fromThemeId: "elvis", toThemeId: "grateful-dead" };
const run = (ai: AiPort, over: Partial<Deps> = {}) => memoSummary(deps(ai, over), { market, swaps: [swap], nights: 24, classic: 3 });

describe("model reply shapes", () => {
  it("reads every shape Workers AI has returned", () => {
    expect(replyText({ choices: [{ message: { content: TEXT } }] })).toBe(TEXT);
    expect(replyText({ response: TEXT })).toBe(TEXT);
    expect(replyText({ response: [{ id: "a", why: "b" }] })).toBe('[{"id":"a","why":"b"}]');
    expect(replyText(TEXT)).toBe(TEXT);
    expect(replyText({ choices: [] })).toBeNull();
    expect(replyText({ response: "  " })).toBeNull();
    expect(replyText(null)).toBeNull();
  });
  it("uses the model's text from the OpenAI chat shape", async () => {
    const m = await run({ run: async () => ({ choices: [{ message: { content: TEXT } }] }) });
    expect(m.summarySource).toBe("model");
    expect(m.summary).toBe(TEXT);
    expect(m.trace.some((t) => t.text.includes("the model replied"))).toBe(true);
  });
  it("uses the model's text from a response string and from a parsed object", async () => {
    expect((await run({ run: async () => ({ response: TEXT }) })).summarySource).toBe("model");
    // A model that returns JSON already parsed gives text via JSON.stringify, which the guard may reject; the reply itself is still read.
    const m = await run({ run: async () => ({ response: { note: "x" } }) });
    expect(m.trace.some((t) => t.text.includes("the model replied"))).toBe(true);
  });
  it("says plainly when a reply can't be used", async () => {
    const m = await run({ run: async () => ({}) });
    expect(m.summarySource).toBe("template");
    const line = m.trace.find((t) => t.kind === "model")!;
    expect(line.text).toContain("the model's reply couldn't be used, so template text is used");
    expect(line.text).not.toContain("one call");
  });
  it("gives up on a slow model after the time limit and uses the template", async () => {
    const started = Date.now();
    const m = await run({ run: () => new Promise(() => undefined) }, { aiTimeoutMs: 30 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(m.summarySource).toBe("template");
    expect(m.trace.some((t) => t.text.includes("the model took too long"))).toBe(true);
  });
});
