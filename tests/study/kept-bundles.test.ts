import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KEPT_BUNDLES, LLM_THEME_TEXT, bundleAffinity, keptIdsOfType, llmPrompt, llmReplyText, median, nationalPopularityFromReadings, parseLlmInteger, slug,
  type EntityReading,
} from "../../src/study/kept-bundles";
import { STUDY_THEMES, type StudyThemeId } from "../../src/study/themes";

const prereg = readFileSync("study/PREREGISTRATION.md", "utf8");
const amendment4 = prereg.slice(prereg.indexOf("### Amendment 4"), prereg.indexOf("### Amendment 5") === -1 ? undefined : prereg.indexOf("### Amendment 5"));
const THEME_BY_LABEL: Record<string, StudyThemeId> = Object.fromEntries(STUDY_THEMES.map((t) => [t.label, t.id]));

describe("kept bundles vs Amendment 4", () => {
  const rows = [...amendment4.matchAll(/^\| ([A-Za-z ]+) \| (.+?) \| (movie|tv_show|book|artist|brand) \| `([0-9A-F-]{36})` \| (\[redacted under Qloo data terms\]|[0-9.]+) \|$/gm)];

  it("the amendment table has the 14 kept entities", () => {
    expect(rows).toHaveLength(14);
  });

  it("matches every row: theme, name, type and ID, with nothing extra", () => {
    const fromDoc = rows.map((r) => `${THEME_BY_LABEL[r[1]!.trim()]}|${r[2]}|${r[3]}|${r[4]}`).sort();
    const fromCode = Object.entries(KEPT_BUNDLES).flatMap(([t, es]) => es.map((e) => `${t}|${e.name}|${e.type}|${e.id}`)).sort();
    expect(fromCode).toEqual(fromDoc);
  });

  it("batches IDs by type", () => {
    expect(keptIdsOfType("movie")).toHaveLength(6);
    expect(keptIdsOfType("tv_show")).toHaveLength(2);
    expect(keptIdsOfType("artist")).toHaveLength(4);
    expect(keptIdsOfType("book")).toHaveLength(1);
    expect(keptIdsOfType("brand")).toHaveLength(1);
  });

  it("the LLM example strings are exactly the amendment's", () => {
    const listed = [...amendment4.matchAll(/^- (Star Wars|Princess|Bluey|Harry Potter|Margaritaville|Dinosaur|Country|Marvel|Wrestling): "(.+)"$/gm)];
    expect(listed).toHaveLength(9);
    for (const m of listed) expect(LLM_THEME_TEXT[THEME_BY_LABEL[m[1]!]!].examples).toBe(m[2]);
  });
});

describe("llm prompt", () => {
  it("is the A6 wording with the Amendment 4 examples", () => {
    expect(llmPrompt("Akron", "OH", "country")).toBe(
      "On a scale of 1 to 10, how much does the local market around Akron, OH over-index on country music (for example Luke Combs, Morgan Wallen, Carrie Underwood) compared with the average US Minor League Baseball market? Reply with a single integer.",
    );
    expect(llmPrompt("X", "Y", "wrestling")).toContain("over-index on pro wrestling (for example WWE)");
  });
});

describe("parseLlmInteger (Amendment 5)", () => {
  it.each([["7", 7], [" 7\n", 7], ["7.", 7], ["10", 10], ["10.", 10], ["1", 1], [7, 7]])("accepts %j", (r, n) => {
    expect(parseLlmInteger(r)).toBe(n);
  });
  it.each(["seven", "7/10", "6-7", "7.5", "0", "11", "07", "7 out of 10", "", "7..", "-3", "1.0", "About 7", null, undefined, 7.5, 0, 11])("rejects %j", (r) => {
    expect(parseLlmInteger(r)).toBeNull();
  });
});

describe("llmReplyText", () => {
  it("prefers choices[0].message.content, falls back to response", () => {
    expect(llmReplyText({ choices: [{ message: { content: "8" } }], response: 9 })).toBe("8");
    expect(llmReplyText({ response: "6" })).toBe("6");
    expect(llmReplyText({})).toBeUndefined();
  });
});

describe("slug", () => {
  it("is filesystem safe", () => {
    expect(slug("Aberdeen IronBirds")).toBe("aberdeen-ironbirds");
    expect(slug("St. Paul Saints")).toBe("st-paul-saints");
  });
});

const reading = (a: number | null, p: number | null = 0.5): EntityReading => ({ affinity: a, popularity: p });

describe("bundleAffinity (fixed bundle)", () => {
  const [a, b] = KEPT_BUNDLES.princess;
  it("averages all kept entities", () => {
    expect(bundleAffinity("princess", new Map([[a!.id, reading(0.8)], [b!.id, reading(0.6)]]))).toBeCloseTo(0.7);
  });
  it("is missing if any kept entity has no affinity (or is absent)", () => {
    expect(bundleAffinity("princess", new Map([[a!.id, reading(0.8)], [b!.id, reading(null)]]))).toBeNull();
    expect(bundleAffinity("princess", new Map([[a!.id, reading(0.8)]]))).toBeNull();
  });
  it("single-entity bundle is that entity's affinity", () => {
    expect(bundleAffinity("bluey", new Map([[KEPT_BUNDLES.bluey[0]!.id, reading(0.33)]]))).toBe(0.33);
  });
});

describe("nationalPopularityFromReadings", () => {
  const all = (pop: (id: string, club: number) => number) => [0, 1, 2].map((c) => new Map(Object.values(KEPT_BUNDLES).flat().map((e) => [e.id, reading(0.5, pop(e.id, c))])));
  it("uses the common value when constant", () => {
    const r = nationalPopularityFromReadings(all(() => 0.9));
    expect(r.perTheme.bluey).toBeCloseTo(0.9);
    expect(Object.values(r.perEntity).every((e) => e.constant)).toBe(true);
  });
  it("uses the median across clubs when it varies, and reports the range", () => {
    const bluey = KEPT_BUNDLES.bluey[0]!.id;
    const r = nationalPopularityFromReadings(all((id, c) => (id === bluey ? [0.1, 0.9, 0.4][c]! : 0.5)));
    expect(r.perEntity[bluey]).toMatchObject({ min: 0.1, max: 0.9, used: 0.4, constant: false });
    expect(r.perTheme.bluey).toBeCloseTo(0.4);
  });
  it("throws if an entity never reports popularity", () => {
    expect(() => nationalPopularityFromReadings([new Map()])).toThrow(/no popularity/);
  });
});

describe("median", () => {
  it("handles odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
