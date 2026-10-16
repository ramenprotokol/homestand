import type { ExportRow } from "../../app/export/csv";
import { exportCsv } from "../../app/export/csv";
import { exportIcs } from "../../app/export/ics";
import { buildMemoHtml, memoDocument, type MemoData } from "../../app/export/memo";
import { themeById } from "../../app/themes/library";
import { api, ApiFailure } from "../api";
import { syntheticBanner, tile } from "../components";
import { download, formatDate, h } from "../dom";
import { navigate } from "../flow";
import { icon } from "../icons";
import { addTrace, approvedSwaps, state, viewOf } from "../store";

const rerender = (): void => void window.dispatchEvent(new HashChangeEvent("hashchange"));
let memoError: string | null = null;
let memoLoading = false;

function exportRows(): ExportRow[] {
  const a = state.analysis!;
  return a.nights.map((n) => {
    const v = viewOf(n);
    return { date: n.date, theme: v.swappedFrom ? v.themeLabel : n.theme, sponsor: n.sponsor, locked: n.locked, notes: v.swappedFrom ? [n.notes, `Swapped from ${n.theme} (Homestand)`].filter(Boolean).join(". ") : n.notes };
  });
}

function memoData(): MemoData {
  const a = state.analysis!;
  const swaps = approvedSwaps().map((p) => ({
    date: p.date, weekday: p.weekday, from: themeById(p.fromThemeId)?.label ?? p.fromThemeId, to: themeById(p.toThemeId)?.label ?? p.toThemeId, sponsor: p.sponsor,
    fromZ: p.from.z, toZ: p.to.z, fromScore: p.from.score, toScore: p.to.score, why: p.why,
  }));
  return {
    club: a.market.label, generatedOn: new Date().toISOString().slice(0, 10), summary: state.memo?.summary ?? "", swaps,
    angles: (state.propose?.angles ?? []).map((x) => x.text), nights: a.nights.length, classic: a.nights.filter((n) => n.resolution.kind === "classic").length,
    synthetic: a.mode === "synthetic" || a.reference.synthetic, recordedOn: a.recordedOn,
  };
}

async function loadMemo(): Promise<void> {
  if (memoLoading || state.memo || !state.analysis || !state.market) return;
  memoLoading = true;
  memoError = null;
  try {
    const d = memoData();
    const res = await api.memo(state.market, approvedSwaps().map((p) => ({ date: p.date, fromThemeId: p.fromThemeId, toThemeId: p.toThemeId })), d.nights, d.classic);
    state.memo = res;
    addTrace("Send: memo summary", res.trace);
  } catch (err) {
    memoError = err instanceof ApiFailure ? err.message : "Could not write the memo summary.";
  }
  memoLoading = false;
  rerender();
}

export function sendView(): HTMLElement {
  const a = state.analysis;
  if (!a) {
    navigate("#/");
    return h("div");
  }
  if (!state.memo && !memoError) void loadMemo();
  const swaps = approvedSwaps();
  const views = a.nights.map(viewOf);
  const rows = exportRows();
  const stem = (state.sampleId ?? "my-club") + "-season";
  const data = memoData();

  return h(
    "div",
    null,
    h("div", { class: "page-head" }, h("h1", { tabindex: "-1" }, "Send: your revised calendar"), h("p", { class: "lede", "data-testid": "send-summary" }, swaps.length === 0 ? "No swaps approved, so the calendar is unchanged. You can still export it and the memo." : `${swaps.length} swap${swaps.length === 1 ? "" : "s"} approved. Each keeps its date and sponsor.`)),
    syntheticBanner(),
    h(
      "div",
      { class: "actions", style: "margin-bottom:20px" },
      h("button", { type: "button", class: "btn btn--primary", "data-testid": "dl-csv", onclick: () => download(`${stem}.csv`, "text/csv", exportCsv(rows)) }, icon("download"), "Download CSV"),
      h("button", { type: "button", class: "btn", "data-testid": "dl-ics", onclick: () => download(`${stem}.ics`, "text/calendar", exportIcs(rows, a.market.label, new Date().toISOString())) }, icon("download"), "Download calendar (.ics)"),
      h("button", { type: "button", class: "btn", "data-testid": "dl-memo", disabled: state.memo ? null : "", onclick: () => download(`${stem}-memo.html`, "text/html", memoDocument(memoData())) }, icon("download"), "Download memo (HTML)"),
      h("button", { type: "button", class: "btn", "data-testid": "print-memo", disabled: state.memo ? null : "", onclick: () => window.print() }, icon("printer"), "Print memo"),
    ),
    h("div", { class: "board" }, h("div", { class: "board-face" }, h("div", { class: "grid" }, views.map((v) => tile(v))))),
    h("h2", { style: "margin-top:28px;margin-bottom:10px" }, `Rationale memo, ${formatDate(data.generatedOn)}`),
    state.memo ? memoSheet(data) : memoError ? h("p", { class: "error", role: "alert" }, memoError) : h("div", { class: "skeleton", "aria-busy": "true", style: "min-height:200px;max-width:820px" }),
    h(
      "div",
      { class: "actions", style: "margin-top:28px" },
      h("a", { class: "btn btn--quiet", href: "#/study", "data-testid": "to-study" }, "Did local taste really predict crowds? See The Study", icon("arrowRight")),
    ),
  );
}

function memoSheet(d: MemoData): HTMLElement {
  const sheet = h("section", { class: "memo-sheet", "data-testid": "memo", "aria-label": "Rationale memo" });
  sheet.innerHTML = buildMemoHtml(d); // every interpolated value is escaped in buildMemoHtml
  return sheet;
}
