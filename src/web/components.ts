import { FIT_WORDS, type FitLabel } from "../app/score";
import { h, type Child } from "./dom";
import { icon, type IconName } from "./icons";
import { state } from "./store";

const FIT_ICON: Record<FitLabel, IconName> = {
  "leans-in": "trendUp",
  average: "equals",
  "leans-away": "trendDown",
  "not-scored": "question",
  classic: "star",
};

/** The fit in words, with an icon: colour is never the only signal. */
export function fitChip(fit: FitLabel | "pick"): HTMLElement {
  return fit === "pick" ? h("span", { class: "fitchip fitchip--not-scored" }, icon("question"), "Needs your pick") : h("span", { class: `fitchip fitchip--${fit}` }, icon(FIT_ICON[fit]), FIT_WORDS[fit]);
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
  const closeBtn = h("button", { type: "button", class: "btn ghost sm", onclick: () => closeDrawer() }, icon("x"), "Close");
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
