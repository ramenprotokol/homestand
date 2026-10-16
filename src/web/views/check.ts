import type { ThemeScoreOut } from "../../app/api-types";
import { AUDIT_LINE, CLASSIC_REASON, comparisonSentence, FIT_WORDS, METHOD_WORDS } from "../../app/score";
import { themeById } from "../../app/themes/library";
import { ApiFailure } from "../api";
import { badge, closeDrawer, openDrawer, refreshDrawer, syntheticBanner, tile } from "../components";
import { formatDate, formatDateTime, h } from "../dom";
import { recheckTheme, navigate } from "../flow";
import { icon } from "../icons";
import { state, ui, viewOf, type NightView } from "../store";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function checkView(): HTMLElement {
  if (ui.loading) return loadingView();
  if (ui.error) {
    return h("div", { class: "form" }, h("h1", { tabindex: "-1" }, "That did not work"), h("p", { class: "error", role: "alert" }, ui.error), h("div", { class: "actions" }, h("a", { class: "btn btn--primary", href: "#/" }, "Start again")));
  }
  const a = state.analysis;
  if (!a) {
    navigate("#/");
    return h("div");
  }
  const views = a.nights.map(viewOf);
  const count = (f: NightView["fit"]): number => views.filter((v) => v.fit === f).length;
  const away = count("leans-away");
  const pending = views.filter((v) => v.needsChoice).length;

  const notices: HTMLElement[] = [];
  const synth = syntheticBanner();
  if (synth) notices.push(synth);
  if (state.parseErrors.length > 0) {
    notices.push(
      h(
        "div",
        { class: "notice notice--warn", role: "note" },
        icon("warning"),
        h("div", null, h("strong", null, `${state.parseErrors.length} row${state.parseErrors.length === 1 ? " was" : "s were"} skipped. `), "The rest were checked.", h("ul", null, state.parseErrors.map((e) => h("li", null, `Line ${e.line}: ${e.message}`)))),
      ),
    );
  }
  if (pending > 0) notices.push(h("div", { class: "notice", role: "note" }, icon("info"), h("span", null, h("strong", null, `${pending} night${pending === 1 ? " needs" : "s need"} your pick. `), "That name fits more than one theme, so choose one on the magnet. We never guess.")));
  if (a.recordedOn) notices.push(h("div", { class: "notice", role: "note" }, icon("clock"), h("span", null, `Scores recorded on ${formatDate(a.recordedOn)}. They are saved results from Qloo, not a new request.`)));

  const months = new Map<string, NightView[]>();
  for (const v of views) {
    const key = v.night.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), v]);
  }

  const summary = `${count("leans-in")} lean in, ${count("average")} about average, ${away} lean away, ${count("not-scored")} not scored, ${count("classic")} classic.`;
  return h(
    "div",
    null,
    h("div", { class: "page-head" }, h("h1", { tabindex: "-1" }, `Check: ${a.market.label}`), h("p", { class: "lede", "data-testid": "summary" }, summary)),
    notices,
    h(
      "div",
      { class: "board" },
      h(
        "div",
        { class: "board-face" },
        h("div", { class: "board-note" }, h("span", { class: "note-marker" }, "Tap a magnet to see why"), h("span", { class: "small" }, `${views.length} nights`)),
        [...months.entries()].map(([key, vs]) =>
          h(
            "section",
            { class: "month", "aria-label": MONTHS[Number(key.slice(5)) - 1] },
            h("h2", { class: "month-tag" }, MONTHS[Number(key.slice(5)) - 1]),
            h(
              "div",
              { class: "grid" },
              vs.map((v) =>
                tile(v, {
                  onOpen: () => openWhy(v.night.index),
                  candidates: v.night.candidates.map((id) => ({ id, label: themeById(id)?.label ?? id })),
                  onChoose: (id) => {
                    state.choices[v.night.index] = id;
                    window.dispatchEvent(new HashChangeEvent("hashchange"));
                  },
                }),
              ),
            ),
          ),
        ),
      ),
    ),
    h(
      "div",
      { class: "actions", style: "margin-top:20px" },
      h("a", { class: "btn btn--primary", href: "#/fix", "data-testid": "to-fix" }, away > 0 ? "See the fixes" : "Continue", icon("arrowRight")),
      pending > 0 ? h("span", { class: "small" }, "Pick a theme for the open magnets first, or continue and leave them unscored.") : null,
    ),
    h("p", { class: "footer" }, `Taste data from Qloo. Scores describe what this market leans toward. ${AUDIT_LINE}`),
  );
}

function loadingView(): HTMLElement {
  return h(
    "div",
    { "aria-busy": "true" },
    h("div", { class: "page-head" }, h("h1", { tabindex: "-1" }, "Checking your calendar"), h("p", { class: "lede", role: "status" }, "Matching theme names and asking Qloo what this market leans toward. A few seconds.")),
    h("div", { class: "board" }, h("div", { class: "board-face" }, h("div", { class: "grid" }, Array.from({ length: 8 }, () => h("div", { class: "skeleton" }))))),
  );
}

// ---------- Why panel ----------

function rel(z: number | null): string {
  return z === null ? "n/a" : `${z >= 0 ? "+" : ""}${z.toFixed(2)}`;
}

function sourceLine(s: ThemeScoreOut, recheckedAt: string | null): string {
  if (recheckedAt) return `Re-checked live at ${formatDateTime(recheckedAt)}.`;
  if (s.source === "synthetic") return `Synthetic test data generated ${formatDateTime(s.fetchedAt)}. Not from Qloo.`;
  if (s.source === "cache") return `Result recorded ${formatDateTime(s.fetchedAt)}.`;
  return `Fetched from Qloo ${formatDateTime(s.fetchedAt)}.`;
}

const rechecked: Record<string, string> = {};
let showNumbers = false;
let recheckMessage = "";
let recheckBusy = false;

function openWhy(index: number): void {
  showNumbers = false;
  recheckMessage = "";
  const night = state.analysis!.nights[index]!;
  openDrawer(`${night.weekday} ${formatDate(night.date)}`, () => whyBody(index));
}

function whyBody(index: number): HTMLElement[] {
  const a = state.analysis!;
  const v = viewOf(a.nights[index]!);
  const n = v.night;
  const out: HTMLElement[] = [h("div", null, h("p", { class: "tile-theme", style: "margin-bottom:8px" }, n.theme), badge(v.fit), n.locked ? h("p", { class: "small", style: "margin-top:8px" }, "This night is locked. It will not be swapped.") : null)];

  if (v.swappedFrom) out.push(h("p", { class: "panel-box" }, `Swapped from ${v.swappedFrom}.`));

  if (v.fit === "classic") {
    out.push(h("p", { class: "panel-box" }, CLASSIC_REASON));
    return out;
  }
  if (v.needsChoice) {
    out.push(h("p", { class: "panel-box" }, `"${n.theme}" fits more than one theme (${n.candidates.map((id) => themeById(id)?.label ?? id).join(" or ")}). Close this panel and pick one on the magnet.`));
    return out;
  }
  if (!v.themeId || !v.score) {
    out.push(h("p", { class: "panel-box" }, `"${n.theme}" is not one of the ${Object.keys(a.themes).length} themes Qloo has local data for, so it is not scored. It stays as planned.`));
    return out;
  }
  const s = v.score;
  const theme = themeById(v.themeId)!;
  if (s.label === "not-scored") {
    out.push(h("p", { class: "panel-box" }, s.reason ?? "Not scored."));
  } else {
    out.push(h("p", { class: "panel-box", style: "font-weight:650" }, comparisonSentence(theme.label, s.label)));
  }
  out.push(
    h("div", { class: "panel-box" }, h("h3", null, "What Qloo looked at"), h("ul", { class: "entity-list" }, s.entities.map((e) => h("li", null, `${e.name} (${e.type.replace("_", " ")})`)))),
    h("p", { class: "small" }, METHOD_WORDS),
  );

  const toggle = h("button", { type: "button", class: "toggle", "aria-expanded": String(showNumbers), "data-keep": "numbers", onclick: () => { showNumbers = !showNumbers; refreshDrawer(); } }, icon("caretDown"), showNumbers ? "Hide the numbers" : "Show the numbers");
  out.push(toggle);
  if (showNumbers) {
    out.push(
      h(
        "div",
        { class: "panel-box" },
        h("dl", { class: "kv" }, s.entities.flatMap((e) => [h("dt", null, e.name), h("dd", null, e.affinity === null ? "no reading" : e.affinity.toFixed(4))])),
        h(
          "dl",
          { class: "kv", style: "border-top:1px solid var(--line);padding-top:8px" },
          h("dt", null, "This market's bundle score (mean)"), h("dd", null, s.score === null ? "n/a" : s.score.toFixed(4)),
          h("dt", null, `Typical ballpark market (mean of ${s.ref?.n ?? "n/a"})`), h("dd", null, s.ref ? s.ref.mean.toFixed(4) : "n/a"),
          h("dt", null, "Spread between markets (SD)"), h("dd", null, s.ref ? s.ref.sd.toFixed(5) : "n/a"),
          h("dt", null, "Index z = (score - typical) / spread"), h("dd", null, rel(s.z)),
          h("dt", null, "Cut-offs"), h("dd", null, "+0.50 / -0.50"),
        ),
        a.reference.synthetic ? h("p", { class: "small" }, "The typical-market numbers are a synthetic placeholder until the reference set is pulled.") : null,
      ),
    );
  }

  out.push(h("p", { class: "small", "data-testid": "why-footer" }, AUDIT_LINE, " ", h("a", { href: "#/study" }, "See The Study")));
  // Re-check live
  const caps = a.caps;
  const disabled = caps.recheckDisabled || recheckBusy;
  out.push(
    h(
      "div",
      { class: "panel-box" },
      h("p", { class: "small", "data-testid": "source-line" }, sourceLine(s, rechecked[s.themeId] ?? null)),
      h(
        "button",
        {
          type: "button", class: "btn btn--small", "data-testid": "recheck", "data-keep": "recheck", disabled: disabled ? "" : null,
          onclick: async () => {
            recheckBusy = true;
            recheckMessage = "Asking Qloo now...";
            refreshDrawer();
            try {
              const r = await recheckTheme(v.themeId!);
              rechecked[v.themeId!] = new Date().toISOString();
              recheckMessage = r === "changed" ? `Checked again: the answer changed to ${FIT_WORDS[state.analysis!.themes[v.themeId!]!.label]}. Earlier proposals were cleared.` : "Checked again: same answer.";
            } catch (err) {
              recheckMessage = err instanceof ApiFailure ? err.message : "Re-check failed. Try again.";
            }
            recheckBusy = false;
            refreshDrawer();
            window.dispatchEvent(new HashChangeEvent("hashchange"));
          },
        },
        icon("refresh"),
        "Re-check live",
      ),
      caps.recheckDisabled ? h("p", { class: "small" }, "Live re-check is switched off for today because the daily allowance is used up. The recorded result above is still good.") : null,
      recheckMessage ? h("p", { class: "small", role: "status", "data-testid": "recheck-message" }, recheckMessage) : null,
    ),
  );
  return out;
}

export { closeDrawer };
