import type { Interval, StudyResults, Verdict } from "../../study/analysis";
import { STUDY_THEMES } from "../../study/themes";
import { h } from "../dom";
import { loadStudy } from "../study-data";

const REPO = "https://github.com/ramenprotokol/homestand";
type Call = "Yes" | "No" | "Not sure";
let call: Call | null = readCall();

function readCall(): Call | null {
  try {
    const v = sessionStorage.getItem("homestand.call");
    return v === "Yes" || v === "No" || v === "Not sure" ? v : null;
  } catch {
    return null;
  }
}

function saveCall(c: Call): void {
  call = c;
  try {
    sessionStorage.setItem("homestand.call", c);
  } catch {
    /* private window: the call still works for this page view */
  }
}

const pct = (x: number, d = 1): string => `${(x * 100).toFixed(d)}%`;
const interval = (i: Interval): string => `${pct(i.estimate)} (95% interval ${pct(i.lo)} to ${pct(i.hi)})`;

const VERDICT_WORDS: Record<Verdict, string> = {
  CONFIRMED: "Local taste beat the line we set before looking. In pairs of theme nights at the same ballpark, it picked the better-drawing night at least 55% of the time, and the 95% interval stays above a coin flip.",
  "CALL STANDS": "Not enough evidence either way. The result did not clear the pre-registered line, and the interval does not rule out a coin flip. We do not claim local taste predicts crowds, and we do not claim it fails.",
  OVERTURNED: "The interval sits below a coin flip. At this sample size, local taste pointed the wrong way more often than the right way.",
};

const SVG = "http://www.w3.org/2000/svg";
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Accuracy strips on one 40% to 70% axis, with the 50% coin-flip and 55% pass lines. */
function chart(r: StudyResults): SVGSVGElement {
  const W = 640, left = 168, right = 24, top = 30, rowH = 44;
  const lo = 0.4, hi = 0.7;
  const x = (v: number): number => left + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (W - left - right);
  const rows: Array<{ name: string; est: number; lo?: number; hi?: number; emph: boolean }> = [
    { name: "Local taste (Qloo)", est: r.h1.accuracy.estimate, lo: r.h1.accuracy.lo, hi: r.h1.accuracy.hi, emph: true },
    { name: "LLM-only guess", est: r.h2.llmAccuracy.estimate, lo: r.h2.llmAccuracy.lo, hi: r.h2.llmAccuracy.hi, emph: false },
    { name: "National popularity", est: r.descriptive.raw.nationalPopularityCentred, emph: false },
  ];
  const H = top + rows.length * rowH + 34;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": `Accuracy of three predictors against a 50% coin flip and the 55% pass line. ${rows.map((q) => `${q.name} ${pct(q.est)}`).join(". ")}.` });
  for (const [v, label, dash] of [[0.5, "Coin flip 50%", "4 4"], [0.55, "Pass line 55%", ""]] as const) {
    svg.append(s("line", { x1: x(v), x2: x(v), y1: top - 8, y2: H - 28, stroke: "#14233c", "stroke-width": 1.5, ...(dash ? { "stroke-dasharray": dash } : {}) }));
    svg.append(s("text", { x: x(v), y: top - 14, "text-anchor": v === 0.5 ? "end" : "start", dx: v === 0.5 ? -4 : 4 }, label));
  }
  for (const t of [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]) svg.append(s("text", { x: x(t), y: H - 8, "text-anchor": "middle" }, `${Math.round(t * 100)}%`));
  rows.forEach((q, i) => {
    const y = top + i * rowH + rowH / 2;
    svg.append(s("text", { x: 0, y: y + 4, class: q.emph ? "lbl" : "" }, q.name));
    if (q.lo !== undefined && q.hi !== undefined) {
      svg.append(s("line", { x1: x(q.lo), x2: x(q.hi), y1: y, y2: y, stroke: "#14233c", "stroke-width": q.emph ? 3 : 2 }));
      svg.append(s("line", { x1: x(q.lo), x2: x(q.lo), y1: y - 6, y2: y + 6, stroke: "#14233c", "stroke-width": 2 }));
      svg.append(s("line", { x1: x(q.hi), x2: x(q.hi), y1: y - 6, y2: y + 6, stroke: "#14233c", "stroke-width": 2 }));
    }
    svg.append(s("circle", { cx: x(q.est), cy: y, r: q.emph ? 7 : 5.5, fill: q.emph ? "#b83a0b" : "#14233c", stroke: "#fff", "stroke-width": 2 }));
  });
  return svg;
}

export function studyView(): HTMLElement {
  const view = loadStudy();
  const root = h("div", { class: "study" });
  const reveal = h("div", { class: "study", "data-testid": "study-results" });

  const intro = h(
    "div",
    { class: "page-head" },
    h("h1", { tabindex: "-1" }, "The Study"),
    h("p", { class: "lede" }, "Scores say what a market leans toward. They do not say a theme will raise attendance. So we tested it on real 2025 theme nights, with the method and the pass line written down before we looked at any result."),
  );

  const question = h(
    "section",
    { class: "sect", "aria-labelledby": "q-title" },
    h("span", { class: "note-marker" }, "Make your call first"),
    h("h2", { id: "q-title" }, "Did local taste predict which theme nights drew bigger crowds?"),
    h(
      "div",
      { class: "call", role: "group", "aria-label": "Your call" },
      (["Yes", "No", "Not sure"] as const).map((c) =>
        h("button", { type: "button", class: "btn", "aria-pressed": String(call === c), "data-testid": `call-${c.toLowerCase().replace(" ", "-")}`, onclick: () => { saveCall(c); paint(); } }, c),
      ),
    ),
  );

  function paint(): void {
    root.replaceChildren(intro, question);
    question.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === call)));
    if (call === null) {
      root.append(h("p", { class: "small" }, "Pick one to see what the study found."));
      return;
    }
    reveal.replaceChildren(...results(view, call));
    root.append(reveal);
  }
  paint();
  return root;
}

function results(view: ReturnType<typeof loadStudy>, call: Call): HTMLElement[] {
  const links = h(
    "section",
    { class: "sect" },
    h("h2", null, "Read the paper trail"),
    h("ul", { class: "checks" },
      h("li", null, h("a", { href: `${REPO}/blob/main/study/PREREGISTRATION.md` }, "Pre-registration and Amendments 1 to 4"), " (written before any Qloo score was pulled)"),
      h("li", null, h("a", { href: `${REPO}/blob/main/DATA_RIGHTS.md` }, "Data rights"), ": no MLB game data is published"),
      h("li", null, h("a", { href: REPO }, "The code")),
    ),
  );
  const limits = h(
    "section",
    { class: "sect" },
    h("h2", null, "Limits"),
    h("ul", { class: "checks" },
      h("li", null, "One season (2025) and nine themes. This is a test of local taste, not a model of attendance."),
      h("li", null, "Several themes are one Qloo entity (Bluey, Margaritaville, Wrestling, Harry Potter, Marvel). A single entity is a thin proxy for a theme."),
      h("li", null, "Qloo scores for very popular entities sit close to 1 everywhere, so differences between markets can be small. Country is the weakest case."),
      h("li", null, "Theme nights carry other promotions we could not control. That adds noise; it could also favour local taste if clubs stack promotions on themes their market loves."),
      h("li", null, "Princess nights are a proxy for children's dress-up nights."),
      h("li", null, "National popularity is the same for every club, so on this design it cannot rank two themes inside one club and scores exactly a coin flip."),
      h("li", null, "A result that misses the line means \"not detected at this sample size\", not \"disproved\"."),
    ),
  );

  if (view.results === null) {
    return [
      h("div", { class: "pending", "data-testid": "results-pending" }, h("h2", null, "Results pending"), h("p", null, `You said ${call}. The final numbers are not published yet. They appear here as soon as the pre-registered analysis has run, whatever they show.`)),
      limits,
      links,
    ];
  }
  const r = view.results;
  const banner = view.pending
    ? h("div", { class: "pending", "data-testid": "results-pending" }, h("h2", null, view.synthetic ? "Results pending: the numbers below are SYNTHETIC" : "Results pending"), h("p", null, "These are made-up placeholder numbers to show the layout. The real results replace them when the analysis has run."))
    : null;
  return [
    banner ?? h("span"),
    h("div", { class: "verdict", "data-testid": "verdict" }, h("span", { class: "small" }, `You said ${call}. The pre-registered verdict:`), h("span", { class: "verdict-word" }, r.h1.verdict), h("p", null, VERDICT_WORDS[r.h1.verdict])),
    h(
      "section", { class: "sect" },
      h("h2", null, "How often local taste picked the bigger crowd"),
      h("p", { "data-testid": "h1-text" }, `Between two theme nights at the same ballpark, local taste picked the better-drawing one ${interval(r.h1.accuracy)} of the time. The line to pass was 55%, with the interval above 50%. A coin flip gets 50%.`),
      chart(r),
      h("p", { class: "small" }, `Side by side: the LLM-only guess got ${interval(r.h2.llmAccuracy)}. National popularity gets ${pct(r.descriptive.raw.nationalPopularityCentred)} by design, because it is the same for every club and so cannot rank two themes inside one club.`),
    ),
    h(
      "section", { class: "sect" },
      h("h2", null, "Five groups, from least to most local taste"),
      h("p", { class: "small" }, "Theme nights sorted by how strongly their market leaned toward the theme, split into five equal groups."),
      h("div", { class: "table-wrap" },
        h("table", { class: "data" },
          h("thead", null, h("tr", null, ["Group", "Club-themes", "Taste score range (z)", "Crowd vs club's usual"].map((t, i) => h("th", { class: i > 0 ? "num" : "" }, t)))),
          h("tbody", null, r.binned.map((b, i) => h("tr", null, h("td", null, i === 0 ? "Least" : i === r.binned.length - 1 ? "Most" : `Group ${i + 1}`), h("td", { class: "num" }, String(b.n)), h("td", { class: "num" }, `${b.zMin.toFixed(1)} to ${b.zMax.toFixed(1)}`), h("td", { class: "num" }, `${b.meanCentredLift >= 0 ? "+" : ""}${((Math.exp(b.meanCentredLift) - 1) * 100).toFixed(1)}%`)))),
        )),
    ),
    h(
      "section", { class: "sect" },
      h("h2", null, "Theme by theme"),
      h("p", { class: "small" }, "How often local taste picked the bigger crowd in pairs that include each theme. Descriptive only; the coin-flip mark is 50%."),
      h("div", { class: "table-wrap" },
        h("table", { class: "data" },
          h("thead", null, h("tr", null, h("th", null, "Theme"), h("th", { class: "num" }, "Pairs"), h("th", { class: "num" }, "Accuracy"), h("th", null, "vs 50%"))),
          h("tbody", null, STUDY_THEMES.map((t) => {
            const d = r.diagnostics.perTheme[t.id];
            const acc = d?.qlooAccuracy ?? null;
            return h("tr", null, h("td", null, t.label), h("td", { class: "num" }, d ? String(d.pairs) : "n/a"), h("td", { class: "num" }, acc === null ? "n/a" : pct(acc, 0)), h("td", null, acc === null ? "" : h("span", { class: "inline-bar", style: `width:${Math.round(acc * 120)}px`, role: "img", "aria-label": `${pct(acc, 0)}` })));
          })),
        )),
    ),
    limits,
    links,
  ];
}
