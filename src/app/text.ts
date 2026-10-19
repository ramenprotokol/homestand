/** Small wording helpers, so a count of one never reads as "1 nights" or "1 locked night stay". */
export const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/** "leans" for one, "lean" for the rest: "1 leans in", "7 lean in". */
export const leanVerb = (n: number): string => (n === 1 ? "leans" : "lean");

/** The Check screen's headline result, from the cards themselves. */
export function checkResultLine(away: number, total: number, city: string): string {
  if (total === 1) return away === 0 ? `This night doesn't lean away from what ${city} likes.` : `This night leans away from what ${city} likes.`;
  if (away === 0) return `None of the ${total} nights lean away from what ${city} likes.`;
  return `${away} of ${total} nights ${leanVerb(away)} away from what ${city} likes.`;
}

export function fitSummary(c: { in: number; average: number; away: number; notScored: number; classic: number; found?: number }): string {
  const found = c.found ? `, ${c.found} found by Qloo` : "";
  return `${c.in} ${leanVerb(c.in)} in, ${c.average} about average, ${c.away} ${leanVerb(c.away)} away, ${c.notScored} not scored, ${c.classic} classic${found}.`;
}

export function lockedLine(n: number): string {
  return `${n} locked ${plural(n, "night")} ${n === 1 ? "stays" : "stay"} exactly as planned`;
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
  return call === "Yes" ? "You said Yes. The data didn't show it at this sample size." : call === "No" ? "You said No. That matches what we found." : "Fair: the data couldn't tell either.";
}

const NIGHT_SUFFIXES = ["Night", "Day", "Friday", "Giveaway", "Showdown"];

/** The real night name for a swap: the new theme keeps the original's ending. "Barbie Day" with LEGO Movie is "LEGO Movie Day". */
export function swapName(original: string, newLabel: string): string {
  const w = original.trim().split(/\s+/);
  const last = w[w.length - 1] ?? "";
  return `${newLabel} ${w.length > 1 && NIGHT_SUFFIXES.includes(last) ? last : "Night"}`;
}
