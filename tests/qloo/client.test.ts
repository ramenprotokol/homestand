import { describe, expect, it, vi } from "vitest";
import { createQlooClient } from "../../src/qloo/client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const make = (fetchImpl: typeof fetch) =>
  createQlooClient({ baseUrl: "https://q.test", apiKey: "k", fetchImpl, delayMs: 0, sleep: async () => {} });

describe("qloo client", () => {
  it("sends the key header and a longitude-first, %20-encoded POINT", async () => {
    const f = vi.fn(async () => json({ results: { entities: [] } }));
    await make(f as unknown as typeof fetch).localAffinity({ type: "tv_show", entityIds: ["a", "b"], lon: -97.1, lat: 33.2, radiusM: 40000 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("k");
    expect(url).toContain("signal.location=POINT(-97.1%2033.2)");
    expect(url).toContain("signal.location.radius=40000");
    expect(url).toContain("filter.type=urn%3Aentity%3Atv_show");
    expect(url).toContain("filter.results.entities=a%2Cb");
  });

  it("sends filter.release_year.min only when asked", async () => {
    const f = vi.fn(async () => json({ results: { entities: [] } }));
    const c = make(f as unknown as typeof fetch);
    await c.localAffinity({ type: "movie", entityIds: ["a"], lon: 0, lat: 0, releaseYearMin: 1900 });
    await c.localAffinity({ type: "movie", entityIds: ["a"], lon: 0, lat: 0 });
    const urls = f.mock.calls.map((x) => (x as unknown as [string])[0]);
    expect(urls[0]).toContain("filter.release_year.min=1900");
    expect(urls[1]).not.toContain("release_year");
  });

  it("uses signal.location.query for the locality fallback", async () => {
    const f = vi.fn(async () => json({ results: { entities: [] } }));
    await make(f as unknown as typeof fetch).localAffinity({ type: "movie", entityIds: ["a"], lon: 1, lat: 2, locationQuery: "Aberdeen, MD" });
    const url = (f.mock.calls[0] as unknown as [string])[0];
    expect(url).toContain("signal.location.query=Aberdeen%2C%20MD");
    expect(url).not.toContain("POINT");
  });

  it("returns null affinity for an ID Qloo omits", async () => {
    const f = async () => json({ results: { entities: [{ entity_id: "a", name: "A", popularity: 0.5, query: { affinity: 0.7 } }] } });
    const rows = await make(f as unknown as typeof fetch).localAffinity({ type: "movie", entityIds: ["a", "b"], lon: 0, lat: 0 });
    expect(rows).toEqual([
      { entityId: "a", name: "A", affinity: 0.7, popularity: 0.5 },
      { entityId: "b", name: "", affinity: null, popularity: null },
    ]);
  });

  it("parses search hits, year from release_year or release_date", async () => {
    const f = async () => json({ results: [
      { name: "Frozen", entity_id: "1", types: ["urn:entity:movie"], properties: { release_year: 2013 }, popularity: 0.9 },
      { name: "Moana", entity_id: "2", types: [], properties: { release_date: "2016-11-23" } },
    ] });
    const hits = await make(f as unknown as typeof fetch).search("x", "movie");
    expect(hits.map((h) => [h.entityId, h.releaseYear, h.popularity])).toEqual([["1", 2013, 0.9], ["2", 2016, null]]);
  });

  it("retries 429 with backoff and counts every attempt", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ results: [] }));
    const sleep = vi.fn(async () => {});
    const c = createQlooClient({ baseUrl: "https://q.test", apiKey: "k", fetchImpl: f as unknown as typeof fetch, delayMs: 0, sleep });
    await c.search("x", "movie");
    expect(c.requests).toBe(3);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("gives up after 5 rate-limited tries", async () => {
    const f = vi.fn(async () => json({}, 429));
    await expect(make(f as unknown as typeof fetch).search("x", "movie")).rejects.toThrow(/rate-limited/);
    expect(f).toHaveBeenCalledTimes(5);
  });

  it.each([401, 403])("stops immediately on %i", async (status) => {
    const f = vi.fn(async () => json({}, status));
    await expect(make(f as unknown as typeof fetch).search("x", "movie")).rejects.toThrow(String(status));
    expect(f).toHaveBeenCalledTimes(1);
  });
});
