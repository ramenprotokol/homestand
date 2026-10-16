import { weekdayName } from "../calendar/csv";
import type { FitLabel } from "../score";
import { step, type TraceStep } from "../trace";
import type { Theme } from "../themes/library";
import { checkCandidate, inWindow, audienceFit, type RejectReason } from "./rules";

export interface PlanNight {
  index: number;
  date: string;
  /** Resolved theme, or null when classic / unknown / not yet chosen. */
  themeId: string | null;
  sponsor: string;
  locked: boolean;
  notes: string;
}

export interface ThemeFit {
  label: FitLabel;
  z: number | null;
  score: number | null;
}

export interface Proposal {
  id: string;
  index: number;
  date: string;
  weekday: string;
  sponsor: string;
  fromThemeId: string;
  toThemeId: string;
  from: ThemeFit;
  to: ThemeFit;
  /** What the checks said about the chosen theme, plain words. */
  checks: string[];
  /** Template reason; the model may replace it (guarded). */
  why: string;
}

export interface SponsorAngle {
  index: number;
  date: string;
  themeId: string;
  sponsor: string;
  toThemeId: string;
  text: string;
}

export interface ProposeResult {
  proposals: Proposal[];
  angles: SponsorAngle[];
  /** Leans-away nights that could not be fixed, with the reason. */
  unfixed: Array<{ index: number; date: string; reason: string }>;
  trace: TraceStep[];
}

export interface ProposeInput {
  nights: PlanNight[];
  library: readonly Theme[];
  fits: Record<string, ThemeFit>;
  allowDuplicates: boolean;
  now: string;
}

export function templateWhy(from: Theme, to: Theme, sponsor: string): string {
  return `${to.label} sits closer to this market's taste than ${from.label}: this market leans toward ${to.label} more than most ballpark markets, and toward ${from.label} less than most. ${sponsor ? "The date and the sponsor stay the same." : "The date stays the same."}`;
}

export function angleText(night: PlanNight, from: Theme, to: Theme): string {
  const who = night.sponsor || "the sponsor";
  return `${from.label} on ${night.date} is locked, so it stays exactly as planned. If ${who} is open to it, a small ${to.label} touch (walk-up songs, PA clips or a photo spot) would sit closer to what this market leans toward.`;
}

/** Ranking and constraints are plain code. Locked nights are filtered out before any candidate is considered. */
export function propose(input: ProposeInput): ProposeResult {
  const { nights, library, fits, allowDuplicates, now } = input;
  const byId = new Map(library.map((t) => [t.id, t]));
  const trace: TraceStep[] = [];
  const proposals: Proposal[] = [];
  const angles: SponsorAngle[] = [];
  const unfixed: ProposeResult["unfixed"] = [];

  const away = nights.filter((n) => n.themeId && fits[n.themeId]?.label === "leans-away");
  trace.push(step(now, "propose", `${away.length} night${away.length === 1 ? "" : "s"} lean away from this market's taste.`));
  const used = new Set(nights.map((n) => n.themeId).filter((x): x is string => x !== null));
  const leaning = library
    .filter((t) => fits[t.id]?.label === "leans-in")
    .sort((a, b) => (fits[b.id]!.z ?? 0) - (fits[a.id]!.z ?? 0) || a.id.localeCompare(b.id));
  trace.push(step(now, "propose", `${leaning.length} library theme${leaning.length === 1 ? "" : "s"} lean in here and can be offered.`));

  // Worst first, so the weakest nights get first pick of the best themes.
  const ordered = [...away].sort((a, b) => (fits[a.themeId!]!.z ?? 0) - (fits[b.themeId!]!.z ?? 0) || a.index - b.index);
  for (const night of ordered) {
    const original = byId.get(night.themeId!)!;
    const slot = { date: night.date, notes: night.notes };
    if (night.locked) {
      trace.push(step(now, "constraint", `${night.date} ${original.label}: locked, so it is never swapped.`));
      const alt = leaning.find((t) => inWindow(night.date, t.window) && audienceFit(original, t, slot) && t.id !== original.id);
      if (alt) angles.push({ index: night.index, date: night.date, themeId: original.id, sponsor: night.sponsor, toThemeId: alt.id, text: angleText(night, original, alt) });
      else unfixed.push({ index: night.index, date: night.date, reason: "Locked, and no sponsor-compatible angle fits this date." });
      continue;
    }
    const rejects: Record<RejectReason, number> = { duplicate: 0, window: 0, audience: 0, "same-theme": 0 };
    let chosen: Theme | null = null;
    let chosenDetail = "";
    for (const cand of leaning) {
      const r = checkCandidate(slot, original, cand, used, allowDuplicates);
      if (r.ok) {
        chosen = cand;
        chosenDetail = r.detail;
        break;
      }
      rejects[r.reason!]++;
    }
    const rejected = Object.entries(rejects).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(", ");
    if (!chosen) {
      unfixed.push({ index: night.index, date: night.date, reason: "No theme that leans in passes the date, audience and no-repeat checks." });
      trace.push(step(now, "constraint", `${night.date} ${original.label}: no candidate passed (${rejected || "none left"}).`));
      continue;
    }
    trace.push(step(now, "constraint", `${night.date} ${original.label} to ${chosen.label}: ${chosenDetail}`, rejected ? `Passed over before it: ${rejected}.` : undefined));
    if (!allowDuplicates) used.add(chosen.id);
    proposals.push({
      id: `${night.date}-${night.index}`,
      index: night.index,
      date: night.date,
      weekday: weekdayName(night.date),
      sponsor: night.sponsor,
      fromThemeId: original.id,
      toThemeId: chosen.id,
      from: fits[original.id]!,
      to: fits[chosen.id]!,
      checks: [
        "Night is not locked.",
        allowDuplicates ? "Repeats are allowed." : `${chosen.label} is not used anywhere else in the season.`,
        chosen.window ? `${chosen.label} is in its date window.` : `${chosen.label} has no date window.`,
        "Audience suits this kind of night.",
        night.sponsor ? `Sponsor (${night.sponsor}) and date stay.` : "Date stays.",
      ],
      why: templateWhy(original, chosen, night.sponsor),
    });
  }
  proposals.sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
  return { proposals, angles, unfixed, trace };
}
