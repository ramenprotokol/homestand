import { clear, h, type Child } from "../dom";
import { icon } from "../icons";
import { flipper, setFlip } from "./cards";
import { gsap, reduced } from "./motion";

export interface WhyOptions {
  /** Night index: used to hand focus back to the card after a re-render replaced it. */
  index: number;
  /** The tapped card, so the new card can fly out of it and back. */
  source: HTMLElement | null;
  /** A card with both faces; it flips to the back as the dialog opens. */
  card: () => HTMLElement;
  /** Called after the live data changed, to repaint the card faces. */
  repaint: (card: HTMLElement) => void;
  /** Everything beside the card. It starts with the heading with id "why-title". */
  info: () => Child;
}

interface Open {
  opts: WhyOptions;
  root: HTMLElement;
  holder: HTMLElement;
  info: HTMLElement;
  card: HTMLElement;
  tl: gsap.core.Timeline | null;
  prevOverflow: string;
}

let open: Open | null = null;

const focusables = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>('button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute("disabled"));

function onKey(e: KeyboardEvent): void {
  if (!open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeWhy();
    return;
  }
  if (e.key !== "Tab") return;
  const f = focusables(open.root);
  if (f.length === 0) return;
  const first = f[0]!, last = f[f.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function fill(info: HTMLElement, content: Child): void {
  clear(info);
  const nodes = Array.isArray(content) ? content : [content];
  for (const c of nodes) if (c !== null && c !== undefined && c !== false) info.append(typeof c === "object" ? (c as Node) : document.createTextNode(String(c)));
}

export function isWhyOpen(): boolean {
  return open !== null;
}

/** The Why: the night's card flips in 3D to its cardboard stat back; the dialog holds the plain-words reading beside it. */
export function openWhy(opts: WhyOptions): void {
  closeWhy(false);
  const card = opts.card();
  card.dataset.notilt = "1";
  card.removeAttribute("tabindex");
  card.removeAttribute("role");
  card.setAttribute("aria-hidden", "true");
  const holder = h("div", { class: "lb-card" }, card);
  const info = h("div", { class: "lb-info" });
  const closeBtn = h("button", { type: "button", class: "lb-x", "aria-label": "Close", onclick: () => closeWhy() }, icon("x"));
  const root = h(
    "div",
    { class: "lb", role: "dialog", "aria-modal": "true", "aria-labelledby": "why-title", onclick: (e: Event) => { const t = e.target as Element; if (t === root || t.classList.contains("lb-in")) closeWhy(); } },
    h("div", { class: "lb-in" }, holder, info),
    closeBtn,
  );
  open = { opts, root, holder, info, card, tl: null, prevOverflow: document.body.style.overflow };
  fill(info, opts.info());
  document.body.append(root);
  document.body.style.overflow = "hidden";
  document.body.classList.add("why-open");
  document.addEventListener("keydown", onKey);

  const fl = flipper(card);
  const src = opts.source;
  if (!reduced() && src && src.isConnected) {
    const sr = src.getBoundingClientRect(), tr = card.getBoundingClientRect();
    const dx = sr.left + sr.width / 2 - (tr.left + tr.width / 2), dy = sr.top + sr.height / 2 - (tr.top + tr.height / 2), sc = sr.width / tr.width;
    gsap.set(card, { x: dx, y: dy, scale: sc });
    gsap.set(info.children, { opacity: 0, y: 14 });
    gsap.set(root, { opacity: 0 });
    open.tl = gsap
      .timeline()
      .to(root, { opacity: 1, duration: 0.25 }, 0)
      .to(card, { x: 0, y: 0, scale: 1.16, duration: 0.5, ease: "power2.out" }, 0)
      .to(fl, { rotationY: 180, duration: 0.9, ease: "power2.inOut" }, 0.05)
      .to(card, { scale: 1, duration: 0.45, ease: "power2.inOut" }, 0.5)
      .to(info.children, { opacity: 1, y: 0, stagger: 0.06, duration: 0.45, clearProps: "opacity,transform" }, 0.55);
  } else {
    setFlip(card, 180);
  }
  closeBtn.focus({ preventScroll: true });
}

/** Re-render the beside-the-card content and the card faces after live data changed. The card keeps its flip. */
export function refreshWhy(): void {
  if (!open) return;
  const { info, opts, card } = open;
  const keepScroll = open.root.scrollTop;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement.getAttribute("data-keep") : null;
  fill(info, opts.info());
  opts.repaint(card);
  card.setAttribute("aria-hidden", "true");
  open.root.scrollTop = keepScroll;
  if (active) info.querySelector<HTMLElement>(`[data-keep="${active}"]`)?.focus({ preventScroll: true });
}

export function closeWhy(restoreFocus = true): void {
  if (!open) return;
  const o = open;
  open = null;
  o.tl?.kill();
  document.removeEventListener("keydown", onKey);
  // It may fade out for half a second; it is no longer a dialog from the moment it starts closing.
  o.root.removeAttribute("role");
  o.root.setAttribute("aria-hidden", "true");
  const finish = (): void => {
    o.root.remove();
    if (!open) {
      document.body.style.overflow = o.prevOverflow;
      document.body.classList.remove("why-open");
    }
    if (!restoreFocus) return;
    const back = document.querySelector<HTMLElement>(`.card[data-index="${o.opts.index}"]`);
    (back ?? document.getElementById("main"))?.focus({ preventScroll: true });
  };
  const src = o.opts.source;
  const fresh = document.querySelector<HTMLElement>(`.card[data-index="${o.opts.index}"]`) ?? (src && src.isConnected ? src : null);
  if (restoreFocus && !reduced() && fresh) {
    const sr = fresh.getBoundingClientRect(), tr = o.card.getBoundingClientRect();
    const cx = Number(gsap.getProperty(o.card, "x")), cy = Number(gsap.getProperty(o.card, "y")), cs = Number(gsap.getProperty(o.card, "scale"));
    const dx = sr.left + sr.width / 2 - (tr.left + tr.width / 2) + cx, dy = sr.top + sr.height / 2 - (tr.top + tr.height / 2) + cy, sc = sr.width / (tr.width / cs);
    gsap
      .timeline({ onComplete: finish })
      .to(o.info.children, { opacity: 0, duration: 0.15 }, 0)
      .to(flipper(o.card), { rotationY: 0, duration: 0.55, ease: "power2.inOut" }, 0)
      .to(o.card, { x: dx, y: dy, scale: sc, duration: 0.55, ease: "power2.inOut" }, 0)
      .to(o.root, { opacity: 0, duration: 0.25 }, 0.35);
    // Focus returns at once, so keyboard users are never left on a dialog that is fading out.
    fresh.focus({ preventScroll: true });
  } else finish();
}
