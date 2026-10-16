import { FIT_WORDS, type FitLabel } from "../app/score";
import { h, formatDate, type Child } from "./dom";
import { icon, type IconName } from "./icons";
import type { NightView } from "./store";
import { state } from "./store";

const FIT_ICON: Record<FitLabel, IconName> = {
  "leans-in": "trendUp",
  average: "equals",
  "leans-away": "trendDown",
  "not-scored": "question",
  classic: "star",
};

export function badge(fit: FitLabel): HTMLElement {
  return h("span", { class: `badge badge--${fit}` }, icon(FIT_ICON[fit]), FIT_WORDS[fit]);
}

export interface TileOptions {
  /** Open the Why panel (omit for a read-only tile). */
  onOpen?: () => void;
  /** Called when the director picks a theme for an ambiguous night. */
  onChoose?: (themeId: string) => void;
  candidates?: Array<{ id: string; label: string }>;
  /** Show the planned theme again, struck through, under the new one. */
  showWas?: boolean;
}

/** One night as a magnet. The stamp sits in the footer row, so it can never cover the weekday or date. */
export function tile(v: NightView, opts: TileOptions = {}): HTMLElement {
  const n = v.night;
  const head = h(
    "span",
    { class: "tile-head" },
    h("span", { class: "tile-wd" }, n.weekday),
    h("span", { class: "tile-date" }, formatDate(n.date)),
    n.locked ? h("span", { class: "tile-lock" }, icon("lock"), "Locked") : null,
  );
  const themeText = v.swappedFrom ? v.themeLabel : n.theme;
  const body: Child[] = [
    head,
    h("span", { class: "tile-theme" }, themeText),
    v.swappedFrom ? h("span", { class: "tile-was" }, `was ${n.theme}`) : null,
    n.sponsor ? h("span", { class: "chip" }, n.sponsor) : null,
  ];
  const foot = h("span", { class: "tile-foot" }, v.needsChoice ? null : badge(v.fit), v.swappedFrom ? h("span", { class: "stamp" }, "SWAPPED") : null);
  const cls = `tile tile--${v.needsChoice ? "not-scored" : v.fit}${v.swappedFrom ? " tile--swapped" : ""}`;
  const label = `${n.weekday} ${formatDate(n.date)}, ${themeText}${n.sponsor ? `, sponsor ${n.sponsor}` : ""}${n.locked ? ", locked" : ""}, ${v.needsChoice ? "needs your pick" : FIT_WORDS[v.fit]}${v.swappedFrom ? ", swapped" : ""}`;

  if (v.needsChoice && opts.candidates) {
    return h(
      "div",
      { class: cls, "data-index": n.index },
      ...body,
      h(
        "span",
        { class: "choices", role: "group", "aria-label": `Which theme is "${n.theme}"?` },
        h("span", { class: "choice-q" }, "Which one did you mean?"),
        opts.candidates.map((c) => h("button", { type: "button", class: "btn btn--small", onclick: () => opts.onChoose?.(c.id) }, c.label)),
      ),
    );
  }
  if (!opts.onOpen) return h("div", { class: cls, "data-index": n.index, role: "group", "aria-label": label }, ...body, foot);
  return h("button", { type: "button", class: cls, "data-index": n.index, "aria-label": label, onclick: opts.onOpen }, ...body, foot);
}

export function syntheticBanner(): HTMLElement | null {
  const a = state.analysis;
  if (!a || (a.mode !== "synthetic" && !a.reference.synthetic)) return null;
  return h(
    "div",
    { class: "notice notice--warn", role: "note" },
    icon("flask"),
    h("span", null, h("strong", null, "Synthetic demo data. "), "These scores are made up for testing the app. They are not from Qloo."),
  );
}

// ---------- drawer ----------

interface OpenDrawer {
  root: HTMLElement;
  scrim: HTMLElement;
  opener: Element | null;
  render: () => Child;
  body: HTMLElement;
  titleId: string;
}

let current: OpenDrawer | null = null;

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute("disabled"));
}

function onKey(e: KeyboardEvent): void {
  if (!current) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeDrawer();
    return;
  }
  if (e.key === "Tab") {
    const f = focusables(current.root);
    if (f.length === 0) return;
    const first = f[0]!;
    const last = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

export function openDrawer(title: string, render: () => Child): void {
  closeDrawer(false);
  const titleId = "drawer-title";
  const body = h("div", { class: "drawer-body" });
  const closeBtn = h("button", { type: "button", class: "btn btn--small", onclick: () => closeDrawer() }, icon("x"), "Close");
  const root = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId }, h("div", { class: "drawer-head" }, h("h2", { id: titleId }, title), closeBtn), body);
  const scrim = h("div", { class: "scrim", onclick: () => closeDrawer() });
  current = { root, scrim, opener: document.activeElement, render, body, titleId };
  document.body.append(scrim, root);
  document.addEventListener("keydown", onKey);
  refreshDrawer();
  closeBtn.focus();
}

export function refreshDrawer(): void {
  if (!current) return;
  const keepScroll = current.body.scrollTop;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement.getAttribute("data-keep") : null;
  current.body.replaceChildren();
  const content = current.render();
  if (content !== null && content !== undefined && content !== false) current.body.append(...(Array.isArray(content) ? content : [content]).map((c) => (typeof c === "object" && c !== null ? (c as Node) : document.createTextNode(String(c)))));
  current.body.scrollTop = keepScroll;
  if (active) current.body.querySelector<HTMLElement>(`[data-keep="${active}"]`)?.focus();
}

export function closeDrawer(restoreFocus = true): void {
  if (!current) return;
  const { root, scrim, opener } = current;
  current = null;
  root.remove();
  scrim.remove();
  document.removeEventListener("keydown", onKey);
  if (restoreFocus && opener instanceof HTMLElement && document.contains(opener)) opener.focus();
}
