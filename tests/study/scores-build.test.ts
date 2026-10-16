import { describe, expect, it } from "vitest";
import { parseScores } from "../../src/study/analysis";
import { KEPT_BUNDLES, THEME_IDS } from "../../src/study/kept-bundles";
import { buildScores, type ClubRow } from "../../src/study/scores-build";

// SYNTHETIC data only: made-up numbers in Qloo's response shape.
const clubs: ClubRow[] = [
  { club: "Alpha A", city: "Alpha", state: "AA", lat: 1, lon: 2 },
  { club: "Beta B", city: "Beta", state: "BB", lat: 3, lon: 4 },
];
const body = (type: string, club: string, drop: string[] = []) => ({
  results: {
    entities: Object.values(KEPT_BUNDLES).flat().filter((e) => e.type === type && !drop.includes(e.name)).map((e, i) => ({
      entity_id: e.id, name: e.name, popularity: 0.9, query: { affinity: club === "Alpha A" ? 0.5 + i / 100 : 0.6 + i / 100 },
    })),
  },
});

describe("buildScores", () => {
  const run = (drop: string[], llmFor: (club: string, theme: string) => unknown[]) =>
    buildScores({
      clubs, pulledAt: "2026-10-15T00:00:00.000Z",
      readQloo: (club, type) => body(type, club, club === "Beta B" ? drop : []),
      readLlm: (club, theme) => ({ replies: llmFor(club, theme) }),
    });

  it("produces a table parseScores accepts, with fixed-bundle missing", () => {
    const out = run(["Moana"], () => ["6"]);
    parseScores(JSON.parse(JSON.stringify(out.scores)));
    expect(out.scores.qloo["Alpha A"]!.princess).toBeDefined();
    expect("princess" in out.scores.qloo["Beta B"]!).toBe(false);
    expect(out.missing.qloo.princess).toBe(1);
    expect(out.missing.qloo.bluey).toBe(0);
    expect(out.scores.nationalPopularity.bluey).toBeCloseTo(0.9);
  });

  it("LLM: integer, retried-then-integer, retried-then-missing", () => {
    const out = run([], (_club, theme) => (theme === "bluey" ? ["about 7", "seven"] : theme === "princess" ? ["lots", "8."] : ["5"]));
    expect(out.scores.llm["Alpha A"]!.princess).toBe(8);
    expect("bluey" in out.scores.llm["Alpha A"]!).toBe(false);
    expect(out.missing.llm.bluey).toBe(2);
    expect(out.llmRetried).toBe(4);
    expect(out.llmNonInteger).toBe(2);
    expect(out.scores.llm["Beta B"]!.country).toBe(5);
    expect(THEME_IDS.length).toBe(9);
  });

  it("does not use a retry reply when the first reply was already an integer", () => {
    const out = run([], () => ["4", "9"]);
    expect(out.scores.llm["Alpha A"]!.bluey).toBe(4);
  });
});
