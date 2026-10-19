import { weekdayName } from "../calendar/csv";
import { shortDate } from "../dates";
import type { FitLabel } from "../score";
import { step, type TraceStep } from "../trace";
import type { Theme } from "../themes/library";
import { audienceBand, checkCandidate, inWindow, audienceFit, isYoung, type RejectReason } from "./rules";

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

/** A title Qloo's local family ranking found. Only these four fields are kept from the response. */
export interface Discovered {
  name: string;
  entityId: string;
  type: "movie" | "tv_show";
  affinity: number | null;
  /** How far this title's reading here sits above or below its spread over the 40 reference markets. */
  z?: number | null;
}

export const discoveredId = (d: Pick<Discovered, "entityId">): string => `qloo:${d.entityId}`;
export const isDiscoveredId = (id: string): boolean => id.startsWith("qloo:");

/** "movies" or "shows", for the reason text. */
export const kindWords = (t: Discovered["type"]): string => (t === "movie" ? "movies" : "shows");

export interface Proposal {
  id: string;
  index: number;
  date: string;
  weekday: string;
  sponsor: string;
  fromThemeId: string;
  toThemeId: string;
  /** Up to two more themes that pass every check, in rank order. The director may switch to one before approving. */
  alternates: Alternate[];
  from: ThemeFit;
  to: ThemeFit;
  /** What the checks said about the chosen theme, plain words. */
  checks: string[];
  /** Template reason; the model may replace it (guarded). */
  why: string;
  /** Set when the replacement is a title Qloo found, not a library theme. `to` then has label "found" and no number. */
  discovered?: Discovered;
}

export interface Alternate {
  toThemeId: string;
  to: ThemeFit;
}

export const MAX_ALTERNATES = 2;

/** Like for like first: same category (kids TV for kids TV), then same audience, then anything. */
export function likeness(original: Pick<Theme, "category" | "audience">, cand: Pick<Theme, "category" | "audience">): 0 | 1 | 2 {
  if (cand.category === original.category) return 0;
  if (cand.audience === original.audience) return 1;
  return 2;
}

/** Film, TV and kids' TV franchises count as one kind for a sponsor touch; music, sports, games and holidays each stand alone. */
export function categoryGroup(c: Theme["category"]): string {
  return c === "film" || c === "tv" || c === "kids tv" ? "screen" : c;
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
  /** Qloo's local family titles, already stripped of library themes. Offered to a kids or family night nothing else can fix. */
  discovered?: readonly Discovered[];
  /** The market's city, for the reason text. */
  city?: string;
}

export function templateWhy(from: Theme, to: Theme, sponsor: string): string {
  return `${to.label} fits this market better than ${from.label}: measured against this market's own average, ${to.label} stands out above it and ${from.label} stands out below it. ${sponsor ? "The date and the sponsor stay the same." : "The date stays the same."}`;
}

export function angleText(night: PlanNight, from: Theme, to: Theme | null): string {
  const who = night.sponsor || "the sponsor";
  if (!to) return `${from.label} on ${shortDate(night.date)} is locked, so it stays exactly as planned. A sponsor-friendly angle: give ${who} a featured moment on the night (a PA read, the first pitch or a giveaway tied to ${from.label}).`;
  return `${from.label} on ${shortDate(night.date)} is locked, so it stays exactly as planned. If ${who} is open to it, a small ${to.label} touch (walk-up songs, PA clips or a photo spot) would sit closer to what this market leans toward.`;
}

const REJECT_WORDS: Record<RejectReason, string> = { duplicate: "already used in the season", window: "outside its date window", audience: "wrong audience for this night", "same-theme": "the planned theme" };

/** Ranking and constraints are plain code. Locked nights are filtered out before any candidate is considered. */
export function propose(input: ProposeInput): ProposeResult {
  const { nights, library, fits, allowDuplicates, now } = input;
  const byId = new Map(library.map((t) => [t.id, t]));
  const trace: TraceStep[] = [];
  const proposals: Proposal[] = [];
  const angles: SponsorAngle[] = [];
  const unfixed: ProposeResult["unfixed"] = [];
  const ranked = new Map<string, string[]>();
  // The titles that stand out most here go first.
  const pool: Discovered[] = [...(input.discovered ?? [])].sort((x, y) => (y.z ?? 0) - (x.z ?? 0) || x.name.localeCompare(y.name));
  const city = input.city ?? "this ballpark";

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
      // A cross-theme touch only when it is the same kind of theme (music with music, film with film) and fits the night; otherwise a generic angle.
      const alt = leaning.find((t) => inWindow(night.date, t.window) && audienceFit(original, t, slot) && t.id !== original.id && categoryGroup(t.category) === categoryGroup(original.category) && audienceBand(t.audience) === audienceBand(original.audience));
      angles.push({ index: night.index, date: night.date, themeId: original.id, sponsor: night.sponsor, toThemeId: alt?.id ?? original.id, text: angleText(night, original, alt ?? null) });
      continue;
    }
    const rejects: Record<RejectReason, number> = { duplicate: 0, window: 0, audience: 0, "same-theme": 0 };
    const passing: Array<{ theme: Theme; detail: string }> = [];
    for (const cand of leaning) {
      const r = checkCandidate(slot, original, cand, used, allowDuplicates);
      if (r.ok) passing.push({ theme: cand, detail: r.detail });
      else rejects[r.reason!]++;
    }
    // Like for like first, then by how strongly the market leans in. `leaning` is already sorted by z, and sort is stable.
    passing.sort((x, y) => likeness(original, x.theme) - likeness(original, y.theme));
    const chosen = passing[0]?.theme ?? null;
    const chosenDetail = passing[0]?.detail ?? "";
    const rejected = Object.entries(rejects).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${REJECT_WORDS[k as RejectReason]}`).join(", ");
    if (!chosen && isYoung(original.audience) && pool.length > 0) {
      const found = pool.shift()!;
      const toId = discoveredId(found);
      trace.push(step(now, "constraint", `${night.date} ${original.label}: no library theme passed, so a family ${found.type === "movie" ? "movie" : "show"} that stands out near the ballpark is offered: ${found.name}.`, `Found by Qloo, not scored against the library.${rejected ? ` Library themes ruled out: ${rejected}.` : ""}`));
      proposals.push({
        id: `${night.date}-${night.index}`, index: night.index, date: night.date, weekday: weekdayName(night.date), sponsor: night.sponsor,
        fromThemeId: original.id, toThemeId: toId, alternates: [], from: fits[original.id]!, to: { label: "found", z: null, score: null },
        checks: [
          "Night is not locked.",
          "A family title, so it suits a kids or family night.",
          "Not used anywhere else in the season.",
          night.sponsor ? `Sponsor (${night.sponsor}) and date stay.` : "Date stays.",
        ],
        why: `${found.name} stands out near ${city}: fans here like it more than at most of the 40 ballpark markets we compare against.`,
        discovered: found,
      });
      continue;
    }
    if (!chosen) {
      const young = isYoung(original.audience);
      unfixed.push({ index: night.index, date: night.date, reason: young ? "No family theme leans in here that fits this date." : "No theme that leans in passes the date, audience and no-repeat checks." });
      trace.push(step(now, "constraint", `${night.date} ${original.label}: no candidate passed (${rejected || "none left"}).`));
      continue;
    }
    const tier = ["same kind of theme", "same audience", "another theme that fits the night"][likeness(original, chosen)]!;
    trace.push(step(now, "constraint", `${night.date} ${original.label} to ${chosen.label}: ${chosenDetail}`, `Ranked by same kind of theme first, then same audience, then local lean (this one: ${tier}).${rejected ? ` Other themes ruled out: ${rejected}.` : ""}`));
    ranked.set(`${night.date}-${night.index}`, passing.slice(1).map((x) => x.theme.id));
    if (!allowDuplicates) used.add(chosen.id);
    proposals.push({
      id: `${night.date}-${night.index}`,
      index: night.index,
      date: night.date,
      weekday: weekdayName(night.date),
      sponsor: night.sponsor,
      fromThemeId: original.id,
      toThemeId: chosen.id,
      alternates: [],
      from: fits[original.id]!,
      to: fits[chosen.id]!,
      checks: [
        "Night is not locked.",
        allowDuplicates ? "Repeats are allowed." : "Not used anywhere else in the season.",
        "Inside its date window, if it has one.",
        "Audience suits this kind of night.",
        night.sponsor ? `Sponsor (${night.sponsor}) and date stay.` : "Date stays.",
      ],
      why: templateWhy(original, chosen, night.sponsor),
    });
  }
  // Alternates: the next best that passed, minus any theme another proposal took as its top pick.
  const tops = new Set(proposals.map((p) => p.toThemeId));
  for (const p of proposals) {
    p.alternates = (ranked.get(p.id) ?? [])
      .filter((id) => allowDuplicates || !tops.has(id))
      .slice(0, MAX_ALTERNATES)
      .map((id) => ({ toThemeId: id, to: fits[id]! }));
  }
  proposals.sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
  return { proposals, angles, unfixed, trace };
}
