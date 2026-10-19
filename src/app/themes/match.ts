import type { Theme } from "./library";

export const normTitle = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Is this title already a library theme? By Qloo id, by exact name, or when the name contains a theme's name as whole words
 * ("Bluey Minisodes", "Star Trek: Lower Decks"). Used for the discovery pool and the live discovery step.
 */
export function libraryTitleMatcher(ids: ReadonlySet<string>, themes: ReadonlyArray<Pick<Theme, "label" | "entities">>): (entityId: string, name: string) => boolean {
  const names = new Set(themes.flatMap((t) => [normTitle(t.label), ...t.entities.flatMap((e) => e.names.map(normTitle))]));
  return (entityId, name) => {
    if (ids.has(entityId)) return true;
    const n = normTitle(name);
    if (names.has(n)) return true;
    const padded = ` ${n} `;
    return [...names].some((l) => l.length >= 5 && padded.includes(` ${l} `));
  };
}
