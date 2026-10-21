import { SAMPLE_MARKETS } from "../../app/markets";
import { DAILY_QUOTA } from "../../worker/limits";
import { h } from "../dom";
import { retryCheck } from "../flow";
import { icon } from "../icons";
import { state, ui } from "../store";

/** The Check error pages. The limit pages say what happened and where to go; every other failure offers Retry, which re-runs the same request. */
export function errorView(): HTMLElement {
  const code = ui.errorCode ?? "error";
  const own = state.sampleId === null && state.rows.length > 0;
  const samples = SAMPLE_MARKETS.length;
  const links = [
    h("a", { class: "btn pri", href: "#/sample", "data-testid": "error-samples" }, `Open one of the ${samples} sample clubs`, icon("arrowRight")),
    own ? h("a", { class: "btn ghost", href: "#/own", "data-testid": "back-to-rows" }, "Back to my rows") : null,
  ];

  if (code === "quota") {
    return page(
      "You've used today's",
      "new cities",
      [
        h("p", { class: "lede", "data-testid": "limit-text" }, `Each visitor can look up ${DAILY_QUOTA.pull} new cities a day, and you've reached that today. The count starts over tomorrow (UTC).`),
        h("p", { class: "lede" }, `Your calendar is still here. The ${samples} sample clubs work as many times as you like, and so do cities you've already checked.`),
      ],
      links,
    );
  }
  if (code === "capped") {
    return page("Today's live data is", "used up", [h("p", { class: "lede", "data-testid": "limit-text" }, ui.error ?? ""), h("p", { class: "lede" }, "Your calendar is still here.")], links);
  }
  const heading: Record<string, [string, string]> = {
    timeout: ["This is taking", "too long"],
    network: ["We can't", "reach the server"],
    "rate-limit": ["Too many requests,", "slow down"],
    counters: ["Live lookups are", "paused"],
  };
  const [lead, accent] = heading[code] ?? ["Something", "went wrong"];
  const retry = h("button", { type: "button", class: "btn pri", "data-testid": "retry", onclick: () => retryCheck() }, icon("refresh"), "Try again");
  return page(lead, accent, [h("p", { class: "error", role: "alert", "data-testid": "error-text" }, ui.error ?? "Something went wrong. Try again."), h("p", { class: "lede" }, "Your calendar is still here. Try again re-runs the same check.")], [retry, h("a", { class: "btn ghost", href: "#/sample" }, "Pick a sample club"), own ? h("a", { class: "btn ghost", href: "#/own", "data-testid": "back-to-rows" }, "Back to my rows") : null]);
}

function page(lead: string, accent: string, body: HTMLElement[], actions: Array<HTMLElement | null>): HTMLElement {
  return h("section", { class: "scene", "data-testid": "error-page" }, h("div", { class: "wrap narrow" }, h("h1", { class: "h2", tabindex: "-1" }, `${lead} `, h("em", null, accent)), ...body, h("div", { class: "actions" }, ...actions)));
}
