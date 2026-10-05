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
    [["Stars Wars Night"], ["star-wars"]],
    [["Dino-Weekend"], ["dinosaur"]],
    [["Dinos at the Diamond"], ["dinosaur"]],
    [["Jurassic Ballpark"], ["dinosaur"]],
    [["Jurassic Weekend"], ["dinosaur"]],
    [["Country Western Night"], ["country"]],
    [["Country Hits Night"], ["country"]],
    [["Country Weekend"], ["country"]],
    [["Country and Rodeo Night"], ["country"]],
    [["Country & Western Night"], ["country"]],
    [["Fireworks Friday - Country Music"], ["country"]],
    [["Postgame Country Fireworks"], ["country"]],
    [["Firework Fridays (Theme: Country Night)"], ["country"]],
  ])("%j → %j", (names, expected) => {
    expect(classifyThemes(names)).toEqual(expected);
  });
  it("ignores unrelated promos and near-misses", () => {
    expect(classifyThemes(["Postgame Fireworks", "Bobblehead Giveaway", "Wizard of Oz Night", "Country Club Night", "Dinner Night"])).toEqual([]);
  });
  it.each([
    "Super Hero Night", "Superhero Day", "DC Super Hero Night",
    "Lucha Libre Appearance", "Luchador Mask Giveaway",
    "Wands & Wizards Night", "Witches & Wizards Night",
    "Buffett Beach Band Postgame Concert",
    "Dino Nugget Night", "Dino Nuggets Plush Giveaway", "Jurassic Pork",
    "Braves Country Road Trip", "Hill Country Relief", "Country Financial Night", "Country Bank Night",
  ])("deliberately does not match %j", (name) => {
    expect(classifyThemes([name])).toEqual([]);
  });
  it("returns each theme once, in canonical order", () => {
    expect(classifyThemes(["Bluey Night", "Star Wars Night", "Bluey Meet & Greet"])).toEqual(["star-wars", "bluey"]);
  });
});
