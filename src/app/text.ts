/** Small wording helpers, so a count of one never reads as "1 nights" or "1 locked night stay". */
/** "a rock act", "an indie act", "an R&B act": the right article for a word. */
export const withArticle = (word: string): string => `${/^(?:[aeiou]|r&b)/i.test(word) ? "an" : "a"} ${word}`;

export const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/** The Check screen's headline result, from the cards themselves: how many nights are a weak fit for the town. */
export function checkResultLine(away: number, total: number, city: string, night = "night", nights = "nights"): string {
  if (total === 1) return away === 0 ? `This ${night} isn't a weak fit for ${city}.` : `This ${night} is a weak fit for ${city}.`;
  if (away === 0) return `None of the ${total} ${nights} is a weak fit for ${city}.`;
  return `${away} of ${total} ${nights} ${away === 1 ? "is" : "are"} a weak fit for ${city}.`;
}

export function fitSummary(c: { in: number; average: number; away: number; notScored: number; classic: number; found?: number }): string {
  const found = c.found ? `, ${c.found} local favorite` : "";
  return `${c.in} strong fit, ${c.average} average fit, ${c.away} weak fit, ${c.notScored} no data, ${c.classic} proven promo${found}.`;
}

export function lockedLine(n: number, night = "night"): string {
  return `${n} locked ${plural(n, night)} ${n === 1 ? "stays" : "stay"} exactly as planned`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Today's date in the viewer's own time zone as YYYY-MM-DD (never the UTC date, which can be tomorrow in the evening). */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "October 19, 2026" from a YYYY-MM-DD date. Anything else is returned as given. */
export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : iso;
}

/** What the director's own call earns, said plainly. Keyed by their call and by whether the data showed an effect. */
export function personalLine(call: "Yes" | "No" | "Not sure", verdict: "CONFIRMED" | "CALL STANDS" | "OVERTURNED"): string {
  if (verdict === "CONFIRMED") return call === "Yes" ? "You said Yes. The data agrees." : call === "No" ? "You said No. The data showed an effect, so this one went against you." : "Fair: you weren't sure, and the data did find an effect.";
  if (verdict === "OVERTURNED") return call === "No" ? "You said No. The data agrees, and then some: it pointed the other way." : call === "Yes" ? "You said Yes. The data pointed the other way." : "Fair: you weren't sure, and the data pointed the other way.";
  return call === "Yes" ? "You said Yes. The data didn't back that up." : call === "No" ? "You said No. That matches what we found." : "Fair: the data couldn't tell either.";
}

const NIGHT_SUFFIXES = ["Night", "Day", "Friday", "Giveaway", "Showdown"];

/** The real night name for a swap: the new theme keeps the original's ending. "Barbie Day" with LEGO Movie is "LEGO Movie Day". A concert date is just the act's name. */
export function swapName(original: string, newLabel: string, kind?: "club" | "venue"): string {
  if (kind === "venue") return newLabel;
  const w = original.trim().split(/\s+/);
  const last = w[w.length - 1] ?? "";
  return `${newLabel} ${w.length > 1 && NIGHT_SUFFIXES.includes(last) ? last : "Night"}`;
}

/**
 * A clean title for display. Qloo's book names carry series notes: "Harry Potter and the Sorcerer's Stone (Harry Potter, #1)"
 * becomes "Harry Potter and the Sorcerer's Stone". Only a trailing series parenthetical is removed.
 */
export function cleanTitle(name: string): string {
  let out = name.trim();
  for (;;) {
    const next = out.replace(/\s*\((?:[^()]*#\d+[^()]*|[^()]*\bSeries\b[^()]*|[^()]*\bBook \d+[^()]*)\)\s*$/i, "");
    if (next === out) break;
    out = next;
  }
  return out || name.trim();
}
