export type StudyThemeId =
  | "star-wars" | "princess" | "bluey" | "harry-potter" | "margaritaville"
  | "dinosaur" | "country" | "marvel" | "wrestling";

// Principle: each theme must map to one clear cultural entity bundle in Qloo.
// So generic superhero / DC nights are not Marvel, lucha libre is not counted
// as wrestling (it reads as a Latino-heritage cultural signal instead), and
// generic wizard nights are not Harry Potter. Food promos ("Dino Nugget",
// "Jurassic Pork") and sponsor/place names ("Country Financial", "Hill Country")
// are not themes either.
export const STUDY_THEMES: ReadonlyArray<{ id: StudyThemeId; label: string; pattern: RegExp }> = [
  { id: "star-wars", label: "Star Wars", pattern: /\bstars? wars\b|\bmay the (4th|fourth)\b|\bjedi\b|\bmandalorian\b/i },
  { id: "princess", label: "Princess", pattern: /\bprincess(es)?\b/i },
  { id: "bluey", label: "Bluey", pattern: /\bbluey\b/i },
  { id: "harry-potter", label: "Harry Potter", pattern: /\bharry potter\b|\bhogwarts\b|\bwizarding\b/i },
  { id: "margaritaville", label: "Margaritaville", pattern: /\bmargaritaville\b|\bjimmy buffett\b|\bparrot ?heads?\b/i },
  { id: "dinosaur", label: "Dinosaur", pattern: /\bdino(saur)?s?\b(?!\s*nugget)|\bjurassic (ballpark|weekend|night|park|world)\b/i },
  { id: "country", label: "Country", pattern: /\bcountry (music|western|hits|weekend|night|day|fireworks)\b|\bcountry (and|&) (rodeo|western)\b|\btheme: country\b/i },
  { id: "marvel", label: "Marvel", pattern: /\bmarvel\b|\bavengers\b|\bspider-?man\b/i },
  { id: "wrestling", label: "Wrestling", pattern: /\bwrestl(ing|er|ers)\b|\bwwe\b/i },
];

export function classifyThemes(promoNames: string[]): StudyThemeId[] {
  return STUDY_THEMES.filter((t) => promoNames.some((n) => t.pattern.test(n))).map((t) => t.id);
}

/**
 * Promos on a game that are not study-theme promos: names matching none of the nine themes.
 * On a single-theme study night this is promoNames.length minus the names matching its theme.
 * It is the "number of other promos" regressor of the robustness baseline (pre-registration, R2).
 */
export function otherPromoCount(promoNames: string[]): number {
  return promoNames.filter((n) => !STUDY_THEMES.some((t) => t.pattern.test(n))).length;
}
