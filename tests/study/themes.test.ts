import { describe, expect, it } from "vitest";
import { STUDY_THEMES, classifyThemes } from "../../src/study/themes";

describe("classifyThemes", () => {
  it("has the nine study themes in order", () => {
    expect(STUDY_THEMES.map((t) => t.id)).toEqual(["star-wars", "princess", "bluey", "harry-potter", "margaritaville", "dinosaur", "country", "marvel", "wrestling"]);
  });
  it.each([
    [["Star Wars Night"], ["star-wars"]],
    [["May the 4th Be With You"], ["star-wars"]],
    [["Princess & Superhero Night"], ["princess"]],
    [["Bluey Day"], ["bluey"]],
    [["Wizarding Night"], ["harry-potter"]],
    [["Harry Potter Night presented by X"], ["harry-potter"]],
    [["Margaritaville Night"], ["margaritaville"]],
    [["Jimmy Buffett Tribute"], ["margaritaville"]],
    [["Dino Day"], ["dinosaur"]],
    [["Jurassic Night"], ["dinosaur"]],
    [["Country Night"], ["country"]],
    [["Country Music Night"], ["country"]],
    [["Marvel Super Hero Night"], ["marvel"]],
    [["Spider-Man Night"], ["marvel"]],
    [["Wrestling Night"], ["wrestling"]],
    [["WWE Legends Appearance"], ["wrestling"]],
  ])("%j → %j", (names, expected) => {
    expect(classifyThemes(names)).toEqual(expected);
  });
  it("ignores unrelated promos and near-misses", () => {
    expect(classifyThemes(["Postgame Fireworks", "Bobblehead Giveaway", "Wizard of Oz Night", "Country Club Night", "Dinner Night"])).toEqual([]);
  });
  it("returns each theme once, in canonical order", () => {
    expect(classifyThemes(["Bluey Night", "Star Wars Night", "Bluey Meet & Greet"])).toEqual(["star-wars", "bluey"]);
  });
});
