import { describe, expect, it } from "vitest";
import { BUNDLE_ENTITIES } from "../../src/study/bundles";
import { activeLibrary, COMMITTED_IDS, idsOfType } from "../../src/app/themes/ids";
import { STUDY_THEME_IDS, THEME_LIBRARY } from "../../src/app/themes/library";
import { SAMPLE_MARKETS, marketKey } from "../../src/app/markets";

describe("theme library", () => {
  it("has about 40 themes with unique ids, labels and entity keys", () => {
    expect(THEME_LIBRARY.length).toBeGreaterThanOrEqual(38);
    expect(new Set(THEME_LIBRARY.map((t) => t.id)).size).toBe(THEME_LIBRARY.length);
    const keys = THEME_LIBRARY.flatMap((t) => t.entities.map((e) => e.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of THEME_LIBRARY) {
      expect(t.entities.length).toBeGreaterThanOrEqual(1);
      expect(t.entities.length).toBeLessThanOrEqual(3);
      expect(t.aliases.length).toBeGreaterThan(0);
    }
  });

  it("uses valid date windows", () => {
    for (const t of THEME_LIBRARY) if (t.window) for (const d of [t.window.from, t.window.to]) expect(d).toMatch(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
    expect(THEME_LIBRARY.find((t) => t.id === "grinch")?.window).toEqual({ from: "11-01", to: "12-31" });
    expect(THEME_LIBRARY.find((t) => t.id === "hocus-pocus")?.window).toEqual({ from: "09-01", to: "10-31" });
  });

  it("starts with the nine study themes, and each kept Amendment 4 bundle entity has its committed ID", () => {
    expect(STUDY_THEME_IDS).toEqual(["star-wars", "princess", "bluey", "harry-potter", "margaritaville", "dinosaur", "country", "marvel", "wrestling"]);
    const live = activeLibrary(COMMITTED_IDS, false);
    // The study themes come first; resolution then added the others that Qloo has local data for.
    expect(live.slice(0, 9).map((t) => t.id)).toEqual(STUDY_THEME_IDS);
    const studyKeys = new Set(BUNDLE_ENTITIES.map((b) => b.key));
    for (const t of live.slice(0, 9)) for (const e of t.entities) expect(studyKeys.has(e.key)).toBe(true);
    // Amendment 4's table: 14 kept entities.
    expect(live.slice(0, 9).flatMap((t) => t.entities)).toHaveLength(14);
    expect(live.find((t) => t.id === "country")!.entities.map((e) => e.id)).toEqual([
      "3CBD78B1-D2F2-4551-A342-4621B6BDB5E2",
      "59DCDFA8-5082-47D9-B3E5-2B49CF2A778F",
      "19AC0383-5BB2-4423-8598-709713C22148",
    ]);
  });

  it("synthetic mode keeps every theme; live mode drops entities without an ID and empty themes", () => {
    expect(activeLibrary({}, true)).toHaveLength(THEME_LIBRARY.length);
    expect(activeLibrary({}, false)).toHaveLength(0);
    const one = activeLibrary({ "bluey:tv": { id: "X", name: "Bluey" } }, false);
    expect(one.map((t) => t.id)).toEqual(["bluey"]);
  });

  it("batches by type within Qloo's 50 per call", () => {
    const lib = activeLibrary({}, true);
    for (const type of ["movie", "tv_show", "artist", "book", "brand"] as const) expect(idsOfType(lib, type).length).toBeLessThanOrEqual(50);
  });
});

describe("sample markets", () => {
  it("are four places, named as places", () => {
    expect(SAMPLE_MARKETS).toHaveLength(4);
    for (const m of SAMPLE_MARKETS) {
      expect(m.label).toMatch(/sample club$/);
      expect(Math.abs(m.lat)).toBeLessThan(90);
      expect(m.lon).toBeLessThan(0);
    }
    expect(marketKey({ lon: -88.88531, lat: 30.39603 })).toBe("-88.885,30.396");
  });
});
