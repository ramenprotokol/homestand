import { weekdayIndex } from "../calendar/csv";
import type { DateWindow, Theme } from "../themes/library";

export interface SlotNight {
  date: string;
  notes: string;
}

export type RejectReason = "duplicate" | "window" | "audience" | "same-theme";

export interface RuleResult {
  ok: boolean;
  reason?: RejectReason;
  /** Plain-words line for the trace. */
  detail: string;
}

const DAY_GAME = /\b(day game|matinee|noon|11\s?am|12\s?pm|1\s?pm|school day|education day|getaway day)\b/i;

/** MM-DD of an ISO date. */
const monthDay = (iso: string): string => iso.slice(5);

export function inWindow(iso: string, window: DateWindow | undefined): boolean {
  if (!window) return true;
  const md = monthDay(iso);
  return window.from <= window.to ? md >= window.from && md <= window.to : md >= window.from || md <= window.to;
}

export const isDayGame = (n: SlotNight): boolean => weekdayIndex(n.date) === 0 || DAY_GAME.test(n.notes);
/** Weekend or day-game: where kids' themes belong. */
export const isFamilySlot = (n: SlotNight): boolean => {
  const wd = weekdayIndex(n.date);
  return wd === 0 || wd === 6 || DAY_GAME.test(n.notes);
};

/**
 * Hard audience rule. A kids or family night is only ever replaced by a kids or family theme (a kids' show for a kids' show).
 * A teen or adult night may take any theme that is not for small children. Kids' themes land on adult nights only at weekend or day games.
 */
export function audienceFit(original: Pick<Theme, "audience">, cand: Pick<Theme, "audience">, night: SlotNight): boolean {
  if (isYoung(original.audience)) {
    if (!isYoung(cand.audience)) return false;
    return cand.audience !== "kids" || original.audience === "kids" || isFamilySlot(night);
  }
  return cand.audience !== "kids" || isFamilySlot(night);
}

/** For a sponsor touch on a locked night the two themes should sit in the same band: young (kids and family), teen, or adult. */
export const audienceBand = (a: Theme["audience"]): "young" | "teen" | "adult" => (isYoung(a) ? "young" : a === "teen" ? "teen" : "adult");

/** Kids and family themes are the ones a kids' night may use. Teen and adult themes (Star Trek, wrestling, Taylor Swift) are not. */
export const isYoung = (a: Theme["audience"]): boolean => a === "kids" || a === "family";

/** The three hard rules for putting `cand` on `night` in place of `original`. Locks are checked by the caller, before any candidate is looked at. */
export function checkCandidate(
  night: SlotNight,
  original: Theme,
  cand: Theme,
  usedThemeIds: ReadonlySet<string>,
  allowDuplicates: boolean,
): RuleResult {
  if (cand.id === original.id) return { ok: false, reason: "same-theme", detail: `${cand.label} is the theme already planned.` };
  if (!allowDuplicates && usedThemeIds.has(cand.id)) return { ok: false, reason: "duplicate", detail: `${cand.label} is already used elsewhere in the season.` };
  if (!inWindow(night.date, cand.window)) return { ok: false, reason: "window", detail: `${cand.label} only fits its own dates, and ${night.date} is outside them.` };
  if (!audienceFit(original, cand, night)) return { ok: false, reason: "audience", detail: `${cand.label} is a ${cand.audience} theme and does not suit this kind of night.` };
  return { ok: true, detail: `${cand.label} passes: not a repeat, in its date window, right audience for this night.` };
}
