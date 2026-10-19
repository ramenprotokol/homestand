import { FIT_WORDS, pullWords, type FitLabel } from "../../app/score";
import { themeById } from "../../app/themes/library";
import { h } from "../dom";
import { canHover, fmt1, gsap, reduced } from "./motion";
import { emblemFor } from "./emblems";
import type { NightView } from "../store";

/** A night needing the director's pick is drawn as an unpainted sketch card and says so in words. */
export type CardFit = FitLabel | "pick";

export const FIT_NAME: Record<CardFit, string> = { ...FIT_WORDS, pick: "Needs your pick" };

export interface CardSpec {
  title: string;
  fit: CardFit;
  emblem: string;
  month: string;
  day: number;
  weekday: string;
  sponsor: string;
  locked: boolean;
  /** Night index, used to find the card again after a re-render. */
  index: number;
  label: string;
}

export interface BackRow {
  name: string;
  type: string;
  affinity: number | null;
}

export interface BackSpec {
  no: number;
  total: number;
  city: string;
  title: string;
  dateLine: string;
  rows: BackRow[];
  index: number | null;
  fit: CardFit;
  /** Shown instead of the stat table when a night has no scores. */
  reason: string | null;
}

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const SUFFIX = ["Night", "Day", "Friday", "Giveaway", "Showdown"];

const GEM: Record<string, [string, string, string, string, string]> = {
  "leans-in": ["#8af5c8", "#34c98a", "#1b8f63", "#0b5a42", "#f0b94a"],
  average: ["#ffffff", "#d5ddf2", "#8e9ab8", "#4a5575", "#cfd7ee"],
  "leans-away": ["#ffc0c6", "#ff4a5c", "#c0243c", "#7a1226", "#ff8a96"],
  classic: ["#c8dbff", "#5a8bff", "#2c55c8", "#16327e", "#9db9ff"],
  found: ["#c9fff3", "#3fd6c0", "#1b9c92", "#0b5a63", "#9df0e0"],
};

const labClass = (fit: CardFit): string => `lab-${fit === "pick" ? "not-scored" : fit}`;

/** The faceted label gem as an SVG string (static art, no user text). */
export function gemSVG(fit: CardFit, cls = "gem"): string {
  if (fit === "not-scored" || fit === "pick") {
    return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3L36 12V29L20 38L4 29V12Z" fill="none" stroke="#8b7d5e" stroke-width="1.6" stroke-dasharray="3 2.4"/></svg>`;
  }
  const g = GEM[fit]!;
  return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 1.5L37 11V29L20 38.5L3 29V11Z" fill="${g[4]}"/><path d="M20 4L34.6 12V28L20 36L5.4 28V12Z" fill="${g[2]}"/><path d="M20 4L34.6 12L20 18L5.4 12Z" fill="${g[0]}"/><path d="M5.4 12L20 18V36L5.4 28Z" fill="${g[1]}"/><path d="M34.6 12L20 18V36L34.6 28Z" fill="${g[3]}"/><path d="M12 11L20 7.6L24 10.4L15 14Z" fill="#fff" opacity=".7"/></svg>`;
}

const LOCK = '<svg class="lk" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="#ffe9c4" stroke-width="1.8"/><rect x="3" y="7" width="10" height="8" rx="1.8" fill="#ffe9c4"/></svg>';

function raw<T extends Element>(html: string): T {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

/** "Bluey Day" becomes the script "Bluey" over the slab "DAY". Anything else gets "THEME NIGHT". */
export function nameParts(t: string): [string, string] {
  const w = t.trim().split(/\s+/);
  const last = w[w.length - 1] ?? "";
  if (SUFFIX.includes(last) && w.length > 1) return [w.slice(0, -1).join(" "), last.toUpperCase()];
  return [t, "THEME NIGHT"];
}

function parts(iso: string): { month: string; day: number } {
  const [, m, d] = iso.split("-").map(Number) as [number, number, number];
  return { month: MON[m - 1]!, day: d };
}

/** What one night looks like as a card right now: the director's pick and any approved swap applied. */
export function specOf(v: NightView): CardSpec {
  const n = v.night;
  const fit: CardFit = v.needsChoice ? "pick" : v.fit;
  const title = v.swappedFrom ? v.themeLabel : n.theme;
  const category = v.themeId ? (themeById(v.themeId)?.category ?? null) : null;
  const { month, day } = parts(n.date);
  const words = FIT_NAME[fit];
  return {
    title,
    fit,
    emblem: emblemFor(v.discovered ? (v.discovered.type === "movie" ? "film" : "tv") : v.themeId, category, n.theme, n.resolution.kind === "classic"),
    month,
    day,
    weekday: n.weekday,
    sponsor: n.sponsor,
    locked: n.locked,
    index: n.index,
    label: `${n.weekday} ${month} ${day}, ${title}${n.sponsor ? `, sponsor ${n.sponsor}` : ""}${n.locked ? ", locked" : ""}, ${words}${v.swappedFrom ? ", swapped" : ""}`,
  };
}

/** A card for a theme the agent proposes: the night's date and sponsor, the new theme's art and fit. */
export function specForSwap(base: CardSpec, themeId: string, themeLabel: string, fit: FitLabel): CardSpec {
  const category = themeById(themeId)?.category ?? null;
  return { ...base, title: themeLabel, fit, emblem: emblemFor(themeId, category, themeLabel, false), label: `${base.weekday} ${base.month} ${base.day}, ${themeLabel}, ${FIT_WORDS[fit]}` };
}

function frontFace(s: CardSpec, extra: Node[], cls: string): HTMLElement {
  const [script, slab] = nameParts(s.title);
  const fs = Math.min(12.4, 205 / script.length).toFixed(1);
  const panel = h("div", { class: "panel" }, h("div", { class: "rays" }));
  panel.append(raw(`<svg class="emb" viewBox="0 0 100 100" aria-hidden="true">${s.emblem}</svg>`));
  const penn = h("div", { class: "penn" }, h("b", null, s.month), h("i", null, String(s.day)));
  if (s.locked) penn.append(raw(LOCK));
  return h(
    "div",
    { class: `face ${cls} ${labClass(s.fit)}` },
    h("div", { class: "sheet" }),
    panel,
    h("div", { class: "fine" }),
    raw(gemSVG(s.fit)),
    penn,
    h("span", { class: "fitword" }, FIT_NAME[s.fit]),
    h("div", { class: "plate" }, h("span", { class: "nm-s", style: `--fs:${fs}cqw` }, script), h("span", { class: "nm-b" }, slab), s.sponsor ? h("span", { class: "spons" }, s.sponsor) : null),
    h("div", { class: "foil" }),
    ...extra,
  );
}

const TYPE_WORDS: Record<string, string> = { tv_show: "TV show", movie: "movie", artist: "artist", book: "book", brand: "brand", place: "place" };

export function whyHead(fit: CardFit, city: string): string {
  return fit === "leans-in" ? `Why it fits ${city}` : fit === "leans-away" ? `Why it misses ${city}` : `How ${city} reads it`;
}

const WHY_TEXT: Partial<Record<CardFit, string>> = {
  "leans-in": "People near the ballpark like these more than they like the average theme, so this night fits the market's taste.",
  average: "People near the ballpark like these about as much as the average theme: neither a draw nor a drag.",
  "leans-away": "People near the ballpark like these less than the average theme, so a swap may fit the market's taste better.",
};

/** The cardboard stat back: taste match per item, the local pull, and the plain-words reason. */
function backFace(b: BackSpec): HTMLElement {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const rows = b.rows.slice(0, 3).map((e) => {
    const a = e.affinity;
    return h(
      "div",
      { class: "bk-r" },
      h("span", null, e.name, h("small", null, TYPE_WORDS[e.type] ?? e.type.replace("_", " ")), h("div", { class: "bk-bar" }, h("i", { style: `width:${a === null ? 0 : Math.round(Math.max(0, Math.min(1, a)) * 100)}%` }))),
      h("em", null, a === null ? "n/a" : a.toFixed(2)),
    );
  });
  const scored = b.rows.length > 0 || b.index !== null;
  const ix = b.index;
  const body: Node[] = [];
  if (scored && ix !== null) {
    body.push(
      h("div", { class: "bk-tbl" }, h("div", { class: "bk-h" }, h("span", null, "What Qloo looked at"), h("span", { style: "text-align:right" }, "Taste match here")), ...rows),
      h("div", { class: "bk-idx" }, h("div", { class: `n ${ix < 0 ? "neg" : "pos"}` }, fmt1(ix)), h("div", { class: "t" }, "Local pull", h("b", null, pullWords(ix)))),
      h("div", { class: "bk-why" }, h("b", null, whyHead(b.fit, b.city)), WHY_TEXT[b.fit] ?? ""),
    );
  } else {
    body.push(h("div", { class: "bk-why" }, h("b", null, FIT_NAME[b.fit]), b.reason ?? ""));
  }
  return h(
    "div",
    { class: "face back" },
    h(
      "div",
      { class: "sheet" },
      h(
        "div",
        { class: "bk" },
        h("div", { class: "bk-top" }, h("span", null, `${b.city} nights`), h("b", null, `No. ${pad(b.no)} / ${pad(b.total)}`)),
        h("div", { class: "bk-nm" }, b.title),
        h("div", { class: "bk-sub" }, b.dateLine),
        ...body,
        h("div", { class: "bk-ft" }, h("span", null, "Taste data from Qloo"), h("span", null, b.city)),
      ),
    ),
  );
}

export interface CardOptions {
  /** A second theme on the back of the card: a proposed swap, flipped into view when played. */
  alt?: CardSpec;
  /** The cardboard stat back, flipped into view for Why. */
  back?: BackSpec;
  /** Extra elements laid over the front, such as the sealed ribbon. */
  extra?: Node[];
  /** Plain div, not a button: for cards that are only shown. */
  inert?: boolean;
}

/** One card. The card is a button the keyboard and a tap can use; its front is the night, its back is the Why or the new theme. */
export function makeCard(s: CardSpec, opts: CardOptions = {}): HTMLElement {
  const flipper = h("div", { class: "flipper" }, frontFace(s, opts.extra ?? [], "front"));
  if (opts.alt) flipper.append(frontFace(opts.alt, [], "alt"));
  else if (opts.back) flipper.append(backFace(opts.back));
  const el = h("div", { class: `card tile ${labClass(s.fit)}${s.fit === "pick" ? " pick" : ""}`, "data-index": s.index, "data-fit": s.fit }, h("div", { class: "tilt" }, flipper));
  if (opts.inert) {
    el.setAttribute("role", "group");
  } else {
    el.tabIndex = 0;
    el.setAttribute("role", "button");
  }
  el.setAttribute("aria-label", s.label);
  return el;
}

/** Replace the faces of an existing card, keeping its rotation (used when a live re-check changes the answer). */
export function repaintCard(el: HTMLElement, s: CardSpec, opts: CardOptions = {}): void {
  const fl = el.querySelector<HTMLElement>(".flipper")!;
  fl.replaceChildren(frontFace(s, opts.extra ?? [], "front"), ...(opts.alt ? [frontFace(opts.alt, [], "alt")] : opts.back ? [backFace(opts.back)] : []));
  el.className = `card tile ${labClass(s.fit)}`;
  el.setAttribute("aria-label", s.label);
}

export const flipper = (card: Element): HTMLElement => card.querySelector<HTMLElement>(".flipper")!;

/** Set a card's flip angle without animating. */
export function setFlip(card: Element, deg: number): void {
  gsap.set(flipper(card), { rotationY: deg });
}

/** Hold a card's pointer tilt and the foil sheen following the cursor. Mouse only; touch and reduced motion skip it. Returns a remover. */
export function bindTilt(root: HTMLElement): () => void {
  if (!canHover() || reduced()) return () => undefined;
  const move = (e: PointerEvent): void => {
    const c = (e.target as Element).closest<HTMLElement>(".card");
    if (!c || c.dataset.notilt) return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.classList.add("tilting");
    c.style.setProperty("--ry", ((x - 0.5) * 16).toFixed(1) + "deg");
    c.style.setProperty("--rx", ((0.5 - y) * 14).toFixed(1) + "deg");
    for (const k of ["mx", "bx"]) c.style.setProperty(`--${k}`, (x * 100).toFixed(0) + "%");
    for (const k of ["my", "by"]) c.style.setProperty(`--${k}`, (y * 100).toFixed(0) + "%");
  };
  const out = (e: PointerEvent): void => {
    const c = (e.target as Element).closest<HTMLElement>(".card");
    if (!c || c.contains(e.relatedTarget as Node | null)) return;
    c.classList.remove("tilting");
    c.style.setProperty("--rx", "0deg");
    c.style.setProperty("--ry", "0deg");
  };
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerout", out);
  return () => {
    root.removeEventListener("pointermove", move);
    root.removeEventListener("pointerout", out);
  };
}

/** The little coloured gem plus a number, for tallies and legends. */
export function gemChip(fit: CardFit, cls = ""): HTMLElement {
  const s = h("span", { class: `gemchip ${cls}`, "aria-hidden": "true" });
  s.innerHTML = gemSVG(fit, "");
  return s;
}
