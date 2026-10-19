import type { FitLabel } from "../../app/score";
import { h } from "../dom";
import type { NightView } from "../store";
import { gemChip } from "./cards";
import { tween } from "./motion";

const KEYS: ReadonlyArray<readonly [FitLabel, string]> = [["leans-in", "in"], ["average", "average"], ["leans-away", "away"], ["classic", "classic"], ["not-scored", "not scored"], ["found", "found"]];

/** The coloured count chips: the same five groups the legend explains. Hidden from screen readers; a summary sentence says the same in words. */
export function tally(views: NightView[], mini = false): HTMLElement {
  return h(
    "div",
    { class: `tally${mini ? " mini" : ""}`, "aria-hidden": "true" },
    KEYS.map(([fit, word]) => {
      const n = views.filter((v) => v.fit === fit).length;
      return h("div", { class: "t", "data-k": fit, hidden: fit === "found" && n === 0 ? "" : null }, gemChip(fit), h("b", null, String(n)), h("span", null, word));
    }),
  );
}

/** Count the chips up or down to the new totals, with a small bump where a number changed. */
export function setTally(el: HTMLElement, views: NightView[]): void {
  for (const [fit] of KEYS) {
    const row = el.querySelector<HTMLElement>(`[data-k="${fit}"]`);
    const b = row?.querySelector("b");
    if (!row || !b) continue;
    const from = Number(b.textContent), to = views.filter((v) => v.fit === fit).length;
    if (fit === "found") row.hidden = to === 0;
    if (from === to) continue;
    tween(from, to, 600, (v) => {
      b.textContent = String(Math.round(v));
    });
    row.classList.remove("bump");
    void row.offsetWidth;
    row.classList.add("bump");
  }
}
