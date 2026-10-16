import type { MarketIn } from "../app/api-types";
import type { CalendarRow, RowError } from "../app/calendar/csv";
import { api, ApiFailure } from "./api";
import { addTrace, invalidateProposals, reset, state, ui, viewOf } from "./store";

export const navigate = (hash: string): void => {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
};

/** Step 0 to Check: parse is done by the caller; this asks the Worker to resolve, score and flag. */
export async function startCheck(market: MarketIn, rows: CalendarRow[], parseErrors: RowError[], sampleId: string | null): Promise<void> {
  reset();
  Object.assign(state, { market, rows, parseErrors, sampleId });
  ui.loading = true;
  ui.error = null;
  navigate("#/check");
  try {
    const a = await api.analyze(market, rows);
    state.analysis = a;
    addTrace("Check: resolve, score, flag", a.trace);
  } catch (err) {
    ui.error = err instanceof ApiFailure ? err.message : "Something went wrong. Try again.";
  }
  ui.loading = false;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export async function ensureProposals(): Promise<void> {
  if (!state.analysis || !state.market || state.propose || ui.proposing) return;
  ui.proposing = true;
  ui.proposeError = null;
  try {
    const nights = state.analysis.nights.map((n) => {
      const v = viewOf(n);
      return { index: n.index, date: n.date, themeId: n.resolution.kind === "classic" || v.needsChoice ? null : v.themeId, sponsor: n.sponsor, locked: n.locked, notes: n.notes };
    });
    const res = await api.propose(state.market, nights, state.allowDuplicates);
    state.propose = res;
    state.analysis.caps = res.caps;
    addTrace("Fix: propose swaps", res.trace);
  } catch (err) {
    ui.proposeError = err instanceof ApiFailure ? err.message : "Something went wrong. Try again.";
  }
  ui.proposing = false;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export async function recheckTheme(themeId: string): Promise<string> {
  if (!state.analysis || !state.market) return "";
  const before = state.analysis.themes[themeId];
  const res = await api.recheck(state.market, themeId);
  state.analysis.themes[themeId] = res.theme;
  state.analysis.caps = res.caps;
  invalidateProposals();
  addTrace(`Re-check live: ${themeId}`, res.trace);
  return before && before.label !== res.theme.label ? "changed" : "same";
}
