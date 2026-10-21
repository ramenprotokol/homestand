import type { GeoHit } from "../../app/api-types";
import { CSV_HEADER, csvField, parseCalendar, parseDate, parseLocked, type ParsedCalendar } from "../../app/calendar/csv";
import { MAX_CITY } from "../../app/geo";
import { copyFor, SPORT_WORDS, SPORTS, sportOf, type Sport } from "../../app/kind";
import { SAMPLE_MARKETS } from "../../app/markets";
import { csvTemplate, dateExample, exampleCsv, sampleCsv } from "../../app/samples";
import { api, ApiFailure } from "../api";
import { download, h } from "../dom";
import { heroShell } from "../foil/hero";
import { makeCard, type CardSpec } from "../foil/cards";
import { emblemFor } from "../foil/emblems";
import { onMount, routeContext } from "../foil/lifecycle";
import { gsap, reduced } from "../foil/motion";
import { packEl } from "../foil/pack";
import { ridge } from "../foil/scenery";
import { startCheck } from "../flow";
import { icon } from "../icons";
import { loadStudy } from "../study-data";
import { ui } from "../store";

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

/** A memo page beside a calendar page, drawn in code: the revised calendar and the one-page memo that Send makes. */
function memoArt(): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML =
    '<svg viewBox="0 0 220 150" role="img" aria-label="A one-page memo and a calendar"><rect x="14" y="22" width="92" height="116" rx="4" fill="#fbf3de" stroke="#d9c79a"/><rect x="26" y="34" width="52" height="7" rx="2" fill="#16194a"/><g fill="#8a7a58"><rect x="26" y="50" width="68" height="4" rx="2"/><rect x="26" y="60" width="62" height="4" rx="2"/><rect x="26" y="70" width="68" height="4" rx="2"/><rect x="26" y="86" width="40" height="4" rx="2"/><rect x="26" y="96" width="64" height="4" rx="2"/><rect x="26" y="106" width="50" height="4" rx="2"/></g>' +
    '<g transform="rotate(5 160 80)"><rect x="112" y="14" width="96" height="116" rx="4" fill="#fff" stroke="#c9cdea"/><rect x="112" y="14" width="96" height="22" rx="4" fill="#c9283c"/><text x="160" y="30" text-anchor="middle" font-size="11" fill="#fff" font-family="sans-serif" letter-spacing="2">JUNE</text><g fill="#e9ebf7"><rect x="120" y="46" width="16" height="14" rx="2"/><rect x="141" y="46" width="16" height="14" rx="2"/><rect x="162" y="46" width="16" height="14" rx="2"/><rect x="183" y="46" width="16" height="14" rx="2"/><rect x="120" y="66" width="16" height="14" rx="2"/><rect x="162" y="66" width="16" height="14" rx="2"/><rect x="183" y="66" width="16" height="14" rx="2"/><rect x="120" y="86" width="16" height="14" rx="2"/><rect x="141" y="86" width="16" height="14" rx="2"/><rect x="183" y="86" width="16" height="14" rx="2"/></g><rect x="141" y="66" width="16" height="14" rx="2" fill="#f0b94a"/><rect x="162" y="86" width="16" height="14" rx="2" fill="#3fd6c0"/></g></svg>';
  return t.content.firstElementChild as HTMLElement;
}

function teaseSection(): HTMLElement {
  const cards = demoCards();
  const beats = [
    { n: "1", name: "Check", text: "See which nights fit your town. Each card shows its rating in words.", art: h("div", { class: "fan3", "aria-hidden": "true" }, cards) },
    { n: "2", name: "Fix", text: "Approve or reject swaps for the weak nights.", art: h("div", { class: "pack-art", "aria-hidden": "true" }, packEl("div", "", "2 swaps · sealed")) },
    { n: "3", name: "Send", text: "Export the new calendar and a one-page memo.", art: h("div", { class: "memo-art", "aria-hidden": "true" }, memoArt()) },
  ];
  const section = h(
    "section",
    { class: "tease", id: "tease", "aria-label": "How it works" },
    h(
      "div",
      { class: "wrap" },
      h("div", { class: "eyebrow" }, "How it plays"),
      h("h2", { class: "h2" }, "Three moves, ", h("em", null, "one season")),
      h("p", { class: "honest honest-line", "data-testid": "hero-honest" }, "It reads what your town likes. It doesn't forecast ticket sales, and we tested that: ", h("a", { href: "#/study" }, "see The Study"), "."),
      h("p", { class: "qloo-line", "data-testid": "qloo-line" }, h("b", null, "Qloo\u2019s Taste AI"), " supplies the local taste for each town: what people there actually like. Every card is rated against it."),
      h("ol", { class: "how", "aria-label": "How it works" }, beats.map((b) => h("li", { class: "beat" }, h("div", { class: "beat-art" }, b.art), h("div", { class: "beat-copy" }, h("span", { class: "n" }, b.n), h("h3", null, b.name), h("p", null, b.text))))),
      teaser(),
      h("div", { class: "page-end" }, h("a", { class: "btn pri", href: "#/sample", "data-testid": "end-try-sample" }, "Try a sample club", icon("arrowRight"))),
    ),
  );
  onMount(() => mountTease(section, cards));
  return section;
}

function mountTease(section: HTMLElement, cards: HTMLElement[]): void {
  const ctx = routeContext();
  if (reduced()) return;
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
}

export function startView(): HTMLElement {
  const copy = [
    h("h1", { class: "sub", id: "sub", tabindex: "-1" }, "Theme nights your town will actually like."),
    h("p", { class: "hero-lede", "data-testid": "hero-intro" }, "Planning next season's theme nights? Homestand rates each one against what people in your town like, and suggests swaps for the weak ones. Your dates and sponsors stay put, and every swap comes with a reason you can show a sponsor."),
    h("p", { class: "hero-sports", "data-testid": "hero-sports" }, "Built for minor league teams: ", h("b", null, "baseball"), ", ", h("b", null, "basketball"), ", ", h("b", null, "hockey"), " and ", h("b", null, "soccer"), "."),
    h("p", { class: "hero-qloo", "data-testid": "hero-qloo" }, h("span", { class: "gem-dot", "aria-hidden": "true" }), "Powered by ", h("b", null, "Qloo\u2019s Taste AI")),
    h(
      "div",
      { class: "hero-actions", id: "cta" },
      h("a", { class: "btn pri", href: "#/sample", "data-testid": "try-sample" }, "Try a sample club", icon("arrowRight")),
      h("a", { class: "btn ghost", href: "#/own", "data-testid": "use-own" }, "Use your own"),
    ),
  ];
  return h("div", { class: "landing" }, heroShell(copy), ridge(), teaseSection());
}

// ---------- pick a sample club and use your own ----------

function sceneHead(eyebrow: string, title: string, accent: string, lede: string): HTMLElement {
  return h("div", { class: "scene-head" }, h("div", { class: "eyebrow" }, eyebrow), h("h1", { class: "h2", tabindex: "-1" }, `${title} `, h("em", null, accent)), h("p", { class: "lede" }, lede));
}

function ticketFor(m: (typeof SAMPLE_MARKETS)[number]): HTMLElement {
  const venue = m.kind === "venue";
  const W = copyFor(m.kind, sportOf(m.sport));
  const other = !venue && W.sport !== "baseball";
  const count = parseCalendar(sampleCsv(m.id)).rows.length;
  return h(
    "button",
    {
      type: "button",
      class: "ticket",
      "data-testid": `market-${m.id}`,
      onclick: () => {
        const { rows, errors } = parseCalendar(sampleCsv(m.id));
        void startCheck({ label: m.label, lon: m.lon, lat: m.lat }, rows, errors, m.id, true, m.kind, sportOf(m.sport));
      },
    },
    h("span", { class: "tk-stub" }, h("span", { class: "tk-k" }, venue ? "Sample venue" : other ? `Sample ${W.team}` : "Sample club"), h("span", { class: "tk-city" }, m.city)),
    h(
      "span",
      { class: "tk-main" },
      h("b", null, `${m.region} \u00b7 ${count} ${venue ? "dates" : "nights"}`),
      venue ? h("span", null, "A made-up summer concert calendar for a sample amphitheatre. It is not a real venue.") : null,
      other ? h("span", null, `A made-up ${W.sport} team and a ${W.months} calendar. It is not a real team.`) : null,
      h("span", { class: "tk-go" }, venue ? "Open this venue" : other ? `Open this ${W.team}` : "Open this club", icon("arrowRight")),
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
      sceneHead("Get started · Pick a club", "Pick a", "sample club", "Real towns. Made-up schedules and sponsors."),
      ui.pickNote ? h("p", { class: "notice pick-note", role: "status", "data-testid": "pick-note" }, "Pick a club first.") : null,
      h("div", { class: "tickets" }, SAMPLE_MARKETS.filter((m) => m.kind === "club" && sportOf(m.sport) === "baseball").map(ticketFor)),
      h("div", { class: "eyebrow venue-eyebrow" }, "Also works for basketball, hockey and soccer"),
      h("p", { class: "lede venue-lede" }, "Same Check, Fix and Send for any team that runs theme nights. This one is a made-up basketball team."),
      h("div", { class: "tickets", "data-testid": "sport-tickets" }, SAMPLE_MARKETS.filter((m) => m.kind === "club" && sportOf(m.sport) !== "baseball").map(ticketFor)),
      h("div", { class: "eyebrow venue-eyebrow" }, "Also works for concert venues"),
      h("p", { class: "lede venue-lede" }, "Same Check, Fix and Send on a touring-act calendar. This one is a made-up summer calendar for a sample amphitheatre."),
      h("div", { class: "tickets" }, SAMPLE_MARKETS.filter((m) => m.kind === "venue").map(ticketFor)),
      h("p", { class: "own-link" }, "Have your own season? ", h("a", { href: "#/own", "data-testid": "use-own-schedule" }, "Use your own schedule"), "."),
    ),
  );
}

/** A new row starts a week after the last one, so it is a valid date from the first moment. */
function nextWeek(rows: Array<{ date: string }>): string {
  const last = rows.map((r) => parseDate(r.date) ?? "").sort().pop();
  const d = last ? new Date(`${last}T12:00:00Z`) : new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** What was typed on the last run, so "Back to my rows" on Check finds it again. */
let lastText = "";
let lastChosen: GeoHit | null = null;

const SPORT_KEY = "homestand.sport";
/** The sport picked on this page. It survives a reload of this tab (storage can be missing or throw, so nothing depends on it). */
let lastSport: Sport = (() => {
  try {
    return sportOf(sessionStorage.getItem(SPORT_KEY));
  } catch {
    return "baseball";
  }
})();
const rememberSport = (s: Sport): void => {
  lastSport = s;
  try {
    sessionStorage.setItem(SPORT_KEY, s);
  } catch {
    /* no storage: the sport is simply not remembered */
  }
};
/** "2027-11-12" as "11/12/2027". */
const usDate = (iso: string): string => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}`;

export function ownView(): HTMLElement {
  let chosen: GeoHit | null = lastChosen;
  const status = h("p", { class: "help", role: "status" });
  const results = h("ul", { class: "results" });
  const q = h("input", { id: "city", type: "search", autocomplete: "off", maxlength: String(MAX_CITY), placeholder: "For example, Tulsa, OK" });
  const file = h("input", { id: "csvfile", type: "file", accept: ".csv,text/csv,.txt", "aria-label": "Upload a CSV file" });
  const paste = h("textarea", { id: "csvtext", "aria-describedby": "csvhelp", spellcheck: "false", placeholder: csvTemplate(lastSport) });
  let sport: Sport = lastSport;
  const dateHelp = h("dd", null);
  const themeHelp = h("dd", null);
  const sportHint = h("p", { class: "help", "data-testid": "sport-hint", role: "status" });
  /** Pressing a chip: the words on this page follow the sport (the date example, the template, the example calendar). */
  const sportButtons = SPORTS.map((s) =>
    h("button", { type: "button", class: "sport-chip", role: "radio", "aria-checked": String(s === sport), "data-testid": `sport-${s}`, onclick: () => pickSport(s) }, SPORT_WORDS[s].name.replace(/^./, (c) => c.toUpperCase())),
  );
  function pickSport(s: Sport): void {
    sport = s;
    rememberSport(s);
    paintSport();
    if (paste.value.trim() !== "") refresh(); // the date example inside each row message follows the sport
  }
  function paintSport(): void {
    const w = SPORT_WORDS[sport];
    sportButtons.forEach((b, i) => b.setAttribute("aria-checked", String(SPORTS[i] === sport)));
    sportHint.textContent = `${w.name.replace(/^./, (c) => c.toUpperCase())} seasons usually run ${w.months}. Next, the city your ${w.venue} is in.`;
    themeHelp.textContent = `The theme night's name, like Bluey Night or ${w.promo}.`;
    const e = dateExample(sport);
    dateHelp.textContent = `The game date, like ${e} or ${usDate(e)}.`;
    paste.setAttribute("placeholder", csvTemplate(sport));
  }
  const errors = h("div", { role: "alert", class: "error" });
  const check = h("div", { class: "rowcheck", "data-testid": "rowcheck", "aria-live": "polite" });
  const table = h("div", { class: "rowtable", "data-testid": "rowtable" });
  const barCount = h("span", { class: "ab-count", "data-testid": "ab-count", "aria-hidden": "true" });

  // The editor shows exactly what Check will do: every count and message below comes from parseCalendar, the same reader Check uses.
  interface EdRow { line: number; date: string; theme: string; sponsor: string; locked: string; notes: string }
  let model: EdRow[] = [];
  let report: ParsedCalendar = parseCalendar("", dateExample(sport));
  /** The note element under each row's date cell, so one edit can refresh them all (a date can change how the whole file is read). */
  let notes = new Map<EdRow, HTMLElement>();
  const rowText = (r: EdRow): string => [r.date, r.theme, r.sponsor, r.locked, r.notes].map(csvField).join(",");
  const writeBack = (): void => {
    model.forEach((r, i) => (r.line = i + 2));
    paste.value = [CSV_HEADER, ...model.map(rowText)].join("\n") + "\n";
    report = parseCalendar(paste.value, dateExample(sport));
  };
  /** What Check would say about one row: why it is skipped, or (not blocking) what to double-check. */
  const noteFor = (r: EdRow): { text: string; warn: boolean } | null => {
    const bad = report.errors.find((e) => e.line === r.line);
    if (bad) return { text: bad.message, warn: false };
    const dup = report.warnings.find((e) => e.line === r.line);
    return dup ? { text: dup.message, warn: true } : null;
  };
  function paintNotes(): void {
    for (const [r, el] of notes) {
      const n = noteFor(r);
      el.textContent = n?.text ?? "";
      el.hidden = n === null;
      el.classList.toggle("rc-dup", n?.warn === true);
      el.setAttribute("role", n?.warn ? "status" : "alert");
    }
  }
  function summary(): void {
    const ok = report.rows.length;
    const bad = report.errors.length;
    const words = `${ok} ${ok === 1 ? "night" : "nights"} ready`;
    barCount.textContent = words + (bad ? `, ${bad} to fix` : "");
    const lines: HTMLElement[] = [];
    if (!report.headerOk) {
      lines.push(h("p", { class: "rc-warn", "data-testid": "rc-count" }, `${words}.`), h("p", { class: "rc-warn", "data-testid": "rc-header" }, report.errors[0]?.message ?? ""));
      // A pasted spreadsheet without its header row: one click puts the header on top.
      const first = paste.value.split(/\r?\n/, 1)[0]?.split(/[,\t;]/, 1)[0] ?? "";
      if (parseDate(first) !== null) lines.push(h("button", { type: "button", class: "btn ghost sm dark", "data-testid": "add-header", onclick: () => { paste.value = `${CSV_HEADER}\n${paste.value}`; refresh(); } }, "Add the header row"));
    } else {
      lines.push(h("p", { class: bad ? "rc-warn" : "rc-ok", "data-testid": "rc-count" }, `${words}.${bad ? ` ${bad} ${bad === 1 ? "needs" : "need"} a fix (marked below).` : ""}`));
    }
    for (const n of report.notes) lines.push(h("p", { class: "rc-note", "data-testid": "rc-note" }, n));
    check.replaceChildren(...lines);
  }
  /** Draws the table. Only called when rows come or go; editing a cell never redraws it, so focus and typing are kept. */
  function drawTable(): void {
    notes = new Map();
    const afterEdit = (): void => { writeBack(); summary(); paintNotes(); };
    const cell = (r: EdRow, key: "date" | "theme" | "sponsor", label: string): HTMLElement =>
      h("input", { type: "text", value: r[key], "aria-label": `${label}, row ${model.indexOf(r) + 1}`, oninput: (e: Event) => { r[key] = (e.target as HTMLInputElement).value; afterEdit(); } });
    table.replaceChildren(
      h("table", { class: "rows-ed" },
        h("thead", null, h("tr", null, ["Date", "Theme", "Sponsor", "Locked", ""].map((t) => h("th", null, t || h("span", { class: "sr-only" }, "Remove"))))),
        h("tbody", null, model.map((r) => {
          const msg = h("div", { class: "rc-inline", role: "alert", hidden: "" });
          notes.set(r, msg);
          return h("tr", null,
            h("td", { "data-label": "Date" }, cell(r, "date", "Date"), msg),
            h("td", { "data-label": "Theme" }, cell(r, "theme", "Theme")),
            h("td", { "data-label": "Sponsor" }, cell(r, "sponsor", "Sponsor")),
            h("td", { "data-label": "Locked" }, h("input", { type: "checkbox", checked: parseLocked(r.locked) === true, "aria-label": `Locked, row ${model.indexOf(r) + 1}`, onchange: (e: Event) => { r.locked = (e.target as HTMLInputElement).checked ? "yes" : "no"; afterEdit(); } })),
            h("td", null, h("button", { type: "button", class: "btn ghost sm dark", "aria-label": `Delete row ${model.indexOf(r) + 1}`, onclick: () => { model = model.filter((x) => x !== r); afterEdit(); drawTable(); } }, "Delete")),
          );
        })),
      ),
      h("button", { type: "button", class: "btn ghost sm dark", "data-testid": "add-row", onclick: () => { model = [...model, { line: 0, date: nextWeek(model.map((m) => ({ date: parseDate(m.date, report.dayFirst) ?? "" }))), theme: "New night", sponsor: "", locked: "no", notes: "" }]; afterEdit(); drawTable(); paintNotes(); } }, "Add row"),
    );
    paintNotes();
  }
  /** Reads the paste box again (it was typed in, uploaded or filled) and redraws. */
  function refresh(): void {
    if (paste.value.trim() === "") { model = []; report = parseCalendar("", dateExample(sport)); check.replaceChildren(); barCount.textContent = ""; table.replaceChildren(); return; }
    report = parseCalendar(paste.value, dateExample(sport));
    model = report.raw.map((r) => ({ ...r }));
    summary();
    drawTable();
  }
  paste.addEventListener("input", refresh);
  const go = h("button", { type: "button", class: "btn pri", "data-testid": "check-mine" }, "Check my calendar", icon("arrowRight"));

  async function search(): Promise<void> {
    const text = q.value.trim();
    results.replaceChildren();
    chosen = null;
    if (text.length < 2) {
      status.textContent = "Type at least two letters.";
      return;
    }
    if (text.length > MAX_CITY) {
      status.textContent = `That is too long for a city name. Use ${MAX_CITY} characters or fewer, for example "Tulsa, OK".`;
      return;
    }
    status.textContent = "Searching...";
    try {
      const { results: hits, message } = await api.geocode(text);
      status.textContent = hits.length ? (message ? `Choose your home city. ${message}` : "Choose your home city.") : (message ?? `No city called "${text}". Check the spelling, for example "Tulsa, OK".`);
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
    refresh();
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
      errors.scrollIntoView({ block: "center" });
      return;
    }
    lastText = paste.value;
    lastChosen = chosen;
    const { rows, errors: rowErrors } = parseCalendar(paste.value, dateExample(sport));
    if (rows.length === 0) {
      errors.replaceChildren(...rowErrors.map((e) => h("p", null, `Line ${e.line}: ${e.message}`)));
      errors.scrollIntoView({ block: "center" });
      return;
    }
    void startCheck({ label: chosen.label, lon: chosen.lon, lat: chosen.lat, sig: chosen.sig }, rows, rowErrors, null, true, "club", sport);
  });

  paintSport();
  if (lastText) { paste.value = lastText; refresh(); }
  if (lastChosen) status.textContent = `Home city: ${lastChosen.label}.`;
  return h(
    "section",
    { class: "scene scene--pick scene--own" },
    h(
      "div",
      { class: "wrap" },
      sceneHead("Get started · Bring your own", "Use your own", "calendar", "Three things: your sport, your home city (any US or Canadian city), and your theme nights."),
      h(
        "div",
        { class: "paper" },
        h("div", { class: "field", role: "radiogroup", "aria-labelledby": "sport-label" }, h("span", { id: "sport-label", class: "field-label" }, "Your sport"), h("div", { class: "sport-chips" }, sportButtons), sportHint),
        h("div", { class: "field" }, h("label", { for: "city" }, "1. Your home city"), h("div", { class: "actions" }, q, h("button", { type: "button", class: "btn gold", onclick: () => void search() }, icon("search"), "Search")), status, results),
        h(
          "div",
          { class: "field" },
          h("label", { for: "csvtext" }, "2. Your theme nights"),
          h("p", { id: "csvhelp", class: "help" }, "One row per theme night, with a header row on top. Upload a file or paste the rows here."),
          h("p", { class: "help", "data-testid": "any-dates" }, "Use any dates you like, this season or next. Qloo scores what your town likes, so the dates are yours."),
          h(
            "dl",
            { class: "cols" },
            h("dt", null, "date"), dateHelp,
            h("dt", null, "theme"), themeHelp,
            h("dt", null, "sponsor"), h("dd", null, "Optional. Who presents the night. It stays on the date."),
            h("dt", null, "locked"), h("dd", null, "yes if the night can't change (a signed deal), otherwise no."),
            h("dt", null, "notes"), h("dd", null, "Optional. Anything you want to remember."),
          ),
          h("p", { class: "help" }, "Themes we don't recognise are left alone. They stay on your calendar as planned, marked \"No data\"."),
          h(
            "div",
            { class: "actions" },
            h("button", { type: "button", class: "btn gold sm", "data-testid": "load-example", onclick: () => { paste.value = exampleCsv(sport); errors.replaceChildren(); refresh(); } }, "Load an example"),
            h("button", { type: "button", class: "btn ghost sm dark", onclick: () => download("homestand-template.csv", "text/csv", csvTemplate(sport)) }, icon("download"), "Download the template"),
            file,
          ),
          h("p", { class: "help" }, "Paste from a spreadsheet, or edit the rows in the table below."),
          paste,
          check,
          table,
        ),
        errors,
        // On a phone this bar sticks to the bottom of the screen, so the button is always in reach however long the table gets.
        h("div", { class: "actionbar", "data-testid": "actionbar" }, barCount, go),
      ),
    ),
  );
}
