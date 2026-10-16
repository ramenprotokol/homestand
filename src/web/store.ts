import type { AnalyzeResponse, MarketIn, MemoResponse, NightOut, ProposeResponse, ThemeScoreOut } from "../app/api-types";
import type { CalendarRow, RowError } from "../app/calendar/csv";
import type { FitLabel } from "../app/score";
import type { TraceStep } from "../app/trace";
import { themeById } from "../app/themes/library";

export type Decision = "approved" | "rejected";

export interface TraceGroup {
  title: string;
  at: string;
  steps: TraceStep[];
}

export interface State {
  market: MarketIn | null;
  sampleId: string | null;
  rows: CalendarRow[];
  parseErrors: RowError[];
  analysis: AnalyzeResponse | null;
  /** The director's pick for ambiguous nights, by night index. */
  choices: Record<number, string>;
  propose: ProposeResponse | null;
  decisions: Record<string, Decision>;
  allowDuplicates: boolean;
  traceGroups: TraceGroup[];
  memo: MemoResponse | null;
}

export const state: State = blank();

function blank(): State {
  return { market: null, sampleId: null, rows: [], parseErrors: [], analysis: null, choices: {}, propose: null, decisions: {}, allowDuplicates: false, traceGroups: [], memo: null };
}

export function reset(): void {
  Object.assign(state, blank());
}

export function addTrace(title: string, steps: TraceStep[]): void {
  state.traceGroups.push({ title, at: new Date().toISOString(), steps });
}

/** Anything that changes scores or themes makes earlier proposals stale. */
export function invalidateProposals(): void {
  state.propose = null;
  state.decisions = {};
  state.memo = null;
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
}

/** What a night looks like right now: the director's choice and any approved swap applied. */
export function viewOf(n: NightOut): NightView {
  const a = state.analysis!;
  const proposal = state.propose?.proposals.find((p) => p.index === n.index);
  const approved = proposal && state.decisions[proposal.id] === "approved" ? proposal : null;
  const themeId = approved ? approved.toThemeId : effectiveThemeId(n);
  const score = themeId ? (a.themes[themeId] ?? null) : null;
  const needsChoice = n.resolution.kind === "ambiguous" && state.choices[n.index] === undefined;
  const fit: FitLabel = n.resolution.kind === "classic" ? "classic" : score ? score.label : "not-scored";
  const label = themeId ? (themeById(themeId)?.label ?? themeId) : n.theme;
  return { night: n, themeId, themeLabel: label, fit, z: score?.z ?? null, score, swappedFrom: approved ? (themeById(approved.fromThemeId)?.label ?? approved.fromThemeId) : null, needsChoice };
}

export function approvedSwaps() {
  return (state.propose?.proposals ?? []).filter((p) => state.decisions[p.id] === "approved");
}

/** Transient screen status. */
export const ui = { loading: false, error: null as string | null, proposing: false, proposeError: null as string | null };
