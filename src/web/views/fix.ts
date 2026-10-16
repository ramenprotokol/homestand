import { themeById } from "../../app/themes/library";
import { vsTypical } from "../../app/score";
import { syntheticBanner, tile, openDrawer } from "../components";
import { h } from "../dom";
import { ensureProposals, navigate } from "../flow";
import { icon } from "../icons";
import { state, ui, viewOf, approvedSwaps, effective, type ShownProposal } from "../store";
import { shortDate } from "../../app/dates";

const rerender = (): void => void window.dispatchEvent(new HashChangeEvent("hashchange"));
const label = (id: string): string => themeById(id)?.label ?? id;

export function fixView(): HTMLElement {
  const a = state.analysis;
  if (!a) {
    navigate("#/");
    return h("div");
  }
  if (!state.propose && !ui.proposeError) {
    void ensureProposals();
    return h(
      "div",
      { "aria-busy": "true" },
      h("div", { class: "page-head" }, h("h1", { tabindex: "-1" }, "Working out the fixes"), h("p", { class: "lede", role: "status" }, "Checking each swap against your locks, dates and audience.")),
      h("div", { class: "proposals" }, Array.from({ length: 3 }, () => h("div", { class: "skeleton", style: "min-height:180px" }))),
    );
  }
  if (ui.proposeError || !state.propose) {
    return h("div", { class: "form" }, h("h1", { tabindex: "-1" }, "That did not work"), h("p", { class: "error", role: "alert" }, ui.proposeError ?? "Try again."), h("div", { class: "actions" }, h("button", { type: "button", class: "btn", onclick: () => { ui.proposeError = null; rerender(); } }, "Try again"), h("a", { class: "btn btn--quiet", href: "#/check" }, "Back to Check")));
  }
  const p = state.propose;
  const decided = p.proposals.filter((x) => state.decisions[x.id]).length;
  const synth = syntheticBanner();

  return h(
    "div",
    null,
    h("div", { class: "page-head" }, h("h1", { tabindex: "-1" }, "Fix: nights that lean away"), h("p", { class: "lede" }, p.proposals.length > 0 ? `${p.proposals.length} swap${p.proposals.length === 1 ? "" : "s"} proposed. Nothing changes until you approve it. Locked nights are never swapped. Every swap keeps its date and sponsor.` : "Nothing needs swapping.")),
    synth,
    h(
      "div",
      { class: "actions", style: "margin-bottom:16px" },
      h("button", { type: "button", class: "btn btn--small", "data-testid": "open-trace", onclick: openTrace }, icon("list"), "Agent trace"),
      h("label", { class: "small", style: "display:inline-flex;gap:8px;align-items:center;min-height:44px" }, h("input", { type: "checkbox", checked: state.allowDuplicates ? "" : null, "data-testid": "allow-dupes", onchange: (e: Event) => { state.allowDuplicates = (e.target as HTMLInputElement).checked; state.propose = null; state.decisions = {}; state.altChoice = {}; state.memo = null; rerender(); } }), "Allow a theme to repeat in the season"),
    ),
    p.proposals.length > 0 ? h("div", { class: "proposals" }, p.proposals.map(proposalCard)) : null,
    p.angles.length > 0
      ? h("section", { class: "sect", style: "margin-top:24px" }, h("h2", null, "Locked nights: keep them, add an angle"), h("div", { class: "proposals" }, p.angles.map((x) => h("div", { class: "panel-box", "data-testid": "angle" }, h("p", { class: "swap-line" }, icon("lock"), `${shortDate(x.date)}: ${label(x.themeId)}`), h("p", null, x.text)))))
      : null,
    p.unfixed.length > 0
      ? h("section", { class: "sect", style: "margin-top:24px" }, h("h2", null, "Could not fix"), h("ul", { class: "checks" }, p.unfixed.map((u) => h("li", null, `${shortDate(u.date)}: ${u.reason}`))))
      : null,
    h(
      "div",
      { class: "actions", style: "margin-top:24px" },
      h("a", { class: "btn btn--primary", href: "#/send", "data-testid": "to-send" }, "Send the revised calendar", icon("arrowRight")),
      h("span", { class: "small" }, `${approvedSwaps().length} approved, ${decided - approvedSwaps().length} rejected, ${p.proposals.length - decided} not decided (they stay as planned).`),
    ),
  );
}

function proposalCard(top: ShownProposal): HTMLElement {
  const p = effective(top);
  const night = state.analysis!.nights[p.index]!;
  const v = viewOf(night);
  const d = state.decisions[p.id];
  const set = (x: "approved" | "rejected" | undefined) => () => {
    if (x) state.decisions[p.id] = x;
    else delete state.decisions[p.id];
    state.memo = null;
    rerender();
    document.querySelector<HTMLElement>(`[data-proposal="${p.id}"] [data-focus]`)?.focus();
  };
  // Every option is [top pick, ...alternates]; all passed the same checks. Another proposal's current choice is off limits unless repeats are allowed.
  const takenElsewhere = new Set(state.propose!.proposals.filter((o) => o.id !== p.id).map((o) => effective(o).toThemeId));
  const pool = [top.toThemeId, ...top.alternates.map((a) => a.toThemeId)].filter((id) => id !== p.toThemeId);
  const chips = d === undefined && top.alternates.length > 0
    ? h("div", { class: "alts", role: "group", "aria-label": "Other themes that pass the same checks" }, h("span", { class: "small" }, "Or:"), pool.map((id) => {
      const blocked = !state.allowDuplicates && takenElsewhere.has(id);
      return h("button", { type: "button", class: "chip-btn", "data-testid": "alt", disabled: blocked ? "" : null, title: blocked ? "Already chosen for another night" : null, onclick: () => { state.altChoice[top.id] = id; rerender(); document.querySelector<HTMLElement>(`[data-proposal="${top.id}"] [data-testid="alt"]`)?.focus(); } }, label(id));
    }))
    : null;
  return h(
    "article",
    { class: "proposal", "data-proposal": p.id, "data-decision": d ?? "open", "data-testid": "proposal" },
    tile(v),
    h(
      "div",
      { class: "proposal-body" },
      h("p", { class: "swap-line", "data-testid": "swap-line" }, label(p.fromThemeId), icon("swap"), label(p.toThemeId)),
      h("p", null, p.why),
      h("p", { class: "small", "data-testid": "cited" }, `${label(p.toThemeId)}: ${vsTypical(p.to.z)} · ${label(p.fromThemeId)}: ${vsTypical(p.from.z)}`, p.whySource === "model" ? ". Reason written by the model from the computed facts." : ""),
      chips,
      h("details", null, h("summary", { class: "small" }, "Checks passed"), h("ul", { class: "checks" }, p.checks.map((c) => h("li", null, c)))),
      d === "approved"
        ? h("div", { class: "actions" }, h("span", { class: "decision" }, icon("check"), "Approved"), h("button", { type: "button", class: "btn btn--quiet btn--small", "data-focus": "", onclick: set(undefined) }, "Undo"))
        : d === "rejected"
          ? h("div", { class: "actions" }, h("span", { class: "decision" }, icon("x"), "Rejected, stays as planned"), h("button", { type: "button", class: "btn btn--quiet btn--small", "data-focus": "", onclick: set(undefined) }, "Undo"))
          : h("div", { class: "actions" }, h("button", { type: "button", class: "btn btn--small", "data-testid": "approve", "data-focus": "", onclick: set("approved") }, icon("check"), "Approve"), h("button", { type: "button", class: "btn btn--quiet btn--small", "data-testid": "reject", onclick: set("rejected") }, "Reject")),
    ),
  );
}

export function openTrace(): void {
  openDrawer("Agent trace", () => [
    h("p", { class: "small" }, "Every step the agent took, in order: how names were matched, each Qloo call (cached or live, with time), each rule check, and each model call. Code does the scoring and the choosing. The model only words the reasons."),
    ...state.traceGroups.map((g) =>
      h(
        "section",
        { class: "trace-group" },
        h("h3", null, g.title),
        h("ol", { class: "trace-list" }, g.steps.map((s) => h("li", null, h("span", { class: "trace-kind" }, `${s.kind} at ${new Date(s.at).toLocaleTimeString("en-US")}`), h("span", null, s.text), s.detail ? h("span", { class: "small" }, s.detail) : null))),
      ),
    ),
  ]);
}
