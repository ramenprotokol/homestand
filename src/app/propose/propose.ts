import { weekdayName } from "../calendar/csv";
import { copyFor } from "../kind";
import { withArticle } from "../text";
import { shortDate } from "../dates";
import { labelForZ, type FitLabel } from "../score";
import { step, type TraceStep } from "../trace";
import { GENRE_WORDS, TIER_RANK, type Genre, type Theme, type Tier } from "../themes/library";
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
  /** Acts only: our declared booking tier. */
  tier?: Tier;
  affinity: number | null;
  /** How far this title's reading here sits above or below its spread over the 40 reference markets, centred on this market's own average over the pool. */
  z?: number | null;
  /** The same z before centring (against the 40 markets only). */
  zRaw?: number | null;
  /** National popularity of the title, 0 to 1. */
  popularity?: number;
  /** A big theatrical title any family knows (declared by us). */
  major?: boolean;
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
  /** "best-option": nothing in this night's audience is a strong fit here, so this is the strongest of its audience, an average fit. */
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

/** One candidate for a locked night's add-on or support act, with its finished sentence. The client picks the first one not already used as a swap. */
export interface AngleOption {
  toThemeId: string;
  text: string;
  act?: { name: string; discovered: boolean };
}

/** The angle as it should read now: the first option that is not already a proposed or approved swap, else the generic wording. */
export function pickAngle(angle: SponsorAngle, taken: ReadonlySet<string>): SponsorAngle {
  if (!angle.options || angle.options.length === 0) return angle;
  const hit = angle.options.find((o) => !taken.has(o.toThemeId));
  const { act: _drop, ...rest } = angle;
  void _drop;
  return hit ? { ...rest, toThemeId: hit.toThemeId, text: hit.text, ...(hit.act ? { act: hit.act } : {}) } : { ...rest, toThemeId: angle.themeId, text: angle.generic ?? angle.text };
}

/** All the locked nights' ideas at once: none repeats a swap, and no two locked nights get the same add-on or support act (first night first). */
export function pickAngles(angles: readonly SponsorAngle[], taken: ReadonlySet<string>): SponsorAngle[] {
  const used = new Set(taken);
  return angles.map((a) => {
    const picked = pickAngle(a, used);
    if (picked.toThemeId !== picked.themeId) used.add(picked.toThemeId);
    return picked;
  });
}

/**
 * A club swap must keep either the kind of night (film, TV and kids' TV count as one kind; music, games, sports entertainment and holidays each stand alone)
 * or its audience (kids and family count as one band; teen and adult each stand alone). Pro wrestling (teen) can become a teen theme, never adult music.
 */
export const keepsKindOrAudience = (original: Pick<Theme, "category" | "audience">, cand: Pick<Theme, "category" | "audience">): boolean =>
  categoryGroup(original.category) === categoryGroup(cand.category) || audienceBand(original.audience) === audienceBand(cand.audience);

export interface SponsorAngle {
  /** The ranked candidates (best first) the taste graph returned, each with its finished sentence. */
  options?: AngleOption[];
  /** The wording when every option is taken by a swap. */
  generic?: string;
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
/** Within one booking tier of each other (when both tiers are declared). */
export const withinOneTier = (a: Tier | undefined, b: Tier | undefined): boolean => a === undefined || b === undefined || Math.abs(TIER_RANK[a] - TIER_RANK[b]) <= 1;

export const venueEligible = (original: Pick<Theme, "tribute" | "tier">, cand: Pick<Theme, "entities" | "touring" | "tribute" | "tier">): boolean =>
  cand.touring !== false && withinOneTier(original.tier, cand.tier) && (cand.entities.length === 1 || (cand.tribute === true && original.tribute === true));

export function venueAngleText(night: Pick<PlanNight, "date" | "sponsor">, from: Theme): string {
  const who = night.sponsor || "the sponsor";
  return `${from.label} on ${shortDate(night.date)} is locked, so it stays exactly as planned. A sponsor idea: give ${who} a featured moment on the night (a stage-side read, a pre-show video or a giveaway tied to ${from.label}).`;
}

/** The plain reason for a swap between two of our themes. `town` is the city ("Biloxi"); without it the sentence says "this town". */
export function templateWhy(from: Theme, to: Theme, sponsor: string, town = "this town"): string {
  return `People in ${town} like ${to.label} more than ${from.label}, compared with their other themes. ${sponsor ? "The date and the sponsor stay the same." : "The date stays the same."}`;
}

export function angleText(night: PlanNight, from: Theme, to: Theme | null): string {
  const who = night.sponsor || "the sponsor";
  if (!to) return `${from.label} on ${shortDate(night.date)} is locked, so it stays exactly as planned. A sponsor idea: give ${who} a featured moment on the night (a PA read, the first pitch or a giveaway tied to ${from.label}).`;
  return `${from.label} on ${shortDate(night.date)} is locked, so it stays exactly as planned. If ${who} is open to it, a small ${to.label} touch (walk-up songs, PA clips or a photo spot) would be a better fit for this town.`;
}

/** Minimum-cost assignment (Hungarian method) for a matrix with at least as many columns as rows: the column chosen for each row. */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const m = cost[0]?.length ?? 0;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else minv[j] = minv[j]! - delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }
  const out = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]! > 0) out[p[j]! - 1] = j - 1;
  return out;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

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
  trace.push(step(now, "propose", `${away.length} ${away.length === 1 ? `${W.night} is` : `${W.nights} are`} a weak fit for this ${W.place}.`));
  const used = new Set(nights.map((n) => n.themeId).filter((x): x is string => x !== null));
  const leaning = library
    .filter((t) => fits[t.id]?.label === "leans-in")
    .sort((a, b) => (fits[b.id]!.z ?? 0) - (fits[a.id]!.z ?? 0) || a.id.localeCompare(b.id));
  trace.push(step(now, "propose", `${leaning.length} theme${leaning.length === 1 ? "" : "s"} from our list ${leaning.length === 1 ? "is" : "are"} a strong fit here and can be offered.`));

  // Worst first, so the weakest nights are handled first (the order the trace and the pack read in).
  const ordered = [...away].sort((a, b) => (fits[a.themeId!]!.z ?? 0) - (fits[b.themeId!]!.z ?? 0) || a.index - b.index);

  /** Rank of a candidate for a night: lower is better. A music night (club or venue) prefers the same genre, then a related one. */
  const rankOf = (original: Theme, cand: Theme): number => {
    if (venue) return genreRank(original, cand);
    if (original.category === "music" && original.genre) return (cand.category === "music" ? genreTier(original.genre, cand.genre) : 3) * 2 + (cand.audience === original.audience ? 0 : 1);
    return likeness(original, cand);
  };

  interface Gathered {
    passing: Array<{ theme: Theme; detail: string }>;
    rejected: string;
  }
  /** Every library theme that passes the rules for one night, best first. Uses the themes on the calendar as "used", so all nights see the same pool. */
  const gather = (night: PlanNight, original: Theme): Gathered => {
    const slot = { date: night.date, notes: night.notes };
    const rejects: Record<RejectReason, number> = { duplicate: 0, window: 0, audience: 0, "same-theme": 0 };
    const passing: Gathered["passing"] = [];
    for (const cand of leaning) {
      if (venue && !venueEligible(original, cand)) continue;
      const r = checkCandidate(slot, original, cand, used, allowDuplicates);
      if (r.ok && !venue && !keepsKindOrAudience(original, cand)) rejects.audience++;
      else if (r.ok) passing.push({ theme: cand, detail: r.detail });
      else rejects[r.reason!]++;
    }
    const rejected = Object.entries(rejects).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${REJECT_WORDS[k as RejectReason]}`).join(", ");
    // `leaning` is already sorted by z, and sort is stable: best rank first, then how strongly the market leans in.
    passing.sort((x, y) => rankOf(original, x.theme) - rankOf(original, y.theme));
    // A venue run never crosses into another genre family: only the same genre or a related one.
    if (venue) passing.splice(0, passing.length, ...passing.filter((x) => genreTier(original.genre, x.theme.genre) <= 1));
    return { passing, rejected };
  };

  // Assign swaps jointly, not first come first served: the set of swaps with the best total fit wins, so a night that has one good
  // candidate is not robbed of it by a night that could do almost as well with another.
  type Pick = { kind: "theme"; theme: Theme; detail: string } | { kind: "act"; idx: number; tier: number };
  const gathered = new Map<number, Gathered>();
  const unlocked = ordered.filter((n) => !n.locked);
  for (const n of unlocked) gathered.set(n.index, gather(n, byId.get(n.themeId!)!));
  const assigned = new Map<number, Pick>();
  if (!allowDuplicates) {
    const colKeys: string[] = [];
    const colOf = (k: string): number => {
      const at = colKeys.indexOf(k);
      if (at >= 0) return at;
      colKeys.push(k);
      return colKeys.length - 1;
    };
    const entries = unlocked.map((n) => {
      const original = byId.get(n.themeId!)!;
      const g = gathered.get(n.index)!;
      const list: Array<{ col: number; cost: number; pick: Pick }> = g.passing.map((x) => ({ col: colOf(`t:${x.theme.id}`), cost: rankOf(original, x.theme) * 100 - (fits[x.theme.id]!.z ?? 0) * 10, pick: { kind: "theme", theme: x.theme, detail: x.detail } }));
      if (venue) actPool.forEach((a, i) => { const t = genreTier(original.genre, a.genre); if (t <= 1 && withinOneTier(original.tier, a.tier)) list.push({ col: colOf(`a:${i}`), cost: t * 200 + 50 - (a.z ?? 0) * 10, pick: { kind: "act", idx: i, tier: t } }); });
      return list;
    });
    const rows = entries.length;
    if (rows > 0 && colKeys.length > 0) {
      const cols = colKeys.length + rows; // one "no swap" column per night
      const NONE = 100000;
      const cost = entries.map((list, i) => Array.from({ length: cols }, (_, j) => (j >= colKeys.length ? (j - colKeys.length === i ? NONE : NONE * 2) : (list.find((e) => e.col === j)?.cost ?? NONE * 4))));
      const pickCol = hungarian(cost);
      pickCol.forEach((j, i) => {
        if (j >= colKeys.length) return;
        const hit = entries[i]!.find((e) => e.col === j);
        if (hit) assigned.set(unlocked[i]!.index, hit.pick);
      });
    }
    for (const pk of assigned.values()) if (pk.kind === "theme") used.add(pk.theme.id);
  }
  const takenElsewhere = (index: number): Set<string> => new Set([...assigned.entries()].filter(([k, pk]) => k !== index && pk.kind === "theme").map(([, pk]) => (pk as { theme: Theme }).theme.id));

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
    const g = gathered.get(night.index)!;
    const rejected = g.rejected;
    const mine = assigned.get(night.index);
    const others = takenElsewhere(night.index);
    let passing = g.passing.filter((x) => !others.has(x.theme.id));
    if (!allowDuplicates) {
      passing = mine?.kind === "theme" ? [passing.find((x) => x.theme.id === mine.theme.id)!, ...passing.filter((x) => x.theme.id !== mine.theme.id)].filter(Boolean) : [];
    }
    if (mine?.kind === "act") {
      const found = actPool[mine.idx]!;
      const actTier = mine.tier;
      trace.push(step(now, "constraint", `${night.date} ${original.label}: ${g.passing.length === 0 ? "no theme from our list passed" : "no theme from our list that close in genre was as good a fit"}, so an act of ${actTier === 0 ? "the same genre" : "a related genre"} that people in ${city} like more than most towns do is offered: ${found.name}.`, `Local favorite: not graded against our theme list.${rejected ? ` Themes ruled out: ${rejected}.` : ""}`));
      proposals.push({
        id: `${night.date}-${night.index}`, index: night.index, date: night.date, weekday: weekdayName(night.date), sponsor: night.sponsor,
        fromThemeId: original.id, toThemeId: discoveredId(found), alternates: [], from: fits[original.id]!, to: { label: "found", z: null, score: null },
        checks: [
          "Date is not locked.",
          actTier === 0 ? `${cap(withArticle(`${GENRE_WORDS[found.genre!]} act`))}, the same genre as the planned date.` : `${cap(withArticle(`${GENRE_WORDS[found.genre!]} act`))}, a related genre to the planned ${original.genre ? `${GENRE_WORDS[original.genre]} ` : ""}date.`,
          "Not used anywhere else in the summer series.",
          night.sponsor ? `Sponsor (${night.sponsor}) and date stay.` : "Date stays.",
        ],
        why: `People in ${city} like ${found.name} more than people in most towns do. ${night.sponsor ? "The date and the sponsor stay the same." : "The date stays the same."}`,
        discovered: found,
      });
      continue;
    }
    const chosen = passing[0]?.theme ?? null;
    const chosenDetail = passing[0]?.detail ?? "";
    const standing = !chosen && isYoung(original.audience) ? pool.findIndex((x) => labelForZ(x.z ?? -9) === "leans-in") : -1;
    if (!chosen && isYoung(original.audience) && standing >= 0) {
      const found = pool.splice(standing, 1)[0]!;
      const toId = discoveredId(found);
      trace.push(step(now, "constraint", `${night.date} ${original.label}: no theme from our list passed, so a family ${found.type === "movie" ? "movie" : "show"} that people in ${city} like more than most towns do is offered: ${found.name}.`, `Local favorite: not graded against our theme list.${rejected ? ` Themes ruled out: ${rejected}.` : ""}`));
      proposals.push({
        id: `${night.date}-${night.index}`, index: night.index, date: night.date, weekday: weekdayName(night.date), sponsor: night.sponsor,
        fromThemeId: original.id, toThemeId: toId, alternates: [], from: fits[original.id]!, to: { label: "found", z: null, score: null },
        checks: [
          "Night is not locked.",
          "A family title, so it suits a kids or family night.",
          "Not used anywhere else in the season.",
          night.sponsor ? `Sponsor (${night.sponsor}) and date stay.` : "Date stays.",
        ],
        why: `People in ${city} like ${found.name} more than people in most towns do.`,
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
        trace.push(step(now, "constraint", `${night.date} ${original.label}: nothing in this audience is a strong fit here, so the best option for it is offered: ${best.label}.`, `An average fit, and ahead of ${original.label} by at least ${BEST_OPTION_GAIN.toFixed(1)}.`));
        proposals.push({
          ...common, toThemeId: best.id, to: fits[best.id]!, checks,
          why: `${best.label} is an average fit here, ${original.label} is weak. A small step up. ${night.sponsor ? "The date and the sponsor stay the same." : "The date stays the same."}`,
        });
        continue;
      }
      const decentIdx = originalZ <= -1 ? pool.findIndex((x) => (x.z ?? -9) >= 0) : -1;
      if (decentIdx >= 0) {
        const found = pool.splice(decentIdx, 1)[0]!;
        trace.push(step(now, "constraint", `${night.date} ${original.label}: nothing in this audience is a strong fit here, so a well-known family ${found.type === "movie" ? "movie" : "show"} that holds up in ${city} is offered as its best option: ${found.name}.`, "Local favorite: not graded against our theme list."));
        proposals.push({
          ...common, toThemeId: discoveredId(found), to: { label: "found", z: null, score: null }, discovered: found,
          checks: checks.map((c) => (c.startsWith("Same audience") ? "A well-known family title, so it suits a kids or family night." : c)),
          why: `Nothing on our list is a strong fit for this night in ${city}, so ${found.name} is offered: a well-known family title that holds up there.`,
        });
        continue;
      }
    }
    if (!chosen) {
      const young = isYoung(original.audience);
      unfixed.push({ index: night.index, date: night.date, reason: venue ? `No ${original.genre ? `${GENRE_WORDS[original.genre]} ` : ""}act, or act in a related genre, is a strong fit here for this date.` : young ? "No family theme is a strong fit here for this date." : "No strong-fit theme passes the date, audience and no-repeat checks." });
      trace.push(step(now, "constraint", `${night.date} ${original.label}: no candidate passed (${rejected || "none left"}).`));
      continue;
    }
    const tier = venue
      ? TIER_WORDS[genreTier(original.genre, chosen.genre)]
      : ["same kind of theme", "same audience", "another theme that fits the night"][likeness(original, chosen)]!;
    trace.push(step(now, "constraint", `${night.date} ${original.label} to ${chosen.label}: ${chosenDetail}`, `Ranked by ${venue ? "same genre, then a related genre" : "same kind of theme"} first, then same audience, then how strong a fit (this one: ${tier}).${rejected ? ` Other themes ruled out: ${rejected}.` : ""}`));
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
      why: templateWhy(original, chosen, night.sponsor, city),
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
