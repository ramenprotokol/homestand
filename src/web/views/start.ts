import type { GeoHit } from "../../app/api-types";
import { CSV_TEMPLATE, parseCalendar } from "../../app/calendar/csv";
import { SAMPLE_MARKETS } from "../../app/markets";
import { exampleCsv, sampleCsv } from "../../app/samples";
import { api, ApiFailure } from "../api";
import { download, h } from "../dom";
import { Fireworks } from "../foil/fx";
import { heroShell } from "../foil/hero";
import { makeCard, type CardSpec } from "../foil/cards";
import { emblemFor } from "../foil/emblems";
import { onCleanup, onMount, onResize, routeContext, whileVisible } from "../foil/lifecycle";
import { gsap, reduced } from "../foil/motion";
import { packEl } from "../foil/pack";
import { ridge } from "../foil/scenery";
import { startCheck } from "../flow";
import { icon } from "../icons";
import { loadStudy } from "../study-data";

function teaser(): HTMLElement {
  const r = loadStudy().results;
  const nights = r?.counts.nightsInput ?? 385;
  const text =
    r === null ? `We are testing local taste against ${nights} real 2025 theme nights. Results are pending.`
    : r.h1.verdict === "CONFIRMED" ? `We tested local taste against ${nights} real 2025 theme nights before building this. Result: local taste beat the line we set.`
    : r.h1.verdict === "OVERTURNED" ? `We tested local taste against ${nights} real 2025 theme nights before building this. Result: local taste pointed the wrong way.`
    : `Before building this, we tested local taste against ${nights} real 2025 theme nights. See what we found, and where it falls short.`;
  return h(
    "div",
    { class: "teaser", "data-testid": "study-teaser" },
    h("p", null, text),
    h("a", { class: "btn gold", href: "#/study" }, "See The Study", icon("arrowRight")),
  );
}

/** Three decorative cards for the first beat of the teaser. They illustrate the look; they carry no scores. */
function demoCards(): HTMLElement[] {
  const base = (title: string, fit: CardSpec["fit"], m: string, d: number, id: string | null, cls: boolean): CardSpec => ({
    title, fit, emblem: emblemFor(id, null, title, cls), month: m, day: d, weekday: "", sponsor: "", locked: false, index: -1, label: "",
  });
  const specs = [base("Fireworks Friday", "classic", "JUL", 3, null, true), base("Elvis Night", "leans-in", "JUN", 12, "elvis", false), base("Bluey Day", "average", "MAY", 9, "bluey", false)];
  return specs.map((s) => {
    const c = makeCard(s, { inert: true });
    c.dataset.notilt = "1";
    c.removeAttribute("aria-label");
    return h("div", { class: "demo-card" }, c);
  });
}

function teaseSection(): HTMLElement {
  const cards = demoCards();
  const burst = h("canvas", { class: "tease-fx", "aria-hidden": "true" });
  const beats = [
    { n: "1", name: "Check", text: "See which nights your market leans toward or away from.", art: h("div", { class: "fan3", "aria-hidden": "true" }, cards) },
    { n: "2", name: "Fix", text: "Approve or reject swaps for the nights that lean away.", art: h("div", { class: "pack-art", "aria-hidden": "true" }, packEl("div", "", "swaps · sealed")) },
    { n: "3", name: "Send", text: "Export the new calendar and a one-page memo.", art: h("div", { class: "fw-art", "aria-hidden": "true" }, h("div", { class: "fw-box" }, burst)) },
  ];
  const section = h(
    "section",
    { class: "tease", id: "tease", "aria-label": "How it works" },
    h(
      "div",
      { class: "wrap" },
      h("div", { class: "eyebrow" }, "How it plays"),
      h("h2", { class: "h2" }, "Three moves, ", h("em", null, "one season")),
      h("ol", { class: "how", "aria-label": "How it works" }, beats.map((b) => h("li", { class: "beat" }, h("div", { class: "beat-art" }, b.art), h("div", { class: "beat-copy" }, h("span", { class: "n" }, b.n), h("h3", null, b.name), h("p", null, b.text))))),
      teaser(),
      h("div", { class: "page-end" }, h("a", { class: "btn pri", href: "#/sample", "data-testid": "end-try-sample" }, "Try a sample club", icon("arrowRight"))),
    ),
  );
  onMount(() => mountTease(section, cards, burst));
  return section;
}

function mountTease(section: HTMLElement, cards: HTMLElement[], canvas: HTMLCanvasElement): void {
  const ctx = routeContext();
  const fw = new Fireworks(canvas, { rate: 0.7, top: [0.12, 0.55], big: 0.9, sparks: 90, fireflies: 8 });
  onResize(() => fw.size());
  onCleanup(() => fw.stop());
  if (reduced()) {
    fw.drawStill();
    return;
  }
  whileVisible(canvas, () => fw.start(), () => fw.stop());
  ctx.add(() => {
    const beats = gsap.utils.toArray<HTMLElement>(".beat", section);
    for (const b of beats) gsap.from(b, { opacity: 0, y: 44, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: b, start: "top 88%", once: true } });
    const rot = [-13, 0, 13], dx = [-52, 0, 52];
    cards.forEach((c, i) => {
      gsap.fromTo(c, { x: 0, y: 24, rotation: 0, scale: 0.86, opacity: 0.2 }, { x: `${dx[i]}%`, y: Math.abs(rot[i]!) * 0.9, rotation: rot[i], scale: 1, opacity: 1, ease: "none", scrollTrigger: { trigger: ".fan3", start: "top 85%", end: "top 40%", scrub: 0.5 } });
    });
    const tear = gsap.timeline({ scrollTrigger: { trigger: ".pack-art", start: "top 80%", end: "top 30%", scrub: 0.5 } });
    tear
      .to(".pack-art .pk-strip", { rotation: -24, x: "34%", y: -86, opacity: 0, transformOrigin: "0% 100%", ease: "power2.in" }, 0)
      .fromTo(".pack-art .pk-burst", { scale: 0.2, opacity: 1 }, { scale: 1.1, opacity: 0, ease: "power2.out" }, 0.25);
  });
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) fw.salvo(2);
  }, { threshold: 0.5 });
  io.observe(canvas);
  onCleanup(() => io.disconnect());
}

export function startView(): HTMLElement {
  const copy = [
    h("h1", { class: "sub", id: "sub", tabindex: "-1" }, "Your market, not the national chart."),
    h("p", { class: "hero-lede", "data-testid": "hero-intro" }, "Planning next season's theme nights? Homestand checks each one against what fans in your town like, and suggests swaps for the weak ones. Your dates and sponsors stay put. Every swap comes with a cited reason you can show a sponsor."),
    h(
      "div",
      { class: "hero-actions", id: "cta" },
      h("a", { class: "btn pri", href: "#/sample", "data-testid": "try-sample" }, "Try a sample club", icon("arrowRight")),
      h("a", { class: "btn ghost", href: "#/own", "data-testid": "use-own" }, "Use your own"),
    ),
    h("p", { class: "tag honest", id: "tag", "data-testid": "hero-honest" }, "It reads what your town likes. It doesn't forecast ticket sales, and we tested that: ", h("a", { href: "#/study" }, "see The Study"), "."),
    h("p", { class: "tag", id: "venue-tag", "data-testid": "hero-venue" }, "Also works for concert venues: ", h("a", { href: "#/check/raleigh", "data-testid": "try-venue" }, "try the amphitheatre sample"), "."),
  ];
  return h("div", { class: "landing" }, heroShell(copy), ridge(), teaseSection());
}

// ---------- pick a sample club and use your own ----------

function sceneHead(eyebrow: string, title: string, accent: string, lede: string): HTMLElement {
  return h("div", { class: "scene-head" }, h("div", { class: "eyebrow" }, eyebrow), h("h1", { class: "h2", tabindex: "-1" }, `${title} `, h("em", null, accent)), h("p", { class: "lede" }, lede));
}

function ticketFor(m: (typeof SAMPLE_MARKETS)[number]): HTMLElement {
  const venue = m.kind === "venue";
  return h(
    "button",
    {
      type: "button",
      class: "ticket",
      "data-testid": `market-${m.id}`,
      onclick: () => {
        const { rows, errors } = parseCalendar(sampleCsv(m.id));
        void startCheck({ label: m.label, lon: m.lon, lat: m.lat }, rows, errors, m.id, true, m.kind);
      },
    },
    h("span", { class: "tk-stub" }, h("span", { class: "tk-k" }, venue ? "Sample venue" : "Sample club"), h("span", { class: "tk-city" }, m.city)),
    h(
      "span",
      { class: "tk-main" },
      h("b", null, m.label),
      h("span", null, venue ? `${m.region}. A made-up summer concert calendar for a sample amphitheatre. It is not a real venue.` : `${m.region}. Starts with their next season's calendar.`),
      h("span", { class: "tk-go" }, venue ? "Open this venue" : "Open this club", icon("arrowRight")),
    ),
  );
}

export function pickView(): HTMLElement {
  return h(
    "section",
    { class: "scene scene--pick" },
    h(
      "div",
      { class: "wrap" },
      sceneHead("Get started · Pick a club", "Pick a", "sample club", "Each is a real ballpark market with a season calendar we wrote. Sponsors are made up."),
      h("div", { class: "tickets" }, SAMPLE_MARKETS.filter((m) => m.kind === "club").map(ticketFor)),
      h("div", { class: "eyebrow venue-eyebrow" }, "Also works for concert venues"),
      h("p", { class: "lede venue-lede" }, "Same Check, Fix and Send on a touring-act calendar. This one is a made-up summer calendar for a sample amphitheatre."),
      h("div", { class: "tickets" }, SAMPLE_MARKETS.filter((m) => m.kind === "venue").map(ticketFor)),
      h("p", { class: "own-link" }, "Have your own season? ", h("a", { href: "#/own", "data-testid": "use-own-schedule" }, "Use your own schedule"), "."),
    ),
  );
}

export function ownView(): HTMLElement {
  let chosen: GeoHit | null = null;
  const status = h("p", { class: "help", role: "status" });
  const results = h("ul", { class: "results" });
  const q = h("input", { id: "city", type: "search", autocomplete: "off", placeholder: "For example, Tulsa" });
  const file = h("input", { id: "csvfile", type: "file", accept: ".csv,text/csv,.txt", "aria-label": "Upload a CSV file" });
  const paste = h("textarea", { id: "csvtext", "aria-describedby": "csvhelp", spellcheck: "false", placeholder: CSV_TEMPLATE });
  const errors = h("div", { role: "alert", class: "error" });
  const go = h("button", { type: "button", class: "btn pri", "data-testid": "check-mine" }, "Check my calendar", icon("arrowRight"));

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
    void startCheck({ label: chosen.label, lon: chosen.lon, lat: chosen.lat, sig: chosen.sig }, rows, rowErrors, null);
  });

  return h(
    "section",
    { class: "scene scene--pick" },
    h(
      "div",
      { class: "wrap" },
      sceneHead("Get started · Bring your own", "Use your own", "calendar", "Two things: where your ballpark is (any US or Canadian city), and your theme nights."),
      h(
        "div",
        { class: "paper" },
        h("div", { class: "field" }, h("label", { for: "city" }, "1. Your ballpark's city"), h("div", { class: "actions" }, q, h("button", { type: "button", class: "btn gold", onclick: () => void search() }, icon("search"), "Search")), status, results),
        h(
          "div",
          { class: "field" },
          h("label", { for: "csvtext" }, "2. Your theme nights"),
          h("p", { id: "csvhelp", class: "help" }, "One row per theme night, with a header row on top. Upload a file or paste the rows here."),
          h(
            "dl",
            { class: "cols" },
            h("dt", null, "date"), h("dd", null, "The game date, like 2026-04-10 or 4/10/2026."),
            h("dt", null, "theme"), h("dd", null, "The theme night's name, like Bluey Night or Fireworks Friday."),
            h("dt", null, "sponsor"), h("dd", null, "Optional. Who presents the night. It stays on the date."),
            h("dt", null, "locked"), h("dd", null, "yes if the night can't change (a signed deal), otherwise no."),
            h("dt", null, "notes"), h("dd", null, "Optional. Anything you want to remember."),
          ),
          h("p", { class: "help" }, "Themes we don't recognise are left alone. They stay on your calendar as planned, marked \"Not scored\"."),
          h(
            "div",
            { class: "actions" },
            h("button", { type: "button", class: "btn gold sm", "data-testid": "load-example", onclick: () => { paste.value = exampleCsv(); errors.replaceChildren(); } }, "Load an example"),
            h("button", { type: "button", class: "btn ghost sm dark", onclick: () => download("homestand-template.csv", "text/csv", CSV_TEMPLATE) }, icon("download"), "Download the template"),
            file,
          ),
          paste,
        ),
        errors,
        h("div", { class: "actions" }, go),
      ),
    ),
  );
}
