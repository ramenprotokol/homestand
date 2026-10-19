import type { Theme } from "../themes/library";
import { hasPhrase, isClassicNight, normalizeText } from "./classic";

export type Resolution =
  | { kind: "theme"; themeId: string; method: "alias" | "model" | "choice" }
  | { kind: "classic" }
  /** A night named after a family-title pool entry: scored from that title's own reading, never swapped. */
  | { kind: "pool"; entityId: string; name: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "unknown" };

interface Hit {
  themeId: string;
  start: number;
  end: number;
}

/** Every alias occurrence in the text; where two overlap, the longer one wins (so "star wars" beats a stray "star"). */
function aliasHits(normalised: string, library: readonly Pick<Theme, "id" | "aliases">[]): Hit[] {
  const padded = ` ${normalised} `;
  const hits: Hit[] = [];
  for (const t of library) {
    for (const alias of t.aliases) {
      const a = ` ${normalizeText(alias)} `;
      let from = 0;
      for (;;) {
        const at = padded.indexOf(a, from);
        if (at < 0) break;
        hits.push({ themeId: t.id, start: at, end: at + a.length });
        from = at + 1;
      }
    }
  }
  hits.sort((x, y) => y.end - y.start - (x.end - x.start));
  const kept: Hit[] = [];
  for (const h of hits) if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  return kept;
}

/**
 * Alias table first. A pop-culture match wins over a classic keyword ("Star Wars Fireworks Night" is a Star Wars night).
 * Two different themes in one text are never forced: the director is asked. No match and no classic keyword is "unknown",
 * which the Worker may hand to the model before giving up.
 */
export function resolveTheme(text: string, library: readonly Pick<Theme, "id" | "aliases">[], extraClassic: readonly string[] = []): Resolution {
  const hits = aliasHits(normalizeText(text), library);
  const ids = [...new Set(hits.map((h) => h.themeId))];
  if (ids.length === 1) return { kind: "theme", themeId: ids[0]!, method: "alias" };
  if (ids.length > 1) return { kind: "ambiguous", candidates: ids };
  if (isClassicNight(text, extraClassic)) return { kind: "classic" };
  return { kind: "unknown" };
}

export { hasPhrase };
