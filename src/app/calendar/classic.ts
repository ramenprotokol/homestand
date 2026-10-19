// Staples that are not a pop-culture taste. Matched on whole words in the lower-cased, punctuation-free text.
const CLASSIC_PHRASES: readonly string[] = [
  "fireworks", "firework", "dollar dog", "dollar dogs", "dollar hot dog", "dollar hot dogs", "bark in the park", "bark at the park", "bark park",
  "giveaway", "bobblehead", "bobble head", "replica jersey", "jersey giveaway", "free t shirt", "t shirt giveaway", "cap giveaway", "hat giveaway", "magnet schedule",
  "faith", "family faith", "christian", "heritage", "hispanic heritage", "black heritage", "irish heritage", "military", "veterans", "veteran", "armed forces", "first responder",
  "first responders", "salute", "opening day", "fan appreciation", "senior day", "dollar night", "dollar days", "thirsty thursday", "two for tuesday", "family value",
];

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Whole-phrase match on already normalised text. */
export function hasPhrase(normalised: string, phrase: string): boolean {
  return ` ${normalised} `.includes(` ${normalizeText(phrase)} `);
}

/** `extra` adds phrases that are classic nights only for one kind of run (a concert venue's "battle of the bands"). */
export function isClassicNight(text: string, extra: readonly string[] = []): boolean {
  const n = normalizeText(text);
  return CLASSIC_PHRASES.some((p) => hasPhrase(n, p)) || extra.some((p) => hasPhrase(n, p));
}
