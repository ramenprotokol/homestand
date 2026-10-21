import type { MarketIn } from "../app/api-types";
import type { CalendarRow, RowError } from "../app/calendar/csv";
import { parseCalendar, sortRowsByDate } from "../app/calendar/csv";
import { sportOf, type Kind, type Sport } from "../app/kind";
import { sampleById } from "../app/markets";
import { sampleCsv } from "../app/samples";
import { api, ApiFailure } from "./api";
import { addTrace, invalidateProposals, loadWork, reset, state, ui, viewOf } from "./store";

export const navigate = (hash: string): void => {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
};

const CLUB_KEY = "homestand.club";

interface SavedClub {
  market: MarketIn;
  rows: CalendarRow[];
  parseErrors: RowError[];
  sampleId: string | null;
  kind?: Kind;
  sport?: Sport;
}

/** The chosen club survives a reload for this tab. Storage can be missing or throw (private windows), so the app never relies on it. */
function saveClub(c: SavedClub): void {
  try {
    sessionStorage.setItem(CLUB_KEY, JSON.stringify(c));
  } catch {
    /* no storage: the club is simply not remembered */
  }
}

function savedClub(): SavedClub | null {
  try {
    const raw = sessionStorage.getItem(CLUB_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<SavedClub>;
    return c.market && Array.isArray(c.rows) && c.rows.length > 0 && Array.isArray(c.parseErrors) ? (c as SavedClub) : null;
  } catch {
    return null;
  }
}

async function analyzeClub(c: SavedClub): Promise<void> {
  try {
    const a = await api.analyze(c.market, c.rows, c.kind ?? "club", sportOf(c.sport));
    // An answer without its parts (an empty object, say) would blank every screen: treat it as a failed check, which shows the error page.
    if (!a || !Array.isArray(a.nights) || a.nights.length === 0 || typeof a.themes !== "object" || a.themes === null || !a.market) throw new ApiFailure("incomplete", "The server's answer was incomplete, so the check could not be shown. Please try again in a moment.");
    state.analysis = a;
    addTrace("Check: match names, rate, flag weak nights", a.trace);
  } catch (err) {
    ui.error = err instanceof ApiFailure ? err.message : "Something went wrong. Try again.";
    ui.errorCode = err instanceof ApiFailure ? err.code : "error";
  }
  ui.loading = false;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/** Retry on the error page: the same Check request again, from the calendar already in memory. Nothing typed is lost. */
export function retryCheck(): void {
  if (!state.market || state.rows.length === 0 || ui.loading) return;
  const c: SavedClub = { market: state.market, rows: state.rows, parseErrors: state.parseErrors, sampleId: state.sampleId, kind: state.kind, sport: state.sport };
  ui.loading = true;
  ui.error = null;
  ui.errorCode = null;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  void analyzeClub(c);
}

/** Start of a visit on Check, Fix or Send with nothing in memory (a reload): pick the saved club up again and re-check it, staying on the same screen. */
export function resumeClub(): void {
  const c = savedClub();
  if (!c || state.analysis || ui.loading) return;
  reset();
  Object.assign(state, c, { sport: sportOf(c.sport) });
  loadWork();
  ui.loading = true;
  ui.error = null;
  ui.errorCode = null;
  void analyzeClub(c);
}

/** Step 1 of 3, Check: parse is done by the caller; this asks the Worker to resolve, score and flag. */
export async function startCheck(market: MarketIn, rowsIn: CalendarRow[], parseErrors: RowError[], sampleId: string | null, go = true, kind: Kind = "club", sport: Sport = "baseball"): Promise<void> {
  const rows = sortRowsByDate(rowsIn);
  reset();
  Object.assign(state, { market, rows, parseErrors, sampleId, kind, sport });
  saveClub({ market, rows, parseErrors, sampleId, kind, sport });
  ui.loading = true;
  ui.error = null;
  ui.errorCode = null;
  ui.dupesNote = null;
  ui.dupesBefore = null;
  // A sample club has a link of its own: #/check/biloxi opens it from a cold start.
  if (go) navigate(sampleId ? `#/check/${sampleId}` : "#/check");
  await analyzeClub({ market, rows, parseErrors, sampleId, kind, sport });
}

/** A deep link such as #/check/biloxi: load that sample club unless it is already loaded. False for an unknown club. */
export function openSample(id: string): boolean {
  const m = sampleById(id);
  if (!m) return false;
  if (state.sampleId === id && (state.analysis || ui.loading || ui.error)) return true;
  const { rows, errors } = parseCalendar(sampleCsv(id));
  void startCheck({ label: m.label, lon: m.lon, lat: m.lat }, rows, errors, id, false, m.kind, sportOf(m.sport));
  loadWork();
  return true;
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
    const res = await api.propose(state.market, nights, state.allowDuplicates, state.kind, state.sport);
    if (!res || !Array.isArray(res.proposals) || !Array.isArray(res.unfixed) || !Array.isArray(res.angles)) throw new ApiFailure("incomplete", "The server's answer was incomplete, so the swaps could not be shown. Please try again in a moment.");
    state.propose = res;
    // Allowing repeats re-runs the proposals. Say so when that changed nothing.
    if (ui.dupesBefore !== null) {
      ui.dupesNote = ui.dupesBefore === JSON.stringify(res.proposals.map((x) => x.toThemeId)) ? "No change: no other theme qualifies for these nights." : null;
      ui.dupesBefore = null;
    }
    state.analysis.caps = res.caps;
    addTrace("Fix: find swaps for the weak nights", res.trace);
  } catch (err) {
    ui.proposeError = err instanceof ApiFailure ? err.message : "Something went wrong. Try again.";
  }
  ui.proposing = false;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export async function recheckTheme(themeId: string): Promise<"same" | "changed" | "recent"> {
  if (!state.analysis || !state.market) return "same";
  const before = state.analysis.themes[themeId];
  const res = await api.recheck(state.market, themeId, state.kind, state.sport);
  state.analysis.themes = { ...res.themes, [themeId]: res.theme };
  state.analysis.caps = res.caps;
  invalidateProposals();
  addTrace(`Get fresh data: ${themeId}`, res.trace);
  if (res.withinDay) return "recent";
  return before && before.label !== res.theme.label ? "changed" : "same";
}
