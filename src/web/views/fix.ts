import type { TraceStep } from "../../app/trace";
import { shortDate } from "../../app/dates";
import { cleanTitle } from "../../app/text";
import { fitWord, pullBand, type FitLabel } from "../../app/score";
import { themeById } from "../../app/themes/artists";
import { openDrawer, syntheticBanner } from "../components";
import { h, localizeDates, type Child } from "../dom";
import { ensureProposals, navigate } from "../flow";
import { makeCard, setFlip, specForSwap, specOf, flipper, type CardSpec } from "../foil/cards";
import { onCleanup, onMount, onResize, routeContext } from "../foil/lifecycle";
import { gsap, reduced, sleep } from "../foil/motion";
import { packEl } from "../foil/pack";
import { icon } from "../icons";
import type { ActsOut, ProposeResponse } from "../../app/api-types";
import { worthABooking } from "../../app/acts";
import { GENRE_WORDS } from "../../app/themes/library";
import { cityOfLabel } from "../../app/kind";
import { worthAnIdea } from "../../app/discovery";
import { noSwapLine, type Discovered } from "../../app/propose/propose";
import { approvedSwaps, copy, effective, invalidateProposals, logYou, pack, saveWork, shownAngles, state, swapTitle, ui, viewOf, type ShownProposal } from "../store";

const rerender = (): void => void window.dispatchEvent(new HashChangeEvent("hashchange"));
const label = (id: string): string => themeById(id)?.label ?? id;
/** The badge on a best-option swap: the honest fallback when nothing in the night's audience is a strong fit. */
const bestLabel = (p: ShownProposal): string => `Best ${themeById(p.fromThemeId)?.audience === "kids" ? "kids" : "family"} option here`;
/** Colour of a fit reading by its band: red below the town's usual, silver about usual, gold above. */
const bandClass = (z: number | null): "neg" | "mid" | "pos" => {
  const b = pullBand(z);
  return b === "below" || b === "well below" ? "neg" : b === "above" || b === "well above" ? "pos" : "mid";
};
const toLabel = (p: ShownProposal): string => p.discovered?.name ?? label(p.toThemeId);
/** The rating of a theme from its fit number: "Strong fit", "Average fit" or "Weak fit". */
const ratingWord = (z: number | null): string => {
  const b = pullBand(z);
  return b === null ? "No data" : b === "about" ? "Average fit" : b === "above" || b === "well above" ? "Strong fit" : "Weak fit";
};
/** The rating of the swap's new theme: "Local favorite" for a title Qloo found. */
const toRating = (p: ShownProposal): string => (p.discovered ? fitWord("found") : fitWord(p.to.label as FitLabel));
const TYPE_WORDS: Record<string, string> = { tv_show: "TV show", movie: "movie", artist: "artist", book: "book", brand: "brand" };

/** Where the carousel is, kept across redraws so a re-render never tears the pack again. */
const stage = { forPropose: null as object | null, opened: false, cur: 0 };
/** Mirrors the carousel position into the saved work, so a reload puts the director back where they were. */
const syncPack = (): void => {
  pack.opened = stage.opened;
  pack.cur = stage.cur;
  saveWork();
};

export function fixView(): HTMLElement {
  const a = state.analysis;
  if (!a) {
    navigate("#/sample");
    return h("div");
  }
  if (!state.propose && !ui.proposeError) {
    void ensureProposals();
    return h(
      "section",
      { class: "fix", "aria-busy": "true" },
      h(
        "div",
        { class: "wrap" },
        h("div", { class: "fix-head" }, h("div", null, h("div", { class: "eyebrow" }, "Step 2 of 3 · Fix"), h("h1", { class: "h2", tabindex: "-1" }, "Working out ", h("em", null, "the fixes")), h("p", { class: "lede", role: "status" }, "Checking each swap against your locks, dates and audience."))),
        h("div", { class: "fix-grid" }, h("div", { class: "stage2" }, h("div", { class: "pack-wrap" }, packEl("div", "", state.kind === "venue" ? "offers · sealing" : "swaps · sealing", copy().season === "season" ? undefined : "Summer offers", state.kind === "venue"))), h("aside", { class: "agent" }, h("div", { class: "ag-h" }, h("i"), "How Homestand decided"), h("div", { class: "skeleton", style: "min-height:160px;margin-top:12px" }))),
      ),
    );
  }
  if (ui.proposeError || !state.propose) {
    return h("section", { class: "scene" }, h("div", { class: "wrap narrow" }, h("h1", { class: "h2", tabindex: "-1" }, "That did not work"), h("p", { class: "error", role: "alert" }, ui.proposeError ?? "Try again."), h("div", { class: "actions" }, h("button", { type: "button", class: "btn pri", onclick: () => { ui.proposeError = null; rerender(); } }, "Try again"), h("a", { class: "btn ghost", href: "#/check" }, "Back to Check"))));
  }
  const p = state.propose;
  if (stage.forPropose !== p) Object.assign(stage, { forPropose: p, opened: pack.opened, cur: Math.min(pack.cur, Math.max(0, p.proposals.length - 1)) });
  const swaps = p.proposals;
  const synth = syntheticBanner();

  const doneMsg = h("p", { role: "status", "data-testid": "fix-status" });
  const doneBar = h("div", { class: "fix-done" }, doneMsg, h("a", { class: "btn pri", href: "#/send", "data-testid": "to-send" }, "Send the revised calendar", icon("arrowRight")));
  const paintDone = (): void => {
    const decided = swaps.filter((x) => state.decisions[x.id]).length;
    const ok = approvedSwaps().length;
    doneMsg.textContent = `${ok} approved, ${decided - ok} rejected, ${swaps.length - decided} not decided (they stay as planned).`;
  };
  paintDone();

  const stageEl = h("div", { class: "stage2", id: "stage2" });
  const agent = h("aside", { class: "agent", id: "agent", "aria-live": "polite" }, h("div", { class: "ag-h" }, h("i"), "How Homestand decided"), h("div", { class: "ag-b", id: "steps" }));

  const settings = h(
    "details",
    { class: "advanced", "data-testid": "advanced", open: state.allowDuplicates || ui.dupesNote ? "" : null },
    h("summary", null, icon("caretDown"), "Settings and details"),
    h(
      "div",
      { class: "advanced-body" },
      h("button", { type: "button", class: "btn ghost sm", "data-testid": "open-trace", onclick: openTrace }, icon("list"), "Every step"),
      h(
        "label",
        { class: "check-l" },
        h("input", {
          type: "checkbox", checked: state.allowDuplicates ? "" : null, "data-testid": "allow-dupes",
          onchange: (e: Event) => {
            // Remember what the swaps were, so the screen can say when allowing repeats changed nothing.
            ui.dupesNote = null;
            ui.dupesBefore = JSON.stringify(state.propose?.proposals.map((x) => x.toThemeId) ?? []);
            state.allowDuplicates = (e.target as HTMLInputElement).checked;
            invalidateProposals();
            saveWork();
            rerender();
          },
        }),
        state.kind === "venue" ? `Let an act repeat in the ${copy().season}` : `Let a theme repeat in the ${copy().season}`,
      ),
      h("span", { class: "check-note" }, `Off by default: each theme is used once, so two weak ${copy().nights} never get the same replacement.`),
      ui.dupesNote ? h("p", { class: "dupes-note", role: "status", "data-testid": "dupes-note" }, ui.dupesNote) : null,
    ),
  );

  const lead = swaps.length > 0 && state.kind === "venue" ? `${swaps.length} offer${swaps.length === 1 ? "" : "s"} ready: here is who to send an offer to instead of each weak date. Nothing changes until you approve it. Locked dates are never touched, and every date keeps its sponsor.` : swaps.length > 0 ? `${swaps.length} swap${swaps.length === 1 ? "" : "s"} proposed. Nothing changes until you approve it. Locked ${copy().nights} are never swapped. Every swap keeps its date and sponsor.` : "Nothing needs swapping.";
  const section = h(
    "section",
    { class: "fix", id: "fix" },
    h(
      "div",
      { class: "wrap" },
      h("div", { class: "fix-head" }, h("div", null, h("div", { class: "eyebrow" }, "Step 2 of 3 · Fix"), h("h1", { class: "h2", tabindex: "-1" }, "Fix: ", h("em", null, `the weak ${copy().nights}`)), h("p", { class: "lede" }, lead))),
      synth,
      swaps.length > 0 ? h("div", { class: "fix-grid" }, stageEl, agent) : null,
      doneBar,
      state.kind === "venue" ? actsPanel(p.acts, a.market.label) : ideasPanel(p.discovery, a.market.label),
      settings,
      shownAngles().length > 0 ? anglesSection() : null,
      p.unfixed.length > 0 ? unfixedBlock(p.unfixed) : null,
    ),
  );

  if (swaps.length > 0) onMount(() => new FixStage(stageEl, agent, swaps, paintDone).mount());
  return h("div", { class: "page" }, section);
}

/** The locked-night ideas. Redrawn when the director switches a swap, so an act or theme that has become a swap is never also offered as an add-on. */
function anglesSection(): HTMLElement {
  const venue = state.kind === "venue";
  const city = cityOfLabel(state.analysis!.market.label);
  if (venue) {
    return h("section", { class: "sect side", id: "angles" },
      h("h2", null, "Locked headliners: an opener idea"),
      h("p", { class: "small" }, `Their fans near ${city} also like these acts.`),
      h("ul", { class: "opener-list" }, shownAngles().map((x) => h("li", { "data-testid": "angle" }, h("b", null, openerLine(x).split(" \u2192 ")[0]!), ` \u2192 ${openerLine(x).split(" \u2192 ")[1]}`))),
    );
  }
  return h("section", { class: "sect side", id: "angles" }, h("h2", null, "Locked nights: an idea for the sponsor"), h("div", { class: "side-list" }, shownAngles().map((x) => {
    const [head, body, extra] = clubAngleParts(x, city);
    return sideRow(x.index, "lock", h("div", { class: "panel-box", "data-testid": "angle" }, h("p", { class: "swap-line" }, icon("lock"), head), h("p", null, body), extra ? h("p", { class: "small" }, extra) : null));
  })));
}

/** "Dave Matthews Band (May 7) \u2192 opener idea: Umphrey's McGee". */
export function openerLine(x: { themeId: string; toThemeId: string; date: string; act?: { name: string } }): string {
  return `${label(x.themeId)} (${shortDate(x.date).replace(/^\w{3} /, "")}) \u2192 opener idea: ${x.act ? x.act.name : x.toThemeId !== x.themeId ? label(x.toThemeId) : "a pre-show playlist or promo tie-in"}`;
}

/** One locked night's sponsor idea in three plain pieces: the date and theme, the idea, and what fans also like. */
export function clubAngleParts(x: { themeId: string; toThemeId: string; date: string; sponsor: string }, city: string): [string, string, string] {
  const theme = label(x.themeId);
  const also = x.toThemeId !== x.themeId ? label(x.toThemeId) : "";
  return [`${shortDate(x.date)}: ${theme}`, `Give ${x.sponsor || "the sponsor"} a moment: a PA read, the first pitch, or a ${theme} giveaway.`, also ? `Fans of ${theme} near ${city} also like ${also}, so a small ${also} touch fits too.` : ""];
}

function repaintAngles(): void {
  const el = document.getElementById("angles");
  if (el) el.replaceWith(anglesSection());
}

/** The family titles that stand out most in this town, best first, up to three. Only big names that clear the Strong fit bar. */
export function ideaTitles(d: { movies: Discovered[]; shows: Discovered[] }, max = 3): string[] {
  return [...d.movies, ...d.shows].filter((x) => x.major === true && worthAnIdea(x)).sort((a, b) => (b.z ?? 0) - (a.z ?? 0) || a.name.localeCompare(b.name)).slice(0, max).map((x) => x.name);
}

function ideasPanel(d: ProposeResponse["discovery"], marketLabel: string): HTMLElement | null {
  if (!d) return null;
  const titles = ideaTitles(d);
  if (titles.length === 0) return null;
  const city = cityOfLabel(marketLabel);
  return h(
    "section",
    { class: "ideas", "data-testid": "ideas", "aria-label": `Family movies ${city} likes more than most towns` },
    h("h2", null, `Family movies ${city} likes more than most towns. Use one for a family night.`),
    h("ul", { class: "idea-chips" }, titles.map((t) => h("li", { class: "idea" }, t))),
  );
}

/** Venue runs: the acts that stand out most in this city, best first, up to six. Only acts that clear the Strong fit bar and are nationally well known. */
export function actIdeas(d: ActsOut, max = 6): Discovered[] {
  return d.acts.filter(worthABooking).sort((a, b) => (b.z ?? 0) - (a.z ?? 0) || a.name.localeCompare(b.name)).slice(0, max);
}

function actsPanel(d: ActsOut | null | undefined, marketLabel: string): HTMLElement | null {
  if (!d) return null;
  const city = cityOfLabel(marketLabel);
  const acts = actIdeas(d);
  if (acts.length === 0) {
    return h("section", { class: "ideas ideas--lead", "data-testid": "ideas", "aria-label": `Touring acts in ${city}` }, h("h2", null, `Touring acts in ${city}`), h("p", { class: "ideas-lede", "data-testid": "ideas-note" }, `None of the ${d.poolSize} acts we checked stands out in ${city} right now. That happens, and we say so rather than pad the list.`));
  }
  return h(
    "section",
    { class: "ideas ideas--lead", "data-testid": "ideas", "aria-label": `Acts ${city} likes more than most cities` },
    h("h2", null, `Acts ${city} likes more than most cities`),
    h("p", { class: "ideas-lede" }, "A talent buyer's shortlist: well-known acts this city likes more than most cities do. Offer one of them an open date."),
    h("ul", { class: "idea-chips" }, acts.map((x) => h("li", { class: "idea" }, x.name, x.genre ? h("small", null, ` · ${GENRE_WORDS[x.genre]}`) : null))),
  );
}

/** One compact block for every night that could not be fixed, with one shared explanation (worded for the case) instead of a card each. */
function unfixedBlock(list: ProposeResponse["unfixed"]): HTMLElement {
  const young = list.filter((u) => u.reason.startsWith("No family theme")).length;
  const city = cityOfLabel(state.analysis!.market.label);
  const these = list.length === 1 ? `this ${copy().night}` : `these ${list.length} ${copy().nights}`;
  const c = list.find((u) => u.counts)?.counts;
  const what = young === list.length ? "a kids' night" : `this ${copy().night}`;
  const why = c
    ? `No swap for ${these}. ${noSwapLine(c, city, state.kind === "venue").replace(/^No swap: /, "").replace(`wrong for this ${copy().night}`, `wrong for ${what}`)}`
    : `No swap for ${these}: nothing on our list is a strong fit in ${city} that passes the rules, so ${list.length === 1 ? "it stays" : "they stay"} as planned.`;
  return h(
    "section",
    { class: "sect nofix", "data-testid": "unfixed-block" },
    h("h2", null, `Could not fix: ${list.length} ${list.length === 1 ? copy().night : copy().nights}`),
    h("p", { class: "nofix-why" }, why),
    h("p", { class: "next-step" }, state.sampleId ? "Next step: use your own calendar to test other themes." : `Next step: keep the original ${copy().nights}, or change one in your calendar and check again.`),
    h(
      "ul",
      { class: "nofix-list" },
      list.map((u) => {
        const n = state.analysis!.nights[u.index]!;
        return h("li", null, h("b", null, shortDate(u.date)), ` ${n.theme}${n.sponsor ? ` · ${n.sponsor}` : ""}`, null);
      }),
    ),
  );
}

/** A card for a night the agent could not change, beside the plain reason. */
function sideRow(index: number, kind: "lock" | "nofix", body: HTMLElement): HTMLElement {
  const v = viewOf(state.analysis!.nights[index]!);
  const extra = kind === "lock" ? [sealed()] : [h("div", { class: "stamp" }, "COULD NOT", h("br"), "FIX")];
  const c = makeCard(specOf(v), { inert: true, extra });
  c.dataset.notilt = "1";
  return h("div", { class: "side-row" }, h("div", { class: "side-card" }, c), body);
}

function sealed(): HTMLElement {
  const lock = document.createElement("template");
  lock.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="#3a2504" stroke-width="1.8"/><rect x="3" y="7" width="10" height="8" rx="1.8" fill="#3a2504"/></svg>';
  return h("div", { class: "seal" }, h("span", null, lock.content.firstElementChild, "Locked"));
}

interface Slide {
  top: ShownProposal;
  el: HTMLElement;
  lift: HTMLElement;
  card: HTMLElement;
}

/** The sealed foil pack, the swap carousel, the pinned date and sponsor, and the agent stream beside it. */
class FixStage {
  private slides: Slide[] = [];
  private busy = false;
  /** The swap whose full stream is on screen, as `id:theme`. */
  private painted: string | null = null;
  private alive = true;
  private tok = 0;
  private slidesEl!: HTMLElement;
  private console!: HTMLElement;
  private dashes!: HTMLElement;
  private prev!: HTMLButtonElement;
  private next!: HTMLButtonElement;
  private carousel!: HTMLElement;
  private readonly ctx = routeContext();

  constructor(
    private readonly root: HTMLElement,
    private readonly agent: HTMLElement,
    private readonly swaps: ShownProposal[],
    private readonly paintDone: () => void,
  ) {}

  mount(): void {
    onCleanup(() => {
      this.alive = false;
      this.tok++;
    });
    onResize(() => {
      if (stage.opened) this.layout();
    });
    this.buildPack();
    if (stage.opened || reduced()) {
      stage.opened = true;
      syncPack();
      this.reveal(false);
    } else this.idleAgent();
  }

  private get steps(): HTMLElement {
    return this.agent.querySelector<HTMLElement>("#steps") ?? document.createElement("div");
  }

  // ----- the pack -----

  private buildPack(): void {
    const n = this.swaps.length;
    const wrap = h("div", { class: "pack-wrap", id: "packWrap" });
    const pack = packEl("button", `Open the pack: ${n} ${state.kind === "venue" ? "offer" : "swap"}${n === 1 ? "" : "s"}`, `${n} new card${n === 1 ? "" : "s"} · sealed`, copy().season === "season" ? undefined : "Summer offers", state.kind === "venue");
    const hint = h("p", { class: "pack-hint" }, `${n} ${state.kind === "venue" ? "offer" : "swap"}${n === 1 ? "" : "s"} ready. Tap the pack to see ${n === 1 ? "it" : "them"}.`);
    const skip = h("button", { type: "button", class: "btn ghost sm", "data-testid": "skip-pack", onclick: () => this.open(false) }, (state.kind === "venue" ? "Just show me the offers" : "Just show me the swaps"));
    wrap.append(pack, hint, skip);
    pack.addEventListener("click", () => this.open(true));
    this.root.replaceChildren(wrap);
  }

  private open(animate: boolean): void {
    if (stage.opened) return;
    stage.opened = true;
    syncPack();
    const wrap = this.root.querySelector<HTMLElement>("#packWrap")!;
    const pk = wrap.querySelector<HTMLElement>(".pack")!;
    wrap.querySelectorAll("button").forEach((b) => b.setAttribute("disabled", ""));
    if (!animate || reduced()) {
      this.reveal(true);
      return;
    }
    const strip = pk.querySelector<HTMLElement>(".pk-strip")!, burst = pk.querySelector<HTMLElement>(".pk-burst")!;
    this.ctx.add(() => {
      gsap
        .timeline()
        .to(pk, { rotation: 2, x: 3, duration: 0.07, repeat: 7, yoyo: true, ease: "none" }, 0)
        .set(pk, { animation: "none" }, 0)
        .to(strip, { rotation: -26, x: "38%", y: -120, opacity: 0, transformOrigin: "0% 100%", duration: 0.8, ease: "power2.in" }, 0.5)
        .add(() => pk.classList.add("torn"), 0.52)
        .fromTo(burst, { scale: 0.2, opacity: 1 }, { scale: 1.1, opacity: 0, duration: 1, ease: "power2.out" }, 0.55)
        .to(pk, { y: 70, scale: 0.88, opacity: 0, duration: 0.7, ease: "power2.in" }, 1.0)
        .add(() => this.reveal(true), 1.25);
    });
  }

  // ----- the carousel -----

  private reveal(focus: boolean): void {
    const car = h("div", { class: "carousel", id: "carousel", role: "region", "aria-label": "Swaps proposed by Homestand", "aria-roledescription": "carousel" });
    this.carousel = car;
    this.slidesEl = h("div", { class: "slides", id: "slides" });
    this.console = h("div", { class: "console" });
    this.dashes = h("div", { class: "dashes" });
    this.prev = h("button", { type: "button", class: "sq", id: "prev", "aria-label": "Previous swap", onclick: () => this.show(stage.cur - 1) }, icon("arrowLeft")) as HTMLButtonElement;
    this.next = h("button", { type: "button", class: "sq", id: "next", "aria-label": "Next swap", onclick: () => this.show(stage.cur + 1) }, icon("arrowRight")) as HTMLButtonElement;
    car.append(this.slidesEl, this.console, h("div", { class: "cnav" }, this.prev, h("span", { class: "cl" }, "Previous"), this.dashes, h("span", { class: "cl" }, "Next"), this.next));
    this.root.replaceChildren(car);
    this.buildSlides();
    this.bindInput();
    this.layout();
    this.show(stage.cur, true);
    if (focus) {
      this.console.querySelector<HTMLElement>("[data-focus]")?.focus({ preventScroll: true });
      requestAnimationFrame(() => this.actionsInView());
    }
    if (!reduced() && focus) {
      const cw = this.slides[0]?.el.offsetWidth ?? 230;
      this.ctx.add(() => {
        this.slides.forEach((s, j) => {
          const o = j - stage.cur;
          if (Math.abs(o) > 1) return;
          // No opacity tween: fading a 3D-flipped card flattens it, and its back face flashes as a black box.
          gsap.from(s.lift, { x: -(o * (cw * 0.86 + 22)), y: 60, scale: 0.3, rotation: (o || 1) * -16, duration: 0.95, delay: 0.08 + Math.abs(o) * 0.14, ease: "back.out(1.3)", clearProps: "transform" });
        });
      });
    }
  }

  /** After the pack opens, scroll just far enough that Approve and Reject are on screen, keeping the card's top in view. */
  private actionsInView(): void {
    if (!this.alive) return;
    // The console's own bottom, not the sticky bar's: the bar is pinned to the window edge and says nothing about where the page ends.
    const room = window.innerHeight - 12;
    const bottom = this.console.getBoundingClientRect().bottom;
    if (bottom <= room) return;
    const dy = Math.min(bottom - room, this.root.getBoundingClientRect().top - 72);
    if (dy > 0) window.scrollBy({ top: dy, behavior: reduced() ? "auto" : "smooth" });
  }

  private specs(top: ShownProposal): { front: CardSpec; alt: CardSpec } {
    const p = effective(top);
    const base = specOf(viewOf(state.analysis!.nights[p.index]!));
    const night = state.analysis!.nights[p.index]!;
    return { front: specForSwap(base, p.fromThemeId, swapTitle(night.theme, label(p.fromThemeId)), p.from.label), alt: specForSwap(base, p.discovered ? (p.discovered.type === "artist" ? "music" : p.discovered.type === "movie" ? "film" : "tv") : p.toThemeId, swapTitle(night.theme, toLabel(p)), p.to.label, p.discovered?.genre) };
  }

  private buildSlides(): void {
    this.slides = this.swaps.map((top, j) => {
      const { front, alt } = this.specs(top);
      const card = makeCard(front, { alt, inert: true });
      card.dataset.notilt = "1";
      const lift = h("div", { class: "lift" }, card);
      const el = h("div", { class: "slide", "data-j": j }, lift);
      this.slidesEl.append(el);
      if (state.decisions[top.id] === "approved") setFlip(card, 180);
      return { top, el, lift, card };
    });
    this.dashes.replaceChildren(...this.slides.map((s, j) => h("button", { type: "button", class: "dash", "aria-label": `Show swap ${j + 1} of ${this.slides.length}: ${shortDate(s.top.date)}`, "data-j": j, onclick: () => this.show(j) })));
  }

  private bindInput(): void {
    let sx: number | null = null;
    this.slidesEl.addEventListener("pointerdown", (e) => {
      sx = e.clientX;
    });
    this.slidesEl.addEventListener("pointerup", (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx;
      sx = null;
      if (Math.abs(dx) > 50) this.show(stage.cur + (dx < 0 ? 1 : -1));
    });
    this.slidesEl.addEventListener("pointercancel", () => {
      sx = null;
    });
    this.slidesEl.addEventListener("click", (e) => {
      const s = (e.target as Element).closest<HTMLElement>(".slide");
      if (s && !s.classList.contains("cur") && Math.abs(Number(s.dataset.j) - stage.cur) === 1) this.show(Number(s.dataset.j));
    });
    this.carousel.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") this.show(stage.cur - 1);
      else if (e.key === "ArrowRight") this.show(stage.cur + 1);
    });
  }

  private layout(): void {
    const cw = this.slides[0]?.el.offsetWidth || 230;
    this.slides.forEach((s, j) => {
      const o = j - stage.cur, a = Math.abs(o);
      let x = 0, sc = 1, ry = 0, z = 40, op = 1;
      if (a === 1) {
        x = Math.sign(o) * (cw * 0.86 + 22);
        sc = 0.72;
        ry = -Math.sign(o) * 24;
        z = -40;
      } else if (a > 1) {
        x = Math.sign(o) * (cw * 1.3 + 22);
        sc = 0.5;
        ry = -Math.sign(o) * 30;
        z = -120;
        op = 0;
      }
      s.el.style.transform = `translateX(${x}px) translateZ(${z}px) rotateY(${ry}deg) scale(${sc})`;
      s.el.style.opacity = String(op);
      s.el.style.zIndex = String(10 - a);
      s.el.classList.toggle("cur", a === 0);
      s.el.classList.toggle("dim", a === 1);
      s.el.style.pointerEvents = a > 1 ? "none" : "auto";
      s.el.setAttribute("aria-hidden", a === 0 ? "false" : "true");
    });
    this.dashes?.querySelectorAll<HTMLElement>(".dash").forEach((d, j) => {
      d.classList.toggle("on", j === stage.cur);
      d.classList.toggle("done", !!state.decisions[this.slides[j]!.top.id]);
      d.setAttribute("aria-current", j === stage.cur ? "true" : "false");
    });
    this.prev.disabled = stage.cur === 0;
    this.next.disabled = stage.cur === this.slides.length - 1;
  }

  private show(j: number, instant = false): void {
    stage.cur = Math.max(0, Math.min(this.slides.length - 1, j));
    syncPack();
    this.layout();
    this.paintConsole();
    void this.paintAgent(instant);
  }

  // ----- what is shown for the current swap -----

  private paintConsole(): void {
    const s = this.slides[stage.cur]!;
    const top = s.top;
    const p = effective(top);
    const night = state.analysis!.nights[p.index]!;
    const d = state.decisions[p.id];
    const found = p.discovered;
    const city = cityOfLabel(state.analysis!.market.label);
    const fromRating = ratingWord(p.from.z);
    const cited = [found && !p.why.includes(`People in ${city} like ${found.name} more than people in most towns do.`) ? `People in ${city} like ${found.name} more than people in most towns do.` : "", p.whySource === "model" ? "Wording drafted by an AI from the checked facts." : ""].filter(Boolean).join(" ");
    const shown = d === "approved" ? p.to.z : p.from.z;
    const sub = d === "approved" ? "Approved." : d === "rejected" ? "Rejected. Kept as planned." : "";

    const takenElsewhere = new Set(this.swaps.filter((o) => o.id !== p.id).map((o) => effective(o).toThemeId));
    const pool = [top.toThemeId, ...top.alternates.map((a) => a.toThemeId)].filter((id) => id !== p.toThemeId);
    const chips =
      d === undefined && top.alternates.length > 0
        ? h("div", { class: "alts", role: "group", "aria-label": "Other themes that pass the same checks" }, h("span", { class: "small" }, "Or:"), pool.map((id) => {
            const blocked = !state.allowDuplicates && takenElsewhere.has(id);
            return h("button", { type: "button", class: "chip-btn", "data-testid": "alt", disabled: blocked ? "" : null, title: blocked ? `Already chosen for another ${copy().night}` : null, onclick: () => this.switchAlt(top, id) }, label(id));
          }))
        : null;

    const nowCard = makeCard(this.specs(top).alt, { inert: true });
    nowCard.dataset.notilt = "1";
    nowCard.removeAttribute("aria-label");
    nowCard.setAttribute("aria-hidden", "true");

    const nextOpen = this.nextUndecided();
    const acts: Child =
      d === undefined
        ? [
            h("button", { type: "button", class: "btn gold", "data-testid": "approve", "data-focus": "", onclick: () => this.approve(s) }, state.kind === "venue" ? "Approve offer" : "Approve swap"),
            h("button", { type: "button", class: "btn ghost", "data-testid": "reject", onclick: () => this.reject(s) }, "Reject"),
          ]
        : [
            h("span", { class: "decision" }, icon(d === "approved" ? "check" : "x"), d === "approved" ? `Approved: ${toLabel(p)} now holds ${shortDate(p.date)}${night.sponsor ? `. ${night.sponsor} stays` : ""}.` : "Rejected, stays as planned"),
            h("button", { type: "button", class: "lnk", "data-focus": "", onclick: () => this.undo(s) }, "Undo"),
            nextOpen >= 0 ? h("button", { type: "button", class: "btn pri sm", "data-testid": "next-swap", onclick: () => this.show(nextOpen) }, "Next swap", icon("arrowRight")) : null,
          ];

    this.console.replaceChildren(
      h(
        "div",
        { class: "meta" },
        h("div", { class: "pinbar" }, icon("pin"), h("span", null, `${shortDate(p.date)}`), h("span", null, "·"), h("span", null, night.sponsor || "No sponsor on this date"), h("small", null, "Date and sponsor stay")),
        d ? h("div", { class: "idx" }, h("span", { class: "k" }, "Fit"), h("span", { class: `v v--word ${found && d === "approved" ? "pos" : bandClass(shown)}`, id: "idxV" }, !d ? `${fromRating} \u2192 ${toRating(p)}` : found && d === "approved" ? toRating(p) : ratingWord(shown)), sub ? h("div", { class: "pp" }, sub) : null) : null,
      ),
      h(
        "div",
        { class: "swap-card", "data-proposal": p.id, "data-decision": d ?? "open", "data-testid": "proposal" },
        // The new night, shown before approval: the big card above is the night as planned.
        h("div", { class: "now-card", "data-testid": "now-card" }, h("span", { class: "now-k" }, d === "approved" ? "Now" : state.kind === "venue" ? "Send an offer to" : "Swap to"), p.kind === "best-option" ? h("span", { class: "best-badge", "data-testid": "best-badge" }, bestLabel(p)) : null, found ? h("span", { class: "disc-badge", "data-testid": "disc-badge" }, fitWord("found")) : null, nowCard),
        h(
          "div",
          { class: "swap-body" },
          h("p", { class: "swap-line", "data-testid": "swap-line" }, `${label(p.fromThemeId)}: ${fromRating}`, icon("swap"), `${toLabel(p)}: ${toRating(p)}`),
          h("p", { class: "swap-why" }, p.why),
          cited ? h("p", { class: "small", "data-testid": "cited" }, cited) : null,
          chips,
        ),
      ),
      h("div", { class: "acts", role: "group", "aria-label": `Decide the swap for ${shortDate(p.date)}` }, acts),
    );
  }

  private nextUndecided(): number {
    const after = this.slides.findIndex((s, k) => k > stage.cur && !state.decisions[s.top.id]);
    return after >= 0 ? after : this.slides.findIndex((s) => !state.decisions[s.top.id] && s !== this.slides[stage.cur]);
  }

  private switchAlt(top: ShownProposal, id: string): void {
    state.altChoice[top.id] = id;
    repaintAngles();
    const s = this.slides.find((x) => x.top.id === top.id)!;
    const { alt } = this.specs(top);
    const back = makeCard(alt, { inert: true });
    s.card.querySelector(".face.alt")?.replaceWith(relabel(back.querySelector<HTMLElement>(".face.front")!));
    this.paintConsole();
    void this.paintAgent(true);
    this.console.querySelector<HTMLElement>('[data-testid="alt"]')?.focus({ preventScroll: true });
  }

  private repaintTally(): void {
    this.paintDone();
  }

  private approve(s: Slide): void {
    if (this.busy) return;
    const id = s.top.id;
    state.decisions[id] = "approved";
    logYou(`You approved ${s.top.date}: ${shownSwap(s)}.`);
    this.repaintTally();
    this.layout();
    if (reduced()) {
      setFlip(s.card, 180);
      this.paintConsole();
      void this.paintAgent(true);
      this.refocus();
      return;
    }
    this.busy = true;
    const p = effective(s.top);
    this.console.querySelector(".acts")!.replaceChildren(h("span", { class: "note", role: "status" }, "Playing the swap…"));
    this.ctx.add(() => {
      gsap
        .timeline({
          onComplete: () => {
            s.card.classList.add("landed");
            sparks(s.card);
            this.busy = false;
            if (!this.alive) return;
            this.paintConsole();
            void this.paintAgent(true);
            this.refocus();
          },
        })
        .to(s.lift, { y: -34, scale: 1.12, duration: 0.38, ease: "power2.out" }, 0)
        .to(flipper(s.card), { rotationY: 180, duration: 0.95, ease: "power2.inOut" }, 0.05)
        .add(() => {
          const v = this.console.querySelector<HTMLElement>("#idxV");
          if (v) {
            v.textContent = toRating(p);
            v.className = `v v--word ${p.discovered ? "pos" : bandClass(p.to.z)}`;
          }
        }, 0.5)
        .to(s.lift, { y: 0, scale: 1, duration: 0.55, ease: "back.out(1.8)" }, 0.5);
    });
  }

  private reject(s: Slide): void {
    state.decisions[s.top.id] = "rejected";
    logYou(`You rejected ${s.top.date}: ${shownSwap(s)}.`);
    this.repaintTally();
    this.layout();
    if (!reduced()) {
      this.ctx.add(() => {
        gsap.fromTo(s.card, { x: -4 }, { x: 0, duration: 0.5, ease: "elastic.out(1,0.3)" });
      });
    }
    this.paintConsole();
    void this.paintAgent(true);
    this.refocus();
  }

  private undo(s: Slide): void {
    if (this.busy) return;
    const was = state.decisions[s.top.id];
    delete state.decisions[s.top.id];
    if (was) logYou(`You undid your ${was === "approved" ? "approval" : "rejection"} for ${s.top.date}.`);
    this.repaintTally();
    this.layout();
    if (was === "approved") {
      if (reduced()) setFlip(s.card, 0);
      else this.ctx.add(() => gsap.to(flipper(s.card), { rotationY: 0, duration: 0.6, ease: "power2.inOut" }));
    }
    this.paintConsole();
    void this.paintAgent(true);
    this.refocus();
  }

  private refocus(): void {
    this.console.querySelector<HTMLElement>("[data-focus]")?.focus({ preventScroll: true });
  }

  // ----- the agent -----

  private add(html: Child[], instant: boolean): HTMLElement {
    const d = h("div", { class: "st" }, ...html);
    if (instant || reduced()) d.style.animation = "none";
    this.steps.append(d);
    return d;
  }

  private qloo(themeId: string, kicker: string, instant: boolean): HTMLElement {
    const th = state.analysis?.themes[themeId];
    const items: Child[] = (th?.entities ?? []).flatMap((e, i) => [i > 0 ? " · " : null, h("b", null, cleanTitle(e.name)), ` (${TYPE_WORDS[e.type] ?? e.type.replace("_", " ")})`, e.affinity === null ? h("i", null, " no reading") : null]);
    const index = th?.index ?? null;
    return this.add([h("div", { class: "ic" }, "Q"), h("div", null, h("div", { class: "k" }, kicker), h("div", { class: "m" }, items, index === null ? null : h("span", { class: `ix ${bandClass(index)}` }, `→ fit: ${ratingWord(index)}`)))], instant);
  }

  private idleAgent(): void {
    const a = state.analysis!, p = state.propose!;
    this.steps.replaceChildren();
    this.add([h("div", { class: "ic" }, "A"), h("div", null, h("div", { class: "k" }, "Ready"), h("div", { class: "m" }, `Homestand rated all ${a.nights.length} ${copy().nights} against ${cityOfLabel(a.market.label)}'s own taste and found `, h("b", null, `${p.proposals.length} ${state.kind === "venue" ? "offer" : "swap"}${p.proposals.length === 1 ? "" : "s"}`), `, ${p.angles.length} ${state.kind === "venue" ? "opener" : "sponsor"} idea${p.angles.length === 1 ? "" : "s"} and ${p.unfixed.length} ${p.unfixed.length === 1 ? copy().night : copy().nights} it could not fix.`))], true);
    this.add([h("div", { class: "ic" }, "★"), h("div", null, h("div", { class: "k" }, "Next"), h("div", { class: "m" }, `Open the pack. Each ${state.kind === "venue" ? "offer" : "swap"} keeps its `, h("b", null, "date and sponsor"), ". You decide, one at a time."))], true);
  }

  /** The last line of the stream: where the swap stands (approved, rejected or waiting). */
  private tail(p: ShownProposal, quick: boolean): void {
    const night = state.analysis!.nights[p.index]!;
    const d = state.decisions[p.id];
    const el =
      d === "approved" ? this.add([h("div", { class: "ic ok" }, "✓"), h("div", null, h("div", { class: "k" }, "Approved"), h("div", { class: "m" }, h("b", null, toLabel(p)), ` lands on ${shortDate(p.date)}. ${night.sponsor ? `${night.sponsor} stays.` : "The date stays."}`))], quick)
      : d === "rejected" ? this.add([h("div", { class: "ic" }, "–"), h("div", null, h("div", { class: "k" }, "Rejected"), h("div", { class: "m" }, "Kept as planned. You can still approve it."))], quick)
      : this.add([h("div", { class: "ic" }, "…"), h("div", { class: "wait" }, h("div", { class: "k" }, "Waiting for your approval"), h("div", { class: "m" }, state.kind === "venue" ? "Approve the offer or reject it" : "Approve the swap or reject it", h("span", { class: "dots" }, h("span", null, "."), h("span", null, "."), h("span", null, "."))))], quick);
    el.classList.add("tail");
  }

  private async paintAgent(instant: boolean): Promise<void> {
    const tok = ++this.tok;
    const s = this.slides[stage.cur]!;
    const p = effective(s.top);
    const key = `${p.id}:${p.toThemeId}`;
    // Approve, reject and undo only change the last line. Replaying the lookups and rule checks would show them twice.
    if (this.painted === key && this.steps.querySelector(".tail")) {
      this.steps.querySelectorAll(".tail").forEach((n) => n.remove());
      this.tail(p, true);
      return;
    }
    this.painted = null;
    this.steps.replaceChildren();
    const quick = instant || reduced();
    const wait = (ms: number): Promise<void> => (quick ? Promise.resolve() : sleep(ms));
    const live = (): boolean => this.alive && tok === this.tok;
    this.qloo(p.fromThemeId, `Taste lookup · the weak ${copy().night}`, quick);
    await wait(520);
    if (!live()) return;
    if (p.discovered) this.add([h("div", { class: "ic" }, "Q"), h("div", null, h("div", { class: "k" }, fitWord("found")), h("div", { class: "m" }, h("b", null, p.discovered.name), ` People in ${cityOfLabel(state.analysis!.market.label)} like it more than people in most towns do. ${state.kind === "venue" ? "No act of ours that close in genre was a strong fit for this date." : "No theme of ours was a strong fit for this night."} It has no fit rating of its own: it was found, not graded.`))], quick);
    else this.qloo(p.toThemeId, "Taste lookup · the better fit", quick);
    await wait(520);
    if (!live()) return;
    const items = p.checks.map((c) => h("li", null, c));
    const rt = h("b", { class: "rt" }, `Checking ${p.checks.length} rule${p.checks.length === 1 ? "" : "s"}`);
    const ic = h("div", { class: "ic" }, "R");
    this.add([ic, h("div", null, h("div", { class: "k" }, "Rules"), h("div", { class: "m" }, rt, h("ul", { class: "ck" }, items)))], quick);
    for (const li of items) {
      await wait(300);
      if (!live()) return;
      li.classList.add("on");
    }
    items.forEach((l) => l.classList.add("on"));
    rt.textContent = `${p.checks.length} of ${p.checks.length} checks passed`;
    ic.classList.add("ok");
    ic.textContent = "✓";
    await wait(300);
    if (!live()) return;
    this.tail(p, quick);
    this.painted = key;
  }
}

function relabel(face: HTMLElement): HTMLElement {
  face.classList.remove("front");
  face.classList.add("alt");
  return face;
}

function sparks(card: HTMLElement): void {
  if (reduced()) return;
  const r = card.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const cols = ["#ffd97a", "#fff", "#ff8fb0", "#8fe9ff"];
  for (let i = 0; i < 22; i++) {
    const s = h("i", { class: "spark", "aria-hidden": "true", style: `left:${cx}px;top:${cy}px;background:${cols[i % 4]}` });
    document.body.append(s);
    const a = Math.random() * 6.28, d = 80 + Math.random() * 130;
    gsap.to(s, { x: Math.cos(a) * d, y: Math.sin(a) * d + 30, opacity: 0, scale: 0.2, duration: 0.9 + Math.random() * 0.5, ease: "power2.out", onComplete: () => s.remove() });
  }
}

/** "No usable reply." reads like an error to a director, so it goes to the console instead. */
const quiet = (detail: string | undefined): boolean => !!detail && /no usable reply/i.test(detail);

const TAGS: Record<string, string> = { resolve: "Name match", constraint: "Rule check", propose: "Swap idea", model: "AI wording", qloo: "Data", score: "Rating", note: "Note" };
const isAutoMatch = (s: TraceStep): boolean => s.kind === "resolve" && / matched /.test(s.text);

/** Steps as list rows. Names that matched on their own fold into one line, so the ones that needed a look stand out. */
function traceItems(title: string, steps: TraceStep[]): HTMLElement[] {
  const row = (s: TraceStep): HTMLElement => {
    if (quiet(s.detail)) console.debug(`[homestand] ${title}: ${s.text} ${s.detail}`);
    return h("li", null, h("span", { class: "trace-kind" }, `${TAGS[s.kind] ?? s.kind} at ${new Date(s.at).toLocaleTimeString("en-US")}`), h("span", null, localizeDates(s.text)), s.detail && !quiet(s.detail) ? h("span", { class: "small" }, localizeDates(s.detail)) : null);
  };
  const auto = steps.filter(isAutoMatch);
  if (auto.length < 3) return steps.map(row);
  const out: HTMLElement[] = [];
  let placed = false;
  for (const s of steps) {
    if (!isAutoMatch(s)) { out.push(row(s)); continue; }
    if (placed) continue;
    placed = true;
    out.push(h("li", { class: "trace-fold" }, h("details", null, h("summary", null, `${auto.length} names matched automatically (show)`), h("ol", { class: "trace-list" }, auto.map(row)))));
  }
  return out;
}

/** "Bluey Day to PAW Patrol Day", for the log. */
function shownSwap(s: Slide): string {
  const from = state.analysis!.nights[s.top.index]?.theme ?? "";
  const e = effective(s.top);
  return `${from} to ${e.discovered?.name ?? themeById(e.toThemeId)?.label ?? e.toThemeId}`;
}

export function openTrace(): void {
  openDrawer("How Homestand decided", () => [
    h("p", { class: "small" }, "Every step, in order: how names were matched, each Qloo call (saved or live, with time), each rule check, and each AI call. Code does the scoring and the choosing. The AI only words the reasons."),
    ...state.traceGroups.map((g) =>
      h(
        "section",
        { class: "trace-group" },
        h("h3", null, g.title),
        h(
          "ol",
          { class: "trace-list" },
          traceItems(g.title, g.steps),
        ),
      ),
    ),
  ]);
}

