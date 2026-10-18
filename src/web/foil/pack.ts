import { h } from "../dom";

/**
 * The sealed foil pack: a holographic wrapper, crimped top and bottom, with the tear strip across the top.
 * `tag` is "button" in Fix, where it opens the swaps, and "div" in the landing teaser, where it only tears.
 */
export function packEl(tag: "button" | "div", label: string, count: string): HTMLElement {
  const art = document.createElement("template");
  art.innerHTML =
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
      h("div", { class: "pk-t2" }, "Season swaps"),
      h("div", { class: "pk-t3" }, count),
      h("div", { class: "pk-bot" }),
    ),
    h("div", { class: "pk-strip" }),
    h("div", { class: "pk-burst" }),
  );
}
