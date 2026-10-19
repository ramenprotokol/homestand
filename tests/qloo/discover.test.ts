import { describe, expect, it } from "vitest";
import { createQlooClient, discoveredFromBody, FAMILY_TAG, KIDS_TAGS } from "../../src/qloo/client";

describe("discovery requests", () => {
  const seen: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    seen.push(new URL(String(input)));
    return new Response(JSON.stringify({ results: { entities: [{ entity_id: "a", name: " Sing 2 ", query: { affinity: 0.91 }, properties: { junk: 1 } }, { entity_id: "", name: "No id" }, { entity_id: "b", name: "Smallfoot" }] } }));
  };
  const client = createQlooClient({ baseUrl: "https://q.test", apiKey: "k", fetchImpl, delayMs: 0, sleep: async () => undefined });

  it("always sends the family tag, a longitude-first POINT and the radius, and the age signal only when asked", async () => {
    await client.discoverFamily({ type: "movie", lon: -88.9, lat: 30.4, radiusM: 80000, take: 10 });
    await client.discoverFamily({ type: "tv_show", lon: -88.9, lat: 30.4, radiusM: 80000, take: 6, age: "24_and_younger" });
    expect(seen).toHaveLength(2);
    for (const u of seen) {
      expect(u.pathname).toBe("/v2/insights");
      expect(u.searchParams.get("filter.tags")).toBe("urn:tag:genre:media:family,urn:tag:genre:media:animation");
      expect(KIDS_TAGS.split(",")).toContain(FAMILY_TAG);
      expect(u.searchParams.get("operator.filter.tags")).toBe("intersection");
      expect(u.searchParams.get("signal.location")).toBe("POINT(-88.9 30.4)");
      expect(u.searchParams.get("signal.location.radius")).toBe("80000");
    }
    expect(seen[0]!.searchParams.get("filter.type")).toBe("urn:entity:movie");
    expect(seen[0]!.searchParams.has("signal.demographics.age")).toBe(false);
    expect(seen[1]!.searchParams.get("filter.type")).toBe("urn:entity:tv_show");
    expect(seen[1]!.searchParams.get("signal.demographics.age")).toBe("24_and_younger");
    expect(seen[1]!.searchParams.get("take")).toBe("6");
  });
  it("keeps only name, id, type and affinity, and skips rows without a name or id", () => {
    const out = discoveredFromBody({ results: { entities: [{ entity_id: "a", name: " Sing 2 ", query: { affinity: 0.91 }, properties: { x: 1 } }, { entity_id: "", name: "No id" }, { entity_id: "b", name: "Smallfoot" }] } }, "movie");
    expect(out).toEqual([{ entityId: "a", name: "Sing 2", type: "movie", affinity: 0.91 }, { entityId: "b", name: "Smallfoot", type: "movie", affinity: null }]);
  });
});
