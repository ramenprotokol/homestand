import { weekdayName } from "../calendar/csv";
import { copyFor } from "../kind";
import { shortDate } from "../dates";
import { labelForZ, type FitLabel } from "../score";
import { step, type TraceStep } from "../trace";
import { GENRE_WORDS, type Genre, type Theme } from "../themes/library";
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
  type: "movie" | "tv_show" | "artist";
  /** Acts only: the genre we declared for the artist. */
  genre?: Genre;
  affinity: number | null;
  /** How far this title's reading here sits above or below its spread over the 40 reference markets. */
  z?: number | null;
  /** National popularity of the title, 0 to 1. */
  popularity?: number;
}

export const discoveredId = (d: Pick<Discovered, "entityId">): string => `qloo:${d.entityId}`;
export const isDiscoveredId = (id: string): boolean => id.startsWith("qloo:");

/** "movies" or "shows", for the reason text. */
export const kindWords = (t: Discovered["type"]): string => (t === "movie" ? "movies" : t === "artist" ? "acts" : "shows");

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
  /** "best-option": nothing in this night's audience leans in here, so this is the strongest of its audience, about the town's usual. */
  kind?: "best-option";
}

/** A best-option swap must beat the planned night by at least a full band (the Leans in and Leans away cut-offs are 1.0 apart). */
export const BEST_OPTION_GAIN = 1.0;

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
  /** Venue runs: the support act the taste graph picked, and whether it is a discovered act rather than a library theme. */
  act?: { name: string; discovered: boolean };
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
  /** Well-known family titles Qloo found here (z at or above typical). Those that stand out are offered to a kids or family night nothing else can fix; the rest can be its best option. */
  discovered?: readonly Discovered[];
  /** The market's city, for the reason text. */
  city?: string;
  /** A concert venue run: swaps stay in the same genre first, every locked headliner gets a support-act idea, and discovered acts can fill a date. */
  venue?: boolean;
  /** Venue runs: acts that stand out near the venue and are nationally well known, best first. */
  acts?: readonly Discovered[];
}

/** Genres that sit close together: a rock night is better replaced by indie or jam than by hip-hop. Country stands alone. */
const GENRE_FAMILY: Record<Genre, "rock" | "pop" | "country"> = {
  rock: "rock", "classic-rock": "rock", jam: "rock", indie: "rock", emo: "rock", "yacht-rock": "rock", pop: "pop", "r&b": "pop", "hip-hop": "pop", latin: "pop", country: "country",
};

/** 0 = the same genre, 1 = a related genre (same family), 2 = anything else. */
export function genreTier(original: Genre | undefined, cand: Genre | undefined): 0 | 1 | 2 {
  if (!original || !cand) return 2;
  if (original === cand) return 0;
  return GENRE_FAMILY[original] === GENRE_FAMILY[cand] ? 1 : 2;
}

const TIER_WORDS = ["same genre", "related genre", "another genre"] as const;

/** Venue ranking: same genre first, then a related genre, then anything; inside that, same audience. Lower is better. */
export const genreRank = (original: Pick<Theme, "genre" | "audience">, cand: Pick<Theme, "genre" | "audience">): number => genreTier(original.genre, cand.genre) * 2 + (cand.audience === original.audience ? 0 : 1);

/** In a venue run only an act can fill a date: a solo artist, or a tribute night for a tribute date. Never a genre bundle such as "Country music", never an act that no longer tours. */
export const venueEligible = (original: Pick<Theme, "tribute">, cand: Pick<Theme, "entities" | "touring" | "tribute">): boolean =>
  cand.touring !== false && (cand.entities.length === 1 || (cand.tribute === true && original.tribute === true));

export function venueAngleText(night: Pick<PlanNight, "date" | "sponsor">, from: Theme): string {
  const who = night.sponsor || "the sponsor";
  return `${from.label} on ${shortDate(night.date)} is locked, so it stays exactly as planned. A sponsor-friendly angle: give ${who} a featured moment on the night (a stage-side read, a pre-show video or a giveaway tied to ${from.label}).`;
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
  const venue = input.venue === true;
  const W = copyFor(venue ? "venue" : "club");
  const city = input.city ?? `this ${W.place}`;
  const actPool: Discovered[] = venue ? [...(input.acts ?? [])].sort((x, y) => (y.z ?? 0) - (x.z ?? 0) || x.name.localeCompare(y.name)) : [];

  const away = nights.filter((n) => n.themeId && fits[n.themeId]?.label === "leans-away");
  trace.push(step(now, "propose", `${away.length} ${away.length === 1 ? W.night : W.nights} lean${away.length === 1 ? "s" : ""} away from this market's taste.`));
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
      if (venue) continue; // a venue run gives every locked headliner a support-act idea, below
      // A cross-theme touch only when it is the same kind of theme (music with music, film with film) and fits the night; otherwise a generic angle.
      const alt = leaning.find((t) => inWindow(night.date, t.window) && audienceFit(original, t, slot) && t.id !== original.id && categoryGroup(t.category) === categoryGroup(original.category) && audienceBand(t.audience) === audienceBand(original.audience));
      angles.push({ index: night.index, date: night.date, themeId: original.id, sponsor: night.sponsor, toThemeId: alt?.id ?? original.id, text: angleText(night, original, alt ?? null) });
      continue;
    }
    const rejects: Record<RejectReason, number> = { duplicate: 0, window: 0, audience: 0, "same-theme": 0 };
    const passing: Array<{ theme: Theme; detail: string }> = [];
    for (const cand of leaning) {
      if (venue && !venueEligible(original, cand)) continue;
      const r = checkCandidate(slot, original, cand, used, allowDuplicates);
      if (r.ok) passing.push({ theme: cand, detail: r.detail });
      else rejects[r.reason!]++;
    }
    // Like for like first, then by how strongly the market leans in. `leaning` is already sorted by z, and sort is stable.
    // A venue run ranks by genre first (same genre, then same audience), then by how strongly the market leans in.
    const rejected = Object.entries(rejects).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${REJECT_WORDS[k as RejectReason]}`).join(", ");
    const rank = (t: Theme): number => (venue ? genreRank(original, t) : likeness(original, t));
    passing.sort((x, y) => rank(x.theme) - rank(y.theme));
    // A venue run never crosses into another genre family: only the same genre or a related one.
    if (venue) passing.splice(0, passing.length, ...passing.filter((x) => genreTier(original.genre, x.theme.genre) <= 1));
    if (venue) {
      // A discovered act competes at its genre tier (same genre, then a related genre, then anything). A library theme wins a tie.
      const libTier = passing.length > 0 ? Math.min(...passing.map((x) => genreTier(original.genre, x.theme.genre))) : 3;
      let pick = -1;
      let actTier = 3;
      actPool.forEach((x, i) => {
        const t = genreTier(original.genre, x.genre);
        if (t < actTier) {
          actTier = t;
          pick = i;
        }
      });
      if (pick >= 0 && actTier <= 1 && actTier < libTier) {
        const found = actPool.splice(pick, 1)[0]!;
        trace.push(step(now, "constraint", `${night.date} ${original.label}: ${libTier === 3 ? "no library theme passed" : "no library theme in a genre that close leans in and fits"}, so an act of ${actTier === 0 ? "the same genre" : actTier === 1 ? "a related genre" : "another genre"} that stands out near ${city} is offered: ${found.name}.`, `Found by Qloo, not scored against the library.${rejected ? ` Library themes ruled out: ${rejected}.` : ""}`));
        proposals.push({
          id: `${night.date}-${night.index}`, index: night.index, date: night.date, weekday: weekdayName(night.date), sponsor: night.sponsor,
          fromThemeId: original.id, toThemeId: discoveredId(found), alternates: [], from: fits[original.id]!, to: { label: "found", z: null, score: null },
          checks: [
            "Date is not locked.",
            actTier === 0 ? `A ${GENRE_WORDS[found.genre!]} act, the same genre as the planned date.` : actTier === 1 ? `A ${GENRE_WORDS[found.genre!]} act, a related genre to the planned ${original.genre ? GENRE_WORDS[original.genre] : ""} date.`.replace("planned  date", "planned date") : "A touring act people near the venue know.",
            "Not used anywhere else in the summer series.",
            night.sponsor ? `Sponsor (${night.sponsor}) and date stay.` : "Date stays.",
          ],
          why: `${found.name} stands out near ${city}: fans here like them more than at most of the 40 reference markets we compare against. ${night.sponsor ? "The date and the sponsor stay the same." : "The date stays the same."}`,
          discovered: found,
        });
        continue;
      }
    }
    const chosen = passing[0]?.theme ?? null;
    const chosenDetail = passing[0]?.detail ?? "";
    const standing = !chosen && isYoung(original.audience) ? pool.findIndex((x) => labelForZ(x.z ?? -9) === "leans-in") : -1;
    if (!chosen && isYoung(original.audience) && standing >= 0) {
      const found = pool.splice(standing, 1)[0]!;
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
    // Nothing in this audience leans in. A promotions director runs the kids theme the town likes most, if it is not itself a weak one
    // and clearly beats the planned night. Library themes first, then a well-known discovered title that is at least typical here.
    if (!chosen && isYoung(original.audience)) {
      const originalZ = fits[original.id]?.z ?? 0;
      const best = library
        .filter((t) => t.id !== original.id && fits[t.id]?.label === "average" && (fits[t.id]!.z ?? -9) - originalZ >= BEST_OPTION_GAIN && inWindow(night.date, t.window) && audienceFit(original, t, slot) && (allowDuplicates || !used.has(t.id)))
        .sort((a, b) => (fits[b.id]!.z ?? 0) - (fits[a.id]!.z ?? 0) || a.id.localeCompare(b.id))[0];
      const kind = original.audience === "kids" ? "kids" : "family";
      const common = { id: `${night.date}-${night.index}`, index: night.index, date: night.date, weekday: weekdayName(night.date), sponsor: night.sponsor, fromThemeId: original.id, alternates: [] as Alternate[], from: fits[original.id]!, kind: "best-option" as const };
      const checks = [
        "Night is not locked.",
        "Not used anywhere else in the season.",
        "Inside its date window, if it has one.",
        `Same audience: a ${kind} night stays a ${kind === "kids" ? "kids or family" : "kids or family"} night.`,
        "It is not a weak theme here and it clearly beats the planned night.",
        night.sponsor ? `Sponsor (${night.sponsor}) and date stay.` : "Date stays.",
      ];
      if (best) {
        if (!allowDuplicates) used.add(best.id);
        trace.push(step(now, "constraint", `${night.date} ${original.label}: nothing in this audience leans in here, so the best option for it is offered: ${best.label}.`, `About this town's usual, and ahead of ${original.label} by at least ${BEST_OPTION_GAIN.toFixed(1)}.`));
        proposals.push({
          ...common, toThemeId: best.id, to: fits[best.id]!, checks,
          why: `${best.label} is the strongest ${kind} choice here: about this town's usual, where ${original.label} sits well below it. ${night.sponsor ? "The date and the sponsor stay the same." : "The date stays the same."}`,
        });
        continue;
      }
      const decentIdx = originalZ <= -1 ? pool.findIndex((x) => (x.z ?? -9) >= 0) : -1;
      if (decentIdx >= 0) {
        const found = pool.splice(decentIdx, 1)[0]!;
        trace.push(step(now, "constraint", `${night.date} ${original.label}: nothing in this audience leans in here, so a well-known family ${found.type === "movie" ? "movie" : "show"} that holds up near the ballpark is offered as its best option: ${found.name}.`, "Found by Qloo, not scored against the library."));
        proposals.push({
          ...common, toThemeId: discoveredId(found), to: { label: "found", z: null, score: null }, discovered: found,
          checks: checks.map((c) => (c.startsWith("Same audience") ? "A well-known family title, so it suits a kids or family night." : c)),
          why: `Nothing in this audience leans in near ${city}, so ${found.name} is offered as a well-known family title that is at least typical here.`,
        });
        continue;
      }
    }
    if (!chosen) {
      const young = isYoung(original.audience);
      unfixed.push({ index: night.index, date: night.date, reason: venue ? `No ${original.genre ? `${GENRE_WORDS[original.genre]} ` : ""}act, or act in a related genre, leans in here that fits this date.` : young ? "No family theme leans in here that fits this date." : "No theme that leans in passes the date, audience and no-repeat checks." });
      trace.push(step(now, "constraint", `${night.date} ${original.label}: no candidate passed (${rejected || "none left"}).`));
      continue;
    }
    const tier = venue
      ? TIER_WORDS[genreTier(original.genre, chosen.genre)]
      : ["same kind of theme", "same audience", "another theme that fits the night"][likeness(original, chosen)]!;
    trace.push(step(now, "constraint", `${night.date} ${original.label} to ${chosen.label}: ${chosenDetail}`, `Ranked by ${venue ? "same genre, then a related genre" : "same kind of theme"} first, then same audience, then local lean (this one: ${tier}).${rejected ? ` Other themes ruled out: ${rejected}.` : ""}`));
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
  if (venue) {
    // Every locked headliner stays as signed and gets a support-act idea (the taste graph sharpens it when Qloo answers).
    for (const night of nights) {
      const fit = night.themeId ? fits[night.themeId] : undefined;
      const original = night.locked && night.themeId ? byId.get(night.themeId) : undefined;
      if (!original || !fit || fit.label === "not-scored") continue;
      angles.push({ index: night.index, date: night.date, themeId: original.id, sponsor: night.sponsor, toThemeId: original.id, text: venueAngleText(night, original) });
      if (!away.some((a) => a.index === night.index)) trace.push(step(now, "constraint", `${night.date} ${original.label}: locked, so it is never swapped; a support act is suggested instead.`));
    }
    angles.sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
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
