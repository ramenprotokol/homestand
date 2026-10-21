import { describe, expect, it } from "vitest";
import { SYNTHETIC_REFERENCE as REFERENCE } from "../../src/worker/reference";
import { activeLibrary } from "../../src/app/themes/ids";
import type { TraceStep } from "../../src/app/trace";
import { replyText, runModel, type Deps } from "../../src/worker/agent";
import { memoryKv, type AiPort } from "../../src/worker/ports";
import { syntheticQlooFetch } from "../../src/worker/synthetic";

const TEXT = "The new theme sits closer to what people near the ballpark like than the planned one.";

function deps(ai: AiPort | null, over: Partial<Deps> = {}): Deps {
  return {
    kv: memoryKv(), ai, mode: "live", qlooFetch: syntheticQlooFetch, qlooBase: "https://qloo.test", qlooKey: "k", library: activeLibrary({}, true), reference: REFERENCE,
    now: () => new Date("2026-10-15T12:00:00.000Z"), qlooDailyCap: 400, aiDailyCap: 150, qlooDelayMs: 0, ...over,
  };
}

async function run(ai: AiPort, over: Partial<Deps> = {}): Promise<{ text: string | null; trace: TraceStep[] }> {
  const trace: TraceStep[] = [];
  const text = await runModel(deps(ai, over), "system", "user", trace, "Asking", 100);
  return { text, trace };
}

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
  it("uses the model's text from the OpenAI chat shape, a response string and a parsed object", async () => {
    expect((await run({ run: async () => ({ choices: [{ message: { content: TEXT } }] }) })).text).toBe(TEXT);
    expect((await run({ run: async () => ({ response: TEXT }) })).text).toBe(TEXT);
    const r = await run({ run: async () => ({ response: { note: "x" } }) });
    expect(r.text).toBe('{"note":"x"}');
    expect(r.trace.some((t) => t.text.includes("the model replied"))).toBe(true);
  });
  it("says plainly when a reply can't be used", async () => {
    const r = await run({ run: async () => ({}) });
    expect(r.text).toBeNull();
    expect(r.trace[0]!.text).toContain("the model's reply couldn't be used, so template text is used");
    expect(r.trace[0]!.text).not.toContain("one call");
  });
  it("gives up on a slow model after the time limit and uses the template", async () => {
    const started = Date.now();
    const r = await run({ run: () => new Promise(() => undefined) }, { aiTimeoutMs: 30 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(r.text).toBeNull();
    expect(r.trace.some((t) => t.text.includes("the model took too long"))).toBe(true);
  });
  it("keeps upstream error text out of the trace", async () => {
    const r = await run({ run: async () => { throw new Error("secret upstream detail: token=abc123"); } });
    expect(r.text).toBeNull();
    expect(JSON.stringify(r.trace)).not.toMatch(/secret upstream|abc123/);
    expect(r.trace[0]!.text).toContain("the model call failed, so template text is used");
  });
  it("says whether the budget spent is the shared one or the visitor's own, and what happens to the text", async () => {
    const shared = await run({ run: async () => ({ response: TEXT }) }, { aiDailyCap: 0 });
    expect(shared.trace[0]!.text).toBe("Asking: today's shared model budget is spent, so template text is used.");
    const visitor = await run({ run: async () => ({ response: TEXT }) }, { gate: { allow: async () => false } });
    expect(visitor.trace[0]!.text).toBe("Asking: your daily limit of model calls is spent, so template text is used.");
    const trace: TraceStep[] = [];
    await runModel(deps({ run: async () => ({}) }, { aiDailyCap: 0 }), "s", "u", trace, "Matching unrecognized theme names", 100, "those names stay unscored");
    expect(trace[0]!.text).toBe("Matching unrecognized theme names: today's shared model budget is spent, so those names stay unscored.");
  });
  it("stops at the per-client daily allowance without calling the model", async () => {
    let calls = 0;
    const r = await run({ run: async () => (calls++, { response: TEXT }) }, { gate: { allow: async () => false } });
    expect(calls).toBe(0);
    expect(r.text).toBeNull();
    expect(r.trace[0]!.text).toContain("your daily limit of model calls is spent");
  });
});
