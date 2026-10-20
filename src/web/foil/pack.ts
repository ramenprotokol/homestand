import { h } from "../dom";

/**
 * The sealed foil pack: a holographic wrapper, crimped top and bottom, with the tear strip across the top.
 * `tag` is "button" in Fix, where it opens the swaps, and "div" in the landing teaser, where it only tears.
 */
export function packEl(tag: "button" | "div", label: string, count: string, title = "Season swaps", pick = false): HTMLElement {
  const art = document.createElement("template");
  art.innerHTML = pick
    ? '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 10C80 10 92 34 82 60C75 78 60 90 50 92C40 90 25 78 18 60C8 34 20 10 50 10Z" fill="#fff6e0" stroke="#c9283c" stroke-width="3"/><path d="M50 26C66 26 72 40 66 56C62 66 55 73 50 75C45 73 38 66 34 56C28 40 34 26 50 26Z" fill="none" stroke="#c9283c" stroke-width="2" opacity=".55"/><path d="M50 38l4 9 10 1-7.500 6.500 2.500 9.500-9-5-9 5 2.500-9.500L36 48l10-1z" fill="#c9283c"/></svg>'
    :
    '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="38" fill="#fff6e0"/><path d="M26 18C36 34 36 66 26 82M74 18C64 34 64 66 74 82" fill="none" stroke="#c9283c" stroke-width="3"/><path d="M30 28l7 3M33 40l8 1M34 52l8-1M33 64l8-2M30 74l7-4M70 28l-7 3M67 40l-8 1M66 52l-8-1M67 64l-8-2M70 74l-7-4" stroke="#c9283c" stroke-width="2.4" stroke-linecap="round"/></svg>';
  const props = tag === "button" ? { type: "button", class: "pack", id: "pack", "aria-label": label } : { class: "pack", "aria-hidden": "true" };
  return h(
    tag,
    props,
    h(
      "div",
      { class: "pk-body" },
      h("div", { class: "pk-top" }),
      h("div", { class: "pk-art" }, art.content.firstElementChild),
      h("div", { class: "pk-t1" }, "Homestand"),
      h("div", { class: "pk-t2" }, title),
      h("div", { class: "pk-t3" }, count),
      h("div", { class: "pk-bot" }),
    ),
    h("div", { class: "pk-strip" }),
    h("div", { class: "pk-burst" }),
  );
}
