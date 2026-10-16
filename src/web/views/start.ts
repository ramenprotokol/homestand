import type { GeoHit } from "../../app/api-types";
import { CSV_TEMPLATE, parseCalendar } from "../../app/calendar/csv";
import { SAMPLE_MARKETS } from "../../app/markets";
import { sampleCsv } from "../../app/samples";
import { AUDIT_LINE } from "../../app/score";
import { api, ApiFailure } from "../api";
import { download, h } from "../dom";
import { loadStudy } from "../study-data";
import { startCheck } from "../flow";
import { icon } from "../icons";

function teaser(): HTMLElement {
  const r = loadStudy().results;
  const result = r === null ? "Results pending." : r.h1.verdict === "CONFIRMED" ? "Result: local taste beat the line we set." : r.h1.verdict === "OVERTURNED" ? "Result: local taste pointed the wrong way." : "Result: not detected at this sample size.";
  const nights = r?.counts.nightsInput ?? 385;
  return h(
    "div",
    { class: "teaser", "data-testid": "study-teaser" },
    h("p", null, `We tested local taste against ${nights} real 2025 theme nights before building this. ${result}`),
    h("a", { href: "#/study" }, "See The Study", icon("arrowRight")),
  );
}

export function startView(): HTMLElement {
  return h(
    "div",
    { class: "hero" },
    h(
      "div",
      { class: "hero-copy" },
      h("span", { class: "note-marker" }, "for promotions directors"),
      h("h1", { tabindex: "-1" }, "Your market, not the national chart."),
      h("p", { class: "lede" }, "Check next season's theme nights against what your own ballpark market leans toward. Get swap suggestions that keep your sponsors and your dates."),
      h("p", { class: "small" }, `Scores describe what a market leans toward. ${AUDIT_LINE} `, h("a", { href: "#/study" }, "See how we tested it")),
      h(
        "div",
        { class: "actions" },
        h("a", { class: "btn btn--primary", href: "#/sample", "data-testid": "try-sample" }, "Try a sample club", icon("arrowRight")),
        h("a", { class: "btn btn--quiet", href: "#/own", "data-testid": "use-own" }, "Use your own"),
      ),
      teaser(),
    ),
    h(
      "ol",
      { class: "how", "aria-label": "How it works" },
      h("li", null, h("span", { class: "n" }, "1"), h("span", null, h("b", null, "Check"), "See which nights your market leans toward or away from.")),
      h("li", null, h("span", { class: "n" }, "2"), h("span", null, h("b", null, "Fix"), "Approve or reject swaps for the nights that lean away.")),
      h("li", null, h("span", { class: "n" }, "3"), h("span", null, h("b", null, "Send"), "Export the new calendar and a one-page memo.")),
    ),
  );
}

export function pickView(): HTMLElement {
  return h(
    "div",
    { class: "form" },
    h("div", { class: "page-head" }, h("h1", { tabindex: "-1" }, "Pick a sample club"), h("p", { class: "lede" }, "Each is a real ballpark market with a season calendar we wrote. Sponsors are made up.")),
    h(
      "div",
      { class: "markets" },
      SAMPLE_MARKETS.map((m) =>
        h(
          "button",
          {
            type: "button",
            class: "market",
            "data-testid": `market-${m.id}`,
            onclick: () => {
              const { rows, errors } = parseCalendar(sampleCsv(m.id));
              void startCheck({ label: m.label, lon: m.lon, lat: m.lat }, rows, errors, m.id);
            },
          },
          h("b", null, m.label),
          h("span", null, `${m.region}. Starts with their next season's calendar.`),
        ),
      ),
    ),
  );
}

export function ownView(): HTMLElement {
  let chosen: GeoHit | null = null;
  const status = h("p", { class: "help", role: "status" });
  const results = h("ul", { class: "results" });
  const q = h("input", { id: "city", type: "search", autocomplete: "off", placeholder: "For example, Tulsa" });
  const file = h("input", { id: "csvfile", type: "file", accept: ".csv,text/csv,.txt", "aria-label": "Upload a CSV file" });
  const paste = h("textarea", { id: "csvtext", "aria-describedby": "csvhelp", spellcheck: "false" });
  const errors = h("div", { role: "alert", class: "error" });
  const go = h("button", { type: "button", class: "btn btn--primary", "data-testid": "check-mine" }, "Check my calendar", icon("arrowRight"));

  async function search(): Promise<void> {
    const text = q.value.trim();
    results.replaceChildren();
    chosen = null;
    if (text.length < 2) {
      status.textContent = "Type at least two letters.";
      return;
    }
    status.textContent = "Searching...";
    try {
      const { results: hits } = await api.geocode(text);
      status.textContent = hits.length ? "Choose the city that is your ballpark's market." : "No match. Try the city name only.";
      for (const hit of hits) {
        const b = h(
          "button",
          {
            type: "button",
            class: "result",
            "aria-pressed": "false",
            onclick: () => {
              chosen = hit;
              results.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
            },
          },
          hit.label,
        );
        results.append(h("li", null, b));
      }
    } catch (err) {
      status.textContent = err instanceof ApiFailure ? err.message : "Search failed. Try again.";
    }
  }

  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    if (f.size > 200_000) {
      errors.textContent = "That file is too large. Calendars up to 200 KB work.";
      return;
    }
    paste.value = await f.text();
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void search();
    }
  });
  go.addEventListener("click", () => {
    errors.replaceChildren();
    if (!chosen) {
      errors.textContent = "Search for your city and choose it first.";
      return;
    }
    const { rows, errors: rowErrors } = parseCalendar(paste.value);
    if (rows.length === 0) {
      errors.replaceChildren(...rowErrors.map((e) => h("p", null, `Line ${e.line}: ${e.message}`)));
      return;
    }
    void startCheck({ label: `${chosen.label} club`, lon: chosen.lon, lat: chosen.lat }, rows, rowErrors, null);
  });

  return h(
    "div",
    { class: "form" },
    h("div", { class: "page-head" }, h("h1", { tabindex: "-1" }, "Use your own calendar"), h("p", { class: "lede" }, "Two things: where your ballpark is, and your theme nights.")),
    h("div", { class: "field" }, h("label", { for: "city" }, "1. Your ballpark's city"), h("div", { class: "actions" }, q, h("button", { type: "button", class: "btn", onclick: () => void search() }, icon("search"), "Search")), status, results),
    h(
      "div",
      { class: "field" },
      h("label", { for: "csvtext" }, "2. Your theme nights"),
      h("p", { id: "csvhelp", class: "help" }, "Columns: date, theme, sponsor, locked, notes. Upload a file or paste the rows here."),
      h("div", { class: "actions" }, file, h("button", { type: "button", class: "btn btn--small", onclick: () => download("homestand-template.csv", "text/csv", CSV_TEMPLATE) }, icon("download"), "Download the template")),
      paste,
    ),
    errors,
    h("div", { class: "actions" }, go),
  );
}
