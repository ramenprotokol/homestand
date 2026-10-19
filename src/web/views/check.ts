import type { ThemeScoreOut } from "../../app/api-types";
import { CLASSIC_REASON, comparisonSentence, FIT_WORDS, marketLevelSentence, METHOD_WORDS, NEAR_TOP_NOTE, pullWords, vsMarketsWords } from "../../app/score";
import { themeById } from "../../app/themes/library";
import { checkResultLine, fitSummary, lockedLine, swapName } from "../../app/text";
import { ApiFailure } from "../api";
import { fitChip, syntheticBanner } from "../components";
import { formatDate, formatDateTime, h, type Child } from "../dom";
import { recheckTheme, navigate } from "../flow";
import { bindTilt, FIT_NAME, gemChip, makeCard, repaintCard, specOf, type BackSpec, type CardFit } from "../foil/cards";
import { tally } from "../foil/tally";
import { onCleanup, onMount, route, routeContext } from "../foil/lifecycle";
import { gsap, reduced } from "../foil/motion";
import { rand } from "../foil/rng";
import { bokeh, garland, lamp, ridge } from "../foil/scenery";
import { openWhy, refreshWhy } from "../foil/why";
import { icon } from "../icons";
import { step } from "../../app/trace";
import { addTrace, state, ui, viewOf, type NightView } from "../store";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LEGEND: ReadonlyArray<readonly [CardFit, string, string]> = [
  ["leans-in", "Leans in", "Fans here like it more than the average theme."],
  ["average", "About average", "Liked about as much as the average theme."],
  ["leans-away", "Leans away", "Fans here like it less than the average theme."],
  ["classic", "Classic night", "A proven promo, left alone."],
  ["not-scored", "Not scored", "No theme match, so no reading."],
];

const city = (): string => (state.analysis?.market.label ?? "").split(",")[0]!.replace(/ (sample )?club$/, "");

/** The step log keeps its old counts after a pick, so the pick adds its own line with the new ones. */
function logChoice(night: string, theme: string): void {
  const vs = state.analysis!.nights.map(viewOf);
  const n = (f: NightView["fit"]): number => vs.filter((x) => x.fit === f).length;
  addTrace("Check: your choice", [step(new Date().toISOString(), "note", `Director chose ${theme} for "${night}": now ${fitSummary({ in: n("leans-in"), average: n("average"), away: n("leans-away"), notScored: n("not-scored"), classic: n("classic"), found: n("found") })}`)]);
}

/** Sponsor and lock, in words under the card: the card art is too small to carry them. */
function slotNote(v: NightView): HTMLElement | null {
  const n = v.night;
  if (!n.sponsor && !n.locked) return null;
  return h(
    "p",
    { class: "slot-note", "data-locked": n.locked ? "1" : null },
    n.locked ? h("span", { class: "sn-lock" }, icon("lock"), "Locked") : null,
    n.sponsor ? h("span", { class: "sn-sp" }, n.sponsor) : null,
  );
}

export function checkView(): HTMLElement {
  if (ui.loading) return loadingView();
  if (ui.error) {
    return h("section", { class: "scene" }, h("div", { class: "wrap narrow" }, h("h1", { class: "h2", tabindex: "-1" }, "That did not work"), h("p", { class: "error", role: "alert" }, ui.error), h("div", { class: "actions" }, h("a", { class: "btn pri", href: "#/" }, "Start again"))));
  }
  const a = state.analysis;
  if (!a) {
    navigate("#/sample");
    return h("div");
  }
  const views = a.nights.map(viewOf);
  const count = (f: NightView["fit"]): number => views.filter((v) => v.fit === f).length;
  const away = count("leans-away");
  const pendingViews = views.filter((v) => v.needsChoice);

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
  if (a.recordedAt) {
    const when = formatDateTime(a.recordedAt);
    notices.push(h("div", { class: "notice", role: "note", "data-testid": "recorded" }, icon("clock"), h("span", null, a.recordedOn ? `These scores were pulled from Qloo on ${when} and saved. "Re-check live" on any night asks Qloo again.` : `These scores were just pulled from Qloo (${when}). "Re-check live" on any night asks Qloo again.`)));
  }

  const months = new Map<string, NightView[]>();
  for (const v of views) {
    const key = v.night.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), v]);
  }

  const summary = fitSummary({ in: count("leans-in"), average: count("average"), away, notScored: count("not-scored"), classic: count("classic"), found: count("found") });
  const locked = views.filter((v) => v.night.locked);
  const result = checkResultLine(away, views.length, city());

  const asks = pendingViews.map((v) =>
    h(
      "div",
      { class: "ask", role: "group", "aria-label": `Which theme is "${v.night.theme}"?`, "data-ask": v.night.index },
      h("div", { class: "q" }, `${v.night.theme} (${formatDate(v.night.date)})`),
      h("p", null, "That name fits more than one theme. Which one did you mean? We never guess."),
      h(
        "div",
        { class: "ask-b" },
        v.night.candidates.map((id) =>
          h("button", { type: "button", class: "btn ghost sm", onclick: () => { state.choices[v.night.index] = id; logChoice(v.night.theme, themeById(id)?.label ?? id); window.dispatchEvent(new HashChangeEvent("hashchange")); } }, themeById(id)?.label ?? id),
        ),
      ),
    ),
  );

  const grid = h("div", { class: "grids" });
  for (const [key, vs] of months) {
    const name = MONTHS[Number(key.slice(5)) - 1]!;
    grid.append(
      h(
        "section",
        { class: "month", "aria-label": name },
        h("h2", { class: "month-tag" }, name),
        h("div", { class: "grid" }, vs.map((v) => {
          const c = makeCard(specOf(v));
          return h("div", { class: "slot" }, c, slotNote(v));
        })),
      ),
    );
  }
  grid.addEventListener("click", (e) => {
    const c = (e.target as Element).closest<HTMLElement>(".card");
    if (c) tap(c);
  });
  grid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const c = (e.target as Element).closest<HTMLElement>(".card");
    if (!c || e.target !== c) return;
    e.preventDefault();
    tap(c);
  });

  const deckL = h(
    "div",
    { class: "deck-l", id: "deckL" },
    h("div", { class: "eyebrow" }, "Step 1 of 3 \u00b7 Check"),
    h("h1", { class: "h2", tabindex: "-1" }, "Check: ", h("em", null, a.market.label)),
    h("p", { class: "check-line", "data-testid": "check-result" }, result),
    h("p", { class: "lede", "data-testid": "summary" }, summary),
    asks,
    notices,
    tally(views),
    h("div", { class: "legend", role: "list", "aria-label": "What the cards mean" }, LEGEND.map(([fit, word, text]) => h("div", { class: `lg${fit === "leans-away" ? " away" : ""}`, role: "listitem" }, gemChip(fit), h("span", null, h("b", null, `${word}: `), text)))),
    locked.length > 0
      ? h("div", { class: "locks" }, icon("lock"), h("span", null, h("b", null, lockedLine(locked.length)), `: ${locked.map((v) => v.night.theme).join(", ")}.`))
      : null,
    h("a", { class: "btn pri", href: "#/fix", "data-testid": "to-fix" }, away > 0 ? "See the fixes" : "Continue", icon("arrowRight")),
    pendingViews.length > 0 ? h("p", { class: "small" }, `${pendingViews.length} night${pendingViews.length === 1 ? " needs" : "s need"} your pick. Choose one above, or continue and leave ${pendingViews.length === 1 ? "it" : "them"} unscored.`) : null,
    h("p", { class: "small" }, "Taste data from Qloo, a company that measures what people like. Scores describe what this market leans toward. ", h("a", { href: "#/study" }, "See how we tested it")),
  );

  const section = h(
    "section",
    { class: "deck", id: "deck" },
    bokeh(),
    garland(),
    lamp(),
    h("div", { class: "wrap deck-in" }, deckL, h("div", { class: "deck-r" }, h("div", { class: "binder", id: "binder" }, h("div", { class: "rings", "aria-hidden": "true" }), grid))),
  );

  function tap(c: HTMLElement): void {
    const index = Number(c.dataset.index);
    if (c.dataset.fit === "pick") {
      const ask = deckL.querySelector<HTMLElement>(`[data-ask="${index}"]`);
      ask?.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
      ask?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
      return;
    }
    openCard(index, c);
  }

  onMount(() => {
    const ctx = routeContext();
    onCleanup(bindTilt(grid));
    const fitSticky = (): void => {
      if (window.innerWidth <= 1100) {
        deckL.style.top = "";
        return;
      }
      deckL.style.top = `${Math.max(Math.min(78, window.innerHeight - deckL.offsetHeight - 24), -(deckL.offsetHeight - window.innerHeight + 24))}px`;
    };
    fitSticky();
    window.addEventListener("resize", fitSticky);
    onCleanup(() => window.removeEventListener("resize", fitSticky));
    if (route.entering && !reduced()) {
      const g = grid.getBoundingClientRect();
      if (g.top < window.innerHeight * 0.85) ctx.add(() => dealIn(grid));
    }
  });
  return h("div", { class: "page" }, section, ridge());
}

/** Cards fly in from one pile and settle into their pockets. Skipped for reduced motion, and when the deck starts off screen. */
function dealIn(grid: HTMLElement): void {
  const slots = [...grid.querySelectorAll<HTMLElement>(".slot")];
  const g = grid.getBoundingClientRect();
  const px = g.left + g.width * 0.5, py = g.top + Math.min(g.height * 0.2, 260);
  const pos = slots.map((s) => {
    const r = s.getBoundingClientRect();
    return [px - (r.left + r.width / 2), py - (r.top + r.height / 2)] as const;
  });
  gsap.fromTo(slots, { x: (i: number) => pos[i]![0], y: (i: number) => pos[i]![1], rotation: () => rand(-38, 38), scale: 0.4, opacity: 0 }, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.85, stagger: 0.04, ease: "back.out(1.15)", clearProps: "transform,opacity" });
}

function loadingView(): HTMLElement {
  return h(
    "section",
    { class: "deck", "aria-busy": "true" },
    bokeh(),
    h(
      "div",
      { class: "wrap deck-in" },
      h("div", { class: "deck-l" }, h("div", { class: "eyebrow" }, "Step 1 of 3 · Check"), h("h1", { class: "h2", tabindex: "-1" }, "Checking ", h("em", null, "your calendar")), h("p", { class: "lede", role: "status" }, "Matching theme names and asking Qloo what this market leans toward. A few seconds.")),
      h("div", { class: "deck-r" }, h("div", { class: "binder" }, h("div", { class: "rings", "aria-hidden": "true" }), h("div", { class: "grid" }, Array.from({ length: 10 }, () => h("div", { class: "skeleton" }))))),
    ),
  );
}

// ---------- the Why: the card flips to its cardboard back ----------

const rel = (z: number | null): string => (z === null ? "n/a" : `${z >= 0 ? "+" : ""}${z.toFixed(2)}`);

function sourceLine(s: ThemeScoreOut, recheckedAt: string | null): string {
  if (recheckedAt) return `Re-checked live at ${formatDateTime(recheckedAt)}.`;
  if (s.source === "synthetic") return `Synthetic test data generated ${formatDateTime(s.fetchedAt)}. Not from Qloo.`;
  if (s.source === "cache") return `Saved result, pulled from Qloo on ${formatDateTime(s.fetchedAt)}. "Re-check live" asks Qloo again.`;
  return `Fetched from Qloo ${formatDateTime(s.fetchedAt)}.`;
}

const rechecked: Record<string, string> = {};
let showNumbers = false;
let recheckMessage = "";
let recheckBusy = false;

function backOf(v: NightView): BackSpec {
  const n = v.night;
  const s = v.score;
  const scored = !!s && s.label !== "not-scored";
  const fit: CardFit = v.needsChoice ? "pick" : v.fit;
  const reason = v.discovered ? `Qloo found this title among the top family ${v.discovered.type === "movie" ? "movies" : "shows"} for fans near ${city()}. It is not scored against the library, so there is no local-pull number.` : v.fit === "classic" ? CLASSIC_REASON : v.needsChoice ? `"${n.theme}" fits more than one theme. Pick one on the deck and it is scored.` : s?.reason ?? n.recognisedAs ? `We recognise ${n.recognisedAs}, but we don't have Qloo scores for it yet, so it's left alone.` : `"${n.theme}" is not one of the themes Qloo has local data for, so it is not scored. It stays as planned.`;
  return {
    no: n.index + 1,
    total: state.analysis!.nights.length,
    city: city(),
    title: v.swappedFrom ? swapName(n.theme, v.themeLabel) : n.theme,
    dateLine: `${formatDate(n.date)} · ${n.weekday}`,
    rows: scored ? s.entities.map((e) => ({ name: e.name, type: e.type, affinity: e.affinity })) : [],
    index: scored ? s.index : null,
    z: scored ? s.z : null,
    themeName: v.themeId ? (themeById(v.themeId)?.label ?? n.theme) : n.theme,
    fit,
    reason,
  };
}

function openCard(index: number, source: HTMLElement): void {
  showNumbers = false;
  recheckMessage = "";
  const build = (): HTMLElement => {
    const v = viewOf(state.analysis!.nights[index]!);
    return makeCard(specOf(v), { back: backOf(v), inert: true });
  };
  openWhy({
    index,
    source,
    card: build,
    repaint: (card) => {
      const v = viewOf(state.analysis!.nights[index]!);
      repaintCard(card, specOf(v), { back: backOf(v) });
    },
    info: () => whyInfo(index),
  });
}

function whyInfo(index: number): Child {
  const a = state.analysis!;
  const v = viewOf(a.nights[index]!);
  const n = v.night;
  const title = v.swappedFrom ? swapName(n.theme, v.themeLabel) : n.theme;
  const fit: CardFit = v.needsChoice ? "pick" : v.fit;
  const out: Child[] = [
    h("div", { class: "eyebrow" }, `No. ${String(n.index + 1).padStart(2, "0")} / ${String(a.nights.length).padStart(2, "0")} · ${n.weekday} ${formatDate(n.date)}${n.locked ? " · Locked" : ""}`),
    h("h2", { id: "why-title" }, title),
    h("div", null, fitChip(fit), n.locked ? h("p", { class: "small", style: "margin-top:8px" }, "This night is locked. It will not be swapped.") : null),
  ];
  if (v.swappedFrom) out.push(h("p", { class: "panel-box" }, `Swapped from ${v.swappedFrom}.`));

  if (v.fit === "classic") {
    out.push(h("p", { class: "panel-box" }, CLASSIC_REASON));
    return out;
  }
  if (v.discovered) {
    out.push(h("p", { class: "panel-box" }, `Qloo ranks ${v.discovered.name} among the top family ${v.discovered.type === "movie" ? "movies" : "shows"} for fans near ${city()}. It is not scored against the library, so there is no local-pull number: it was found, not measured.`));
    return out;
  }
  if (v.needsChoice) {
    out.push(h("p", { class: "panel-box" }, `"${n.theme}" fits more than one theme (${n.candidates.map((id) => themeById(id)?.label ?? id).join(" or ")}). Close this panel and pick one on the deck.`));
    return out;
  }
  if (!v.themeId || !v.score) {
    out.push(h("p", { class: "panel-box" }, n.recognisedAs ? `We recognise ${n.recognisedAs}, but we don't have Qloo scores for it yet, so it's left alone. It stays as planned.` : `"${n.theme}" is not one of the ${Object.keys(a.themes).length} themes we score with Qloo, so it is not scored. It stays as planned.`));
    return out;
  }
  const s = v.score;
  const theme = themeById(v.themeId)!;
  if (s.label === "not-scored") {
    out.push(h("p", { class: "panel-box" }, s.reason ?? "Not scored."));
  } else {
    out.push(
      h("p", { class: "why-index", "data-testid": "why-pull" }, h("b", null, "Local pull:"), ` ${pullWords(s.index)}. ${FIT_NAME[fit]}.`),
      h(
        "div",
        { class: "panel-box" },
        h("p", { "data-testid": "why-vs" }, h("b", null, `${theme.label} here:`), ` ${vsMarketsWords(s.z)}.`),
        s.score !== null && s.score >= 0.9 ? h("p", { class: "small" }, NEAR_TOP_NOTE) : null,
        h("p", null, marketLevelSentence(s.marketMeanZ)),
        h("p", { style: "font-weight:650" }, comparisonSentence(theme.label, s.label)),
      ),
    );
  }
  out.push(
    h("div", { class: "panel-box" }, h("h3", null, "What Qloo looked at"), h("ul", { class: "entity-list" }, s.entities.map((e) => h("li", null, `${e.name} (${e.type.replace("_", " ")})`)))),
  );

  const toggle = h("button", { type: "button", class: "toggle", "aria-expanded": String(showNumbers), "data-keep": "numbers", onclick: () => { showNumbers = !showNumbers; refreshWhy(); } }, icon("caretDown"), showNumbers ? "Hide the numbers" : "Show the numbers");
  out.push(toggle);
  if (showNumbers) {
    out.push(
      h(
        "div",
        { class: "panel-box" },
        h("p", { class: "small" }, METHOD_WORDS),
        h("p", { class: "small" }, "Taste match here, item by item:"),
        h("dl", { class: "kv" }, s.entities.flatMap((e) => [h("dt", null, e.name), h("dd", null, e.affinity === null ? "no reading" : e.affinity.toFixed(4))])),
        h(
          "dl",
          { class: "kv kv--sum" },
          h("dt", null, "This market's overall taste match (mean)"), h("dd", null, s.score === null ? "n/a" : s.score.toFixed(4)),
          h("dt", null, `Typical ballpark market (mean of ${s.ref?.n ?? "n/a"})`), h("dd", null, s.ref ? s.ref.mean.toFixed(4) : "n/a"),
          h("dt", null, "Spread between markets (SD)"), h("dd", null, s.ref ? s.ref.sd.toFixed(5) : "n/a"),
          h("dt", null, "z = (score - typical) / spread"), h("dd", null, rel(s.z)),
          h("dt", null, `This market's average z across ${s.scoredThemes} themes`), h("dd", null, rel(s.marketMeanZ)),
          h("dt", null, "Local pull = z - market average"), h("dd", null, rel(s.index)),
          h("dt", null, "Cut-offs for the index"), h("dd", null, "+0.50 / -0.50"),
        ),
        a.reference.synthetic ? h("p", { class: "small" }, "The typical-market numbers are a synthetic placeholder until the reference set is pulled.") : null,
      ),
    );
  }

  out.push(h("p", { class: "small", "data-testid": "why-footer" }, h("a", { href: "#/study" }, "See how we tested this")));
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
          type: "button", class: "btn gold sm", "data-testid": "recheck", "data-keep": "recheck", disabled: disabled ? "" : null,
          onclick: async () => {
            recheckBusy = true;
            recheckMessage = "Asking Qloo now...";
            refreshWhy();
            try {
              const r = await recheckTheme(v.themeId!);
              rechecked[v.themeId!] = new Date().toISOString();
              recheckMessage = r === "recent" ? "Checked with Qloo within the last day: same answer." : r === "changed" ? `Checked again: the answer changed to ${FIT_WORDS[state.analysis!.themes[v.themeId!]!.label]}. Earlier proposals were cleared.` : "Checked again: same answer.";
            } catch (err) {
              recheckMessage = err instanceof ApiFailure ? err.message : "Re-check failed. Try again.";
            }
            recheckBusy = false;
            refreshWhy();
            document.querySelector('[data-testid="recheck-message"]')?.scrollIntoView({ block: "nearest" });
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

