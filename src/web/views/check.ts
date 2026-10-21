import type { ThemeScoreOut } from "../../app/api-types";
import { bridgeSentence, classicReason, comparisonSentence, fitMeaning, fitWord, fitWordFor, marketLevelSentence, NEAR_TOP_NOTE, slightNote, vsMarketsWords, type FitLabel } from "../../app/score";
import { cityOfLabel } from "../../app/kind";
import { themeById } from "../../app/themes/artists";
import { dateWithYear, passedCount, seasonEyebrow } from "../../app/dates";
import { checkHeadline, cleanTitle, fitSummary, localDay, lockedLine } from "../../app/text";
import { ApiFailure } from "../api";
import { errorView } from "./errors";
import { fitChip, savedCopyBanner, syntheticBanner } from "../components";
import { formatDateTime, h, type Child } from "../dom";
import { recheckTheme, navigate } from "../flow";
import { bindTilt, gemChip, makeCard, repaintCard, specOf, type BackSpec, type CardFit } from "../foil/cards";
import { onCleanup, onMount, route, routeContext } from "../foil/lifecycle";
import { gsap, reduced } from "../foil/motion";
import { rand } from "../foil/rng";
import { bokeh, garland, lamp, ridge } from "../foil/scenery";
import { closeWhy, openWhy, refreshWhy } from "../foil/why";
import { icon } from "../icons";
import { step } from "../../app/trace";
import { addTrace, copy, state, swapTitle, ui, viewOf, type NightView } from "../store";

/** The link to The Study. The Study is real baseball data, so a venue or another sport says so instead of "how we tested it". */
const studyLinkText = (baseball: string): string => (state.kind === "venue" ? "We tested this on baseball, not concerts." : state.sport !== "baseball" ? `We tested this on baseball, not ${copy().sport}.` : baseball);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** The five (or six) ratings in one list: a colour chip, how many nights, the name and one plain line about what it means. */
function fitList(views: NightView[]): HTMLElement {
  const order: FitLabel[] = ["leans-in", "average", "leans-away", "classic", "not-scored", "found"];
  return h(
    "ul",
    { class: "fitlist", "aria-label": "What the cards mean" },
    order.flatMap((fit) => {
      const n = views.filter((v) => v.fit === fit).length;
      if (fit === "found" && n === 0) return [];
      const lean = views.filter((v) => v.fit === fit && v.slight).length;
      return [h("li", { class: `fl${fit === "leans-away" ? " away" : ""}`, "data-k": fit }, gemChip(fit), h("b", { class: "fl-n" }, String(n)), h("span", { class: "fl-t" }, h("b", null, fitWord(fit)), ` ${fitMeaning(fit, state.kind)}`, lean > 0 ? ` ${lean} of ${n === 1 ? "this" : "these"} only ${lean === 1 ? "leans" : "lean"} that way: the raw gap is tiny.` : ""))];
    }),
  );
}

/** The choice between the themes a name could mean. The same buttons sit in the ask box and in the "?" card's panel. */
function choiceButtons(n: NightView["night"], closeAfter = false): HTMLElement {
  return h(
    "div",
    { class: "ask-b" },
    n.candidates.map((id) =>
      h("button", { type: "button", class: "btn ghost sm", onclick: () => { state.choices[n.index] = id; logChoice(n.theme, themeById(id)?.label ?? id); if (closeAfter) closeWhy(false); window.dispatchEvent(new HashChangeEvent("hashchange")); } }, themeById(id)?.label ?? id),
    ),
  );
}

const city = (): string => cityOfLabel(state.analysis?.market.label ?? "");

/** The step log keeps its old counts after a pick, so the pick adds its own line with the new ones. */
function logChoice(night: string, theme: string): void {
  const vs = state.analysis!.nights.map(viewOf);
  const n = (f: NightView["fit"]): number => vs.filter((x) => x.fit === f).length;
  addTrace("Check: your pick", [step(new Date().toISOString(), "note", `You chose ${theme} for "${night}": now ${fitSummary({ in: n("leans-in"), average: n("average"), away: n("leans-away"), notScored: n("not-scored"), classic: n("classic"), found: n("found") })}`)]);
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
    return errorView();
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
  const saved = savedCopyBanner();
  if (saved) notices.push(saved);
  if (state.kind === "club" && state.sport !== "baseball" && state.sampleId) notices.push(h("div", { class: "notice", role: "note", "data-testid": "sport-note" }, icon("info"), h("span", null, h("strong", null, "A made-up sample. "), `This ${copy().sport} calendar is one we wrote for a sample team. The dates, theme nights and sponsors are invented, and it is not any real team's schedule.`)));
  if (state.kind === "venue") notices.push(h("div", { class: "notice", role: "note", "data-testid": "venue-note" }, icon("info"), h("span", null, h("strong", null, "A made-up sample. "), "This summer concert calendar is one we wrote for a sample amphitheatre. The acts, dates and sponsors are invented, and it is not any real venue's schedule.")));
  if (state.parseErrors.length > 0) {
    notices.push(
      h(
        "div",
        { class: "notice notice--warn", role: "note" },
        icon("warning"),
        h("div", null, h("strong", null, `${state.parseErrors.length} row${state.parseErrors.length === 1 ? " was" : "s were"} skipped. `), "The rest were checked. ", state.sampleId ? null : h("a", { href: "#/own", "data-testid": "back-to-rows" }, "Back to my rows"), h("ul", null, state.parseErrors.map((e) => h("li", null, `Line ${e.line}: ${e.message}`)))),
      ),
    );
  }
  const months = new Map<string, NightView[]>();
  for (const v of views) {
    const key = v.night.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), v]);
  }

  const locked = views.filter((v) => v.night.locked);
  const slightAway = views.filter((v) => v.fit === "leans-away" && v.slight).length;
  const result = checkHeadline({ clearAway: away - slightAway, slightAway, total: views.length, graded: count("leans-in") + count("average") + away, classic: count("classic"), notScored: count("not-scored") }, city(), copy().night, copy().nights);

  const asks = pendingViews.map((v) =>
    h(
      "div",
      { class: "ask", role: "group", "aria-label": `Which theme is "${v.night.theme}"?`, "data-ask": v.night.index },
      h("div", { class: "q" }, `${dateWithYear(v.night.date)}: score it as ${v.night.candidates.map((id) => themeById(id)?.label ?? id).join(" or ")}?`),
      h("p", null, `"${v.night.theme}" fits more than one theme. We never guess.`),
      choiceButtons(v.night),
    ),
  );
  // After a pick the choice stays on screen as one line, with a way back.
  const picked = views.filter((v) => v.night.resolution.kind === "ambiguous" && state.choices[v.night.index] !== undefined).map((v) =>
    h("p", { class: "picked-line", "data-testid": "picked-line" }, `${dateWithYear(v.night.date)} scored as ${v.themeLabel}: ${fitWordFor(v.fit, v.slight).toLowerCase()}. `,
      h("button", { type: "button", class: "linkbtn", onclick: () => { delete state.choices[v.night.index]; window.dispatchEvent(new HashChangeEvent("hashchange")); } }, "Change")),
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

  const passed = passedCount(a.nights.map((n) => n.date), localDay());
  const deckL = h(
    "div",
    { class: "deck-l", id: "deckL" },
    h(
      "div",
      { class: "dl-top" },
      h("div", { class: "eyebrow" }, "Step 1 of 3 \u00b7 Check"),
      h("h1", { class: "h2", tabindex: "-1" }, "Check: ", h("em", null, a.market.label)),
      h("div", { class: "eyebrow season-line", "data-testid": "season-span" }, seasonEyebrow(a.nights.map((n) => n.date), copy().season)),
      h("p", { class: "check-line", "data-testid": "summary" }, result),
      passed > 0 ? h("p", { class: "small past-note", "data-testid": "past-note" }, `${passed} of these ${copy().nights} ${passed === 1 ? "has" : "have"} already passed.`) : null,
      asks,
      picked,
      pendingViews.length > 0 ? h("p", { class: "small pick-hint" }, `${pendingViews.length} ${pendingViews.length === 1 ? `${copy().night} needs` : `${copy().nights} need`} your pick. Choose one above, or continue and leave ${pendingViews.length === 1 ? "it" : "them"} ungraded.`) : null,
      h("a", { class: "btn pri", href: "#/fix", "data-testid": "to-fix" }, away > 0 ? "See the fixes" : "Continue", icon("arrowRight")),
      notices,
    ),
    h(
      "div",
      { class: "dl-rest" },
      fitList(views),
      locked.length > 0
        ? h("div", { class: "locks" }, icon("lock"), h("span", null, h("b", null, lockedLine(locked.length, copy().night)), `: ${locked.map((v) => v.night.theme).join(", ")}.`))
        : null,
      h("p", { class: "small" }, "Taste data from Qloo, a company that measures what people like. Ratings describe taste, not ticket sales. ", h("a", { href: "#/study" }, studyLinkText("See how we tested it"))),
    ),
  );

  const section = h(
    "section",
    { class: "deck", id: "deck" },
    bokeh(),
    garland(),
    lamp(),
    h("div", { class: "wrap deck-in" }, deckL, h("div", { class: "deck-r" }, h("p", { class: "tap-line" }, "Tap any card to see why it got its rating."), h("div", { class: "binder", id: "binder" }, grid))),
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
      h("div", { class: "deck-l" }, h("div", { class: "eyebrow" }, "Step 1 of 3 · Check"), h("h1", { class: "h2", tabindex: "-1" }, "Checking ", h("em", null, "your calendar")), h("p", { class: "lede", role: "status" }, "Matching theme names and asking Qloo what people here like. A few seconds.")),
      h("div", { class: "deck-r" }, h("div", { class: "binder" }, h("div", { class: "grid" }, Array.from({ length: 10 }, () => h("div", { class: "skeleton" }))))),
    ),
  );
}

// ---------- the Why: the card flips to its cardboard back ----------

/** "3.1 normal gaps below other towns": the same number, with its unit and direction in words. */
const gaps = (z: number | null, ref: string): string => (z === null ? "n/a" : Math.abs(z) < 0.05 ? `level with ${ref}` : `${Math.abs(z).toFixed(1)} normal gaps ${z < 0 ? "below" : "above"} ${ref}`);

function sourceLine(s: ThemeScoreOut): string {
  if (s.source === "synthetic") return `Synthetic test data generated ${formatDateTime(s.fetchedAt)}. Not from Qloo.`;
  // One timestamp per card: after "Get fresh data" the message below carries the new time, so this line steps aside.
  return rechecked[s.themeId] ? "" : `Checked ${formatDateTime(s.fetchedAt)}.`;
}

const rechecked: Record<string, string> = {};
let showNumbers = false;
let recheckMessage = "";
let recheckBusy = false;

/** Why a night has no rating, in plain words. */
function noDataReason(n: NightView["night"]): string {
  return n.recognisedAs ? `${n.recognisedAs} is a theme we know, but we have no data for it yet, so it stays as planned.` : `We have no data for ${n.theme}, so it stays as planned.`;
}

function backOf(v: NightView): BackSpec {
  const n = v.night;
  const s = v.score;
  const scored = !!s && s.label !== "not-scored";
  const pool = n.pool && n.pool.z !== null ? n.pool : null;
  const fit: CardFit = v.needsChoice ? "pick" : v.fit;
  const reason = v.discovered
    ? `People in ${city()} like ${v.discovered.name} more than people in most ${copy().markets} do.`
    : v.fit === "classic"
      ? classicReason(state.kind, state.sport)
      : v.needsChoice
        ? `"${n.theme}" fits more than one theme. Pick one above and it gets a rating.`
        : (s?.reason ?? noDataReason(n));
  const checkedAt = s?.fetchedAt ?? state.analysis!.recordedAt;
  return {
    no: n.index + 1,
    total: state.analysis!.nights.length,
    city: city(),
    title: v.swappedFrom ? swapTitle(n.theme, v.themeLabel) : n.theme,
    dateLine: `${dateWithYear(n.date)} · ${n.weekday}`,
    rows: scored ? s.entities.map((e) => ({ name: e.name, type: e.type, affinity: e.affinity })) : pool ? [{ name: pool.name, type: pool.type, affinity: pool.affinity }] : [],
    index: scored ? s.index : pool ? pool.z : null,
    z: scored ? s.z : pool ? pool.zRaw : null,
    themeName: pool ? pool.name : v.themeId ? (themeById(v.themeId)?.label ?? n.theme) : n.theme,
    fit,
    ...(v.slight ? { slight: true } : {}),
    reason,
    checked: checkedAt && (scored || pool) ? formatDateTime(checkedAt) : null,
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
  const title = v.swappedFrom ? swapTitle(n.theme, v.themeLabel) : n.theme;
  const fit: CardFit = v.needsChoice ? "pick" : v.fit;
  const out: Child[] = [
    h("div", { class: "eyebrow" }, `No. ${String(n.index + 1).padStart(2, "0")} / ${String(a.nights.length).padStart(2, "0")} · ${n.weekday} ${dateWithYear(n.date)}${n.locked ? " · Locked" : ""}`),
    h("h2", { id: "why-title" }, title),
    h("div", null, fitChip(fit, v.slight), n.locked ? h("p", { class: "small", style: "margin-top:8px" }, `This ${copy().night} is locked. It will not be swapped.`) : null),
  ];
  if (v.swappedFrom) out.push(h("p", { class: "panel-box" }, `Swapped from ${v.swappedFrom}.`));

  if (v.fit === "classic") {
    out.push(h("p", { class: "panel-box" }, classicReason(state.kind, state.sport)));
    return out;
  }
  if (v.discovered) {
    out.push(h("p", { class: "panel-box" }, `People in ${city()} like ${v.discovered.name} more than people in most ${copy().markets} do. It isn't one of our themes, so it has no fit rating: Homestand found it by comparing ${city()} with 40 other towns.`));
    return out;
  }
  if (v.needsChoice) {
    out.push(h("p", { class: "panel-box" }, `"${n.theme}" fits more than one theme (${n.candidates.map((id) => themeById(id)?.label ?? id).join(" or ")}). Pick one here.`), choiceButtons(n, true));
    return out;
  }
  if (n.pool) {
    out.push(h("p", { class: "panel-box" }, n.pool.z === null ? `${n.pool.name} is a family title we know, but Qloo had no data for it near ${city()}, so it has no rating.` : `${n.pool.name} is rated from how much people near ${city()} like it, compared with their other family titles. It isn't one of our themes, so Homestand leaves it as planned and doesn't propose a swap for it.`));
    if (n.pool.z !== null) out.push(h("div", { class: "panel-box" }, h("h3", null, "What Qloo looked at"), h("ul", { class: "entity-list" }, h("li", null, `${n.pool.name} (${n.pool.type.replace("_", " ")})`))));
    return out;
  }
  if (!v.themeId || !v.score) {
    out.push(h("p", { class: "panel-box" }, noDataReason(n)));
    return out;
  }
  const s = v.score;
  const theme = themeById(v.themeId)!;
  if (s.label === "not-scored") {
    out.push(h("p", { class: "panel-box" }, s.reason ?? "We have no data for this one."));
  } else {
    // The card back and this line say the one plain thing: how the town rates it against its own other themes. The comparison with other towns is under "Show the numbers".
    out.push(h("p", { class: "sr-only", "data-testid": "fit-line" }, comparisonSentence(theme.label, s.label, city(), state.kind)));
  }
  if (v.slight && s.gap !== null && s.gap !== undefined) out.push(h("p", { class: "panel-box", "data-testid": "slight-note" }, slightNote(s.gap)));
  out.push(
    h("div", { class: "panel-box" }, h("h3", null, "What Qloo looked at"), h("ul", { class: "entity-list" }, s.entities.map((e) => h("li", null, `${cleanTitle(e.name)} (${e.type.replace("_", " ")})`)))),
  );

  const toggle = h("button", { type: "button", class: "toggle", "aria-expanded": String(showNumbers), "data-keep": "numbers", onclick: () => { showNumbers = !showNumbers; refreshWhy(); } }, icon("caretDown"), showNumbers ? "Hide the numbers" : "Show the numbers");
  out.push(toggle);
  if (showNumbers) {
    const vsOthers = s.z === null ? null : `${theme.label} here: ${vsMarketsWords(s.z, state.kind)}.`;
    out.push(
      h(
        "div",
        { class: "panel-box" },
        h("p", { class: "small" }, s.ref && s.ref.mean >= 0.95 ? `Raw scores for this ${state.kind === "venue" ? "act" : "theme"} sit near ${s.ref.mean.toFixed(2)} everywhere, so we compare the small gaps. ` : `Raw scores differ only a little between ${copy().markets}, so we compare the gaps. `, h("a", { href: "#/study" }, "How this works and how we tested it")),
        vsOthers ? h("p", { "data-testid": "vs-others" }, vsOthers, bridgeSentence(s.label, s.z, city(), state.kind) ? ` ${bridgeSentence(s.label, s.z, city(), state.kind)}` : "") : null,
        h("p", { class: "small" }, marketLevelSentence(s.marketMeanZ, state.kind)),
        s.score !== null && s.score >= 0.9 && s.ref && s.ref.sd < 0.01 ? h("p", { class: "small", "data-testid": "near-top-note" }, NEAR_TOP_NOTE) : null,
        Math.abs(s.index ?? 0) > 4 || Math.abs(s.z ?? 0) > 4 ? h("p", { class: "small", "data-testid": "tiny-sd-note" }, `Differences between ${copy().markets} are tiny for this ${state.kind === "venue" ? "act" : "title"}, so the number looks bigger than it is.`) : null,
        h("p", { class: "small" }, "Taste match here, item by item:"),
        h("dl", { class: "kv" }, s.entities.flatMap((e) => [h("dt", null, cleanTitle(e.name)), h("dd", null, e.affinity === null ? "no reading" : e.affinity.toFixed(4))])),
        h(
          "dl",
          { class: "kv kv--sum" },
          h("dt", null, `This ${state.kind === "venue" ? "act" : "theme"}'s score here`), h("dd", null, s.score === null ? "n/a" : s.score.toFixed(4)),
          h("dt", null, `Average of ${s.ref?.n ?? "n/a"} other ${copy().markets}`), h("dd", null, s.ref ? s.ref.mean.toFixed(4) : "n/a"),
          h("dt", null, `Normal gap between ${copy().markets}`), h("dd", null, s.ref ? s.ref.sd.toFixed(5) : "n/a"),
          h("dt", null, `${city()} vs. other ${copy().markets}`), h("dd", null, gaps(s.z, `other ${copy().markets}`)),
          h("dt", null, `${city()}'s usual`), h("dd", null, gaps(s.marketMeanZ, `other ${copy().markets}`)),
          h("dt", null, `${theme.label} vs. ${city()}'s usual`), h("dd", null, gaps(s.index, `${city()}'s usual`)),
          s.gap !== null && s.gap !== undefined ? h("dt", null, "Raw gap behind the label") : null, s.gap !== null && s.gap !== undefined ? h("dd", { "data-testid": "raw-gap" }, `${s.gap >= 0 ? "+" : "-"}${Math.abs(s.gap).toFixed(4)}`) : null,
        ),
        h("p", { class: "small" }, `Weak fit: at least 0.5 normal gaps below ${city()}'s usual. Strong fit: at least 0.5 above it. If the raw gap behind that is under 0.01 it reads "Leans weak" or "Leans strong" instead.`),
        h("p", { class: "small" }, `${city()}'s usual is the average over the ${state.kind === "venue" ? "acts" : "themes"} Qloo had data for here.`),
        a.reference.synthetic ? h("p", { class: "small" }, `The typical-${copy().place} numbers are a synthetic placeholder until the comparison set is pulled.`) : null,
      ),
    );
  }

  out.push(h("p", { class: "small", "data-testid": "why-footer" }, h("a", { href: "#/study" }, studyLinkText("See how we tested this"))));
  const caps = a.caps;
  const disabled = caps.recheckDisabled || recheckBusy;
  out.push(
    h(
      "div",
      { class: "panel-box" },
      sourceLine(s) ? h("p", { class: "small", "data-testid": "source-line" }, sourceLine(s)) : null,
      h(
        "button",
        {
          type: "button", class: "btn gold sm", "data-testid": "recheck", "data-keep": "recheck", disabled: disabled ? "" : null,
          onclick: async () => {
            recheckBusy = true;
            recheckMessage = "Getting fresh data...";
            refreshWhy();
            try {
              const r = await recheckTheme(v.themeId!);
              rechecked[v.themeId!] = new Date().toISOString();
              const at = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
              recheckMessage = r === "changed" ? `Fresh data at ${at}: changed, now ${fitWordFor(state.analysis!.themes[v.themeId!]!.label, state.analysis!.themes[v.themeId!]!.slight)}. Earlier swaps were cleared.` : `Fresh data at ${at}: same result.`;
            } catch (err) {
              recheckMessage = err instanceof ApiFailure ? err.message : "Getting fresh data failed. Try again.";
            }
            recheckBusy = false;
            refreshWhy();
            document.querySelector('[data-testid="recheck-message"]')?.scrollIntoView({ block: "nearest" });
            window.dispatchEvent(new HashChangeEvent("hashchange"));
          },
        },
        icon("refresh"),
        "Get fresh data",
      ),
      caps.recheckDisabled ? h("p", { class: "small" }, "Fresh data is switched off for today because the daily allowance is used up. The saved result above is still good.") : null,
      recheckMessage ? h("p", { class: "small", role: "status", "data-testid": "recheck-message" }, recheckMessage) : null,
    ),
  );
  return out;
}

