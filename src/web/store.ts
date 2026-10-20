import type { AnalyzeResponse, MarketIn, NightOut, ProposeResponse, ThemeScoreOut } from "../app/api-types";
import type { CalendarRow, RowError } from "../app/calendar/csv";
import type { Kind } from "../app/kind";
import type { FitLabel } from "../app/score";
import type { TraceStep } from "../app/trace";
import { pickAngles, templateWhy, type Proposal, type SponsorAngle } from "../app/propose/propose";
import { cityOfLabel, copyFor, type Copy } from "../app/kind";
import type { Genre } from "../app/themes/library";
import { swapName } from "../app/text";
import { themeById } from "../app/themes/artists";

export type Decision = "approved" | "rejected";

export interface TraceGroup {
  title: string;
  at: string;
  steps: TraceStep[];
}

export interface State {
  /** "venue" for the concert-venue sample, else "club": decides wording and which library the Worker scores. */
  kind: Kind;
  market: MarketIn | null;
  sampleId: string | null;
  rows: CalendarRow[];
  parseErrors: RowError[];
  analysis: AnalyzeResponse | null;
  /** The director's pick for ambiguous nights, by night index. */
  choices: Record<number, string>;
  propose: ProposeResponse | null;
  decisions: Record<string, Decision>;
  /** A director's switch to one of a proposal's alternates, by proposal id. */
  altChoice: Record<string, string>;
  allowDuplicates: boolean;
  traceGroups: TraceGroup[];
}

export const state: State = blank();

/** The wording for the run on screen: club wording unless the concert-venue sample is loaded. */
export const copy = (): Copy => copyFor(state.kind);

/** A swapped date's name: a club keeps the original's ending ("Bluey Day"), a venue date is just the act. */
export const swapTitle = (original: string, newLabel: string): string => swapName(original, newLabel, state.kind);

function blank(): State {
  return { kind: "club", market: null, sampleId: null, rows: [], parseErrors: [], analysis: null, choices: watched({}), propose: null, decisions: watched({}), altChoice: watched({}), allowDuplicates: false, traceGroups: [] };
}

// ----- the director's work survives a reload (this tab only; storage can be missing or throw, so nothing depends on it) -----
const WORK_KEY = "homestand.work";
/** Where the swap carousel was: opened, and which swap. Kept by the Fix screen. */
export const pack = { opened: false, cur: 0 };

const workKey = (): string | null => (state.market ? `${state.market.label}|${state.rows.length}|${state.kind}` : null);

export function saveWork(): void {
  const key = workKey();
  if (!key) return;
  try {
    sessionStorage.setItem(WORK_KEY, JSON.stringify({ key, decisions: state.decisions, altChoice: state.altChoice, choices: state.choices, allowDuplicates: state.allowDuplicates, pack }));
  } catch {
    /* no storage: the work is simply not remembered */
  }
}

/** Puts back the approvals, picks and carousel position saved for this same club, if any. */
export function loadWork(): void {
  const key = workKey();
  if (!key) return;
  try {
    const raw = sessionStorage.getItem(WORK_KEY);
    if (!raw) return;
    const w = JSON.parse(raw) as { key?: string; decisions?: Record<string, Decision>; altChoice?: Record<string, string>; choices?: Record<number, string>; allowDuplicates?: boolean; pack?: { opened?: boolean; cur?: number } };
    if (w.key !== key) return;
    Object.assign(state.decisions, w.decisions ?? {});
    Object.assign(state.altChoice, w.altChoice ?? {});
    Object.assign(state.choices, w.choices ?? {});
    state.allowDuplicates = w.allowDuplicates === true;
    pack.opened = w.pack?.opened === true;
    pack.cur = typeof w.pack?.cur === "number" ? w.pack.cur : 0;
  } catch {
    /* unreadable: start fresh */
  }
}

/** A plain object that saves the work whenever a key is set or removed. */
function watched<T extends object>(o: T): T {
  return new Proxy(o, {
    set(t, k, v) {
      const ok = Reflect.set(t, k, v);
      saveWork();
      return ok;
    },
    deleteProperty(t, k) {
      const ok = Reflect.deleteProperty(t, k);
      saveWork();
      return ok;
    },
  });
}

export function reset(): void {
  Object.assign(state, blank());
  pack.opened = false;
  pack.cur = 0;
}

export function addTrace(title: string, steps: TraceStep[]): void {
  state.traceGroups.push({ title, at: new Date().toISOString(), steps });
}

/** Anything that changes scores or themes makes earlier proposals stale. */
export function invalidateProposals(): void {
  state.propose = null;
  state.decisions = watched({});
  state.altChoice = watched({});
  pack.opened = false;
  pack.cur = 0;
  saveWork();
}

export function effectiveThemeId(n: NightOut): string | null {
  return state.choices[n.index] ?? n.themeId;
}

export interface NightView {
  night: NightOut;
  themeId: string | null;
  themeLabel: string;
  fit: FitLabel;
  z: number | null;
  score: ThemeScoreOut | null;
  /** Set when an approved swap replaced the planned theme. */
  swappedFrom: string | null;
  needsChoice: boolean;
  /** Set when an approved swap replaced the night with a title Qloo found. */
  discovered: { name: string; type: "movie" | "tv_show" | "artist"; z: number | null; genre?: Genre } | null;
}

/** What a night looks like right now: the director's choice and any approved swap applied. */
export function viewOf(n: NightOut): NightView {
  const a = state.analysis!;
  const proposal = state.propose?.proposals.find((p) => p.index === n.index);
  const approved = proposal && state.decisions[proposal.id] === "approved" ? effective(proposal) : null;
  const themeId = approved ? approved.toThemeId : effectiveThemeId(n);
  const score = themeId ? (a.themes[themeId] ?? null) : null;
  const needsChoice = n.resolution.kind === "ambiguous" && state.choices[n.index] === undefined;
  const disc = approved?.discovered ?? null;
  const fit: FitLabel = n.resolution.kind === "classic" ? "classic" : disc ? "found" : n.pool ? n.label : score ? score.label : "not-scored";
  const label = disc ? disc.name : themeId ? (themeById(themeId)?.label ?? themeId) : n.theme;
  return { night: n, themeId, themeLabel: label, fit, z: n.pool ? n.z : (score?.z ?? null), score, swappedFrom: approved ? (themeById(approved.fromThemeId)?.label ?? approved.fromThemeId) : null, needsChoice, discovered: disc ? { name: disc.name, type: disc.type, z: disc.z ?? null, ...(disc.genre ? { genre: disc.genre } : {}) } : null };
}

export type ShownProposal = Proposal & { whySource: "model" | "template" };

/** The proposal as the director currently sees it: the top pick, or the alternate they switched to. */
export function effective(p: ShownProposal): ShownProposal {
  const alt = state.altChoice[p.id];
  if (!alt || alt === p.toThemeId) return p;
  const pick = p.alternates.find((a) => a.toThemeId === alt);
  if (!pick) return p;
  const from = themeById(p.fromThemeId)!;
  const to = themeById(pick.toThemeId)!;
  // Switching changes the theme but keeps the date and sponsor; the reason falls back to the template for the new theme.
  return { ...p, toThemeId: pick.toThemeId, to: pick.to, why: templateWhy(from, to, p.sponsor, state.market ? cityOfLabel(state.market.label) : undefined), whySource: "template" };
}

/** The locked-night ideas as they read now: one that is already a proposed or chosen swap is never also offered as an add-on. */
export function shownAngles(): SponsorAngle[] {
  const p = state.propose;
  if (!p) return [];
  const taken = new Set(p.proposals.map((x) => effective(x).toThemeId));
  return pickAngles(p.angles, taken);
}

export function approvedSwaps(): ShownProposal[] {
  return (state.propose?.proposals ?? []).filter((p) => state.decisions[p.id] === "approved").map(effective);
}

/** Transient screen status. */
export const ui = { loading: false, error: null as string | null, proposing: false, proposeError: null as string | null, dupesBefore: null as string | null, dupesNote: null as string | null };
