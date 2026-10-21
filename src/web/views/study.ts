import type { Interval, Verdict } from "../../study/analysis";
import { personalLine } from "../../app/text";
import { STUDY_THEMES } from "../../study/themes";
import { h } from "../dom";
import { onCleanup, onResize } from "../foil/lifecycle";
import { dpr, gsap, reduced, tween } from "../foil/motion";
import { makeRand } from "../foil/rng";
import { icon } from "../icons";
import { bulbs } from "../foil/scenery";
import { loadStudy, type PublishedResults } from "../study-data";

/** Clubs in the study: all were scored; 89 of them ran two or more different themes, which is what makes a pair (study/PULL_RECORD.md). */
const STUDY_CLUBS = 120;
/** Clubs that ran at least one of the nine themes in 2025, so the 385 nights came from these (counted from the local 2025 theme-night list). The other 14 were scored but ran none. */
const NIGHT_CLUBS = 106;
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
const interval = (i: Interval): string => `${pct(i.estimate)} (likely range: ${pct(i.lo)} to ${pct(i.hi)})`;

const VERDICT_WORDS: Record<Verdict, string> = {
  CONFIRMED: "Local taste beat the line we set before looking. In pairs of theme nights at the same ballpark, it picked the better-drawing night at least 55% of the time, and the likely range stays above a coin flip.",
  "CALL STANDS": "Taste picked the bigger crowd about as often as a coin flip would, and the likely range includes a coin flip. That does not prove taste never matters: a small real effect could still hide at this sample size.",
  OVERTURNED: "The likely range sits below a coin flip. At this sample size, local taste pointed the wrong way more often than the right way.",
};

/** One large, plain line directly under the stamp, with the number in it. */
const stampPlain = (v: Verdict, est: number, llmEst?: number): string => {
  const n = Math.round(est * 100);
  return v === "CONFIRMED" ? `Local taste picked the bigger crowd ${n} times in 100, more often than the bar we set.` : v === "OVERTURNED" ? `Local taste picked the bigger crowd only ${n} times in 100: it pointed the wrong way.` : `Neither local taste (${n} times in 100)${llmEst === undefined ? "" : ` nor an AI guess (${Math.round(llmEst * 100)} in 100, mostly ties)`} predicted the bigger crowd better than chance in one season.`;
};

/** The short version, before any numbers. */
const SHORT_VERSION: Record<Verdict, string> = {
  CONFIRMED: "The short version: local taste did predict which theme nights drew bigger crowds.",
  "CALL STANDS": "The short version: local taste did not predict which theme nights drew bigger crowds.",
  OVERTURNED: "The short version: local taste pointed the wrong way on which theme nights drew bigger crowds.",
};

const SVG = "http://www.w3.org/2000/svg";
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Accuracy strips on one 40% to 70% axis, with the 50% coin-flip line and the 55% bar we set. */
function chart(r: PublishedResults): SVGSVGElement {
  const W = 640, left = 168, right = 24, top = 30, rowH = 44;
  const lo = 0.4, hi = 0.7;
  const x = (v: number): number => left + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (W - left - right);
  const rows: Array<{ name: string; est: number; lo?: number; hi?: number; emph: boolean }> = [
    { name: "Local taste (Qloo)", est: r.h1.accuracy.estimate, lo: r.h1.accuracy.lo, hi: r.h1.accuracy.hi, emph: true },
    { name: "AI guess, no local data", est: r.h2.llmAccuracy.estimate, lo: r.h2.llmAccuracy.lo, hi: r.h2.llmAccuracy.hi, emph: false },
    { name: "What's popular nationally", est: r.rawLiftAccuracy.nationalPopularityCentred, emph: false },
  ];
  const H = top + rows.length * rowH + 34;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": `Accuracy of three predictors against a 50% coin flip and the 55% bar we set. ${rows.map((q) => `${q.name} ${pct(q.est)}`).join(". ")}.` });
  for (const [v, label, dash] of [[0.5, "Coin flip 50%", "4 4"], [0.55, "The bar we set: 55%", ""]] as const) {
    svg.append(s("line", { x1: x(v), x2: x(v), y1: top - 8, y2: H - 28, stroke: "#f6ead0", "stroke-width": 1.5, ...(dash ? { "stroke-dasharray": dash } : {}) }));
    svg.append(s("text", { x: x(v), y: top - 14, "text-anchor": v === 0.5 ? "end" : "start", dx: v === 0.5 ? -4 : 4 }, label));
  }
  for (const t of [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]) svg.append(s("text", { x: x(t), y: H - 8, "text-anchor": "middle" }, `${Math.round(t * 100)}%`));
  rows.forEach((q, i) => {
    const y = top + i * rowH + rowH / 2;
    svg.append(s("text", { x: 0, y: y + 4, class: q.emph ? "lbl" : "" }, q.name));
    if (q.lo !== undefined && q.hi !== undefined) {
      svg.append(s("line", { x1: x(q.lo), x2: x(q.hi), y1: y, y2: y, stroke: "#f6ead0", "stroke-width": q.emph ? 3 : 2 }));
      svg.append(s("line", { x1: x(q.lo), x2: x(q.lo), y1: y - 6, y2: y + 6, stroke: "#f6ead0", "stroke-width": 2 }));
      svg.append(s("line", { x1: x(q.hi), x2: x(q.hi), y1: y - 6, y2: y + 6, stroke: "#f6ead0", "stroke-width": 2 }));
    }
    svg.append(s("circle", { cx: x(q.est), cy: y, r: q.emph ? 7 : 5.5, fill: q.emph ? "#ffd97a" : "#cfd3ee", stroke: "#050818", "stroke-width": 2 }));
  });
  return svg;
}

/** How many different answers each method gave across the clubs, per theme: bars on one 0 to 120 axis. */
function distinctChart(r: PublishedResults): SVGSVGElement {
  const W = 640, left = 130, right = 36, top = 26, rowH = 30, max = 120;
  const x = (v: number): number => left + (Math.min(max, v) / max) * (W - left - right);
  const rows = STUDY_THEMES.flatMap((t) => (r.perTheme[t.id] ? [{ label: t.label, ai: r.perTheme[t.id]!.llmDistinct, q: r.perTheme[t.id]!.qlooDistinct }] : []));
  const H = top + rows.length * rowH + 26;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": `Different answers across the clubs, by theme. ${rows.map((q) => `${q.label}: AI guess ${q.ai}, Qloo ${q.q}`).join(". ")}.` });
  svg.append(s("text", { x: left, y: 12 }, "AI guess (light)"));
  svg.append(s("text", { x: left + 140, y: 12 }, "Qloo (gold)"));
  rows.forEach((q, i) => {
    const y = top + i * rowH;
    svg.append(s("text", { x: 0, y: y + 17, class: "lbl" }, q.label));
    svg.append(s("rect", { x: left, y: y + 3, width: Math.max(2, x(q.ai) - left), height: 9, fill: "#cfd3ee", rx: 2 }));
    svg.append(s("text", { x: x(q.ai) + 5, y: y + 12 }, String(q.ai)));
    svg.append(s("rect", { x: left, y: y + 14, width: Math.max(2, x(q.q) - left), height: 9, fill: "#ffd97a", rx: 2 }));
    svg.append(s("text", { x: x(q.q) + 5, y: y + 23 }, String(q.q)));
  });
  for (const t of [0, 40, 80, 120]) svg.append(s("text", { x: x(t), y: H - 6, "text-anchor": "middle" }, String(t)));
  return svg;
}

/** The plain sentence that leads the results: an AI guess can't tell towns apart. Built from the published per-theme counts. */
function townsLine(r: PublishedResults): string {
  const themes = STUDY_THEMES.flatMap((t) => (r.perTheme[t.id] ? [r.perTheme[t.id]!] : []));
  const same = themes.filter((t) => t.llmDistinct === 1).length;
  const lo = Math.min(...themes.map((t) => t.qlooDistinct)), hi = Math.max(...themes.map((t) => t.qlooDistinct));
  return `An AI guess can't tell towns apart: for ${same} of ${themes.length} themes it gave the same answer at every club it rated (${[...new Set(themes.filter((t) => t.llmDistinct === 1).map((t) => t.llmScored))].sort((a, b) => b - a).join(" or ")} clubs, depending on the theme). Qloo gave ${lo === hi ? hi : `${lo} to ${hi}`} different readings per theme across the same 120 clubs.`;
}

const STAMP_WORD = { CONFIRMED: "CONFIRMED", "CALL STANDS": "NOT PROVEN", OVERTURNED: "OVERTURNED" } as const;
const REVIEW_MS = { dots: 1900, notes: 1300, meter: 1800, verdict: 3500 };

/** Dot piles: one dot per pair of theme nights, drawn in two piles. Positions are illustrative; the counts are the study's. */
function dotLayout(w: number, h: number, a: number, b: number): Dot[] {
  const { R, rr } = makeRand(5);
  const out: Dot[] = [];
  const pile = (cx: number, N: number, tag: "a" | "b"): void => {
    if (N <= 0) return;
    const sp = Math.min(11.5, ((h - 18) / (Math.sqrt(N) * 0.9)) * 1.15);
    const asp = 1.8;
    const cand: Array<{ x: number; y: number; d: number }> = [];
    const rowsN = Math.ceil(Math.sqrt(N / asp) * 1.5);
    for (let r = -rowsN; r <= rowsN; r++) for (let c = -rowsN * 3; c <= rowsN * 3; c++) {
      const x = c * sp + (r % 2 ? sp / 2 : 0), y = r * sp * 0.87;
      cand.push({ x, y, d: Math.hypot(x / asp, y) });
    }
    cand.sort((p, q) => p.d - q.d);
    const pick = cand.slice(0, N);
    const maxY = Math.max(...pick.map((p) => p.y));
    const minX = Math.min(...pick.map((p) => p.x)), maxX = Math.max(...pick.map((p) => p.x));
    const k = Math.min(1, (w * 0.42) / (maxX - minX + sp));
    for (const p of pick) out.push({ tag, r: Math.max(1.6, sp * 0.38 * k), x: cx + p.x * k + (R() - 0.5) * 1.4, y: h - 12 - (maxY - p.y) * k + (R() - 0.5) * 1.4, sx: rr(0, w), sy: -20 - R() * 60, d: R() * 0.95 });
  };
  pile(w * 0.27, a, "a");
  pile(w * 0.73, b, "b");
  return out;
}

interface Dot { tag: "a" | "b"; r: number; x: number; y: number; sx: number; sy: number; d: number }

export function studyView(): HTMLElement {
  const view = loadStudy();
  const root = h("div", { class: "study-body" });
  const reveal = h("div", { "data-testid": "study-results" });

  const intro = h(
    "div",
    { class: "scene-head" },
    h("div", { class: "eyebrow" }, "We tested it"),
    h("h1", { class: "h2", tabindex: "-1" }, "The Study ", h("em", null, "does local taste sell tickets?")),
    h("p", { class: "lede wide" }, "Ratings say what a town likes. They do not say a theme will raise attendance. So we tested it on real 2025 theme nights, with the method and the bar we set written down before we looked at any result."),
    h("p", { class: "lede wide study-scope", "data-testid": "study-baseball-only" }, h("strong", null, "The Study is baseball only. "), "It uses real 2025 Minor League Baseball data. We have not tested basketball, hockey or soccer."),
  );

  const calls = h(
    "div",
    { class: "calls", role: "group", "aria-label": "Your call" },
    (["Yes", "No", "Not sure"] as const).map((c) =>
      h("button", { type: "button", class: "call", "aria-pressed": String(call === c), "data-testid": `call-${c.toLowerCase().replace(" ", "-")}`, onclick: () => { saveCall(c); paint(true); } }, c),
    ),
  );
  const stageEl = h("div", { class: "bd-stage", id: "bdStage" });
  const board = h(
    "div",
    { class: "board", id: "board" },
    bulbs(),
    h("div", { class: "bd-top" }, h("div", { class: "bd-q", id: "q-title" }, h("span", null, "Make your call first"), "Did local taste predict which theme nights drew bigger crowds?"), calls),
    stageEl,
  );
  const section = h("section", { class: "study", id: "study" }, h("div", { class: "wrap study-in" }, intro, board, root));

  const timers: number[] = [];
  let raf = 0;
  let stopTween: () => void = () => undefined;
  let dots: Dot[] | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let finished = false;
  const stop = (): void => {
    timers.forEach(clearTimeout);
    timers.length = 0;
    cancelAnimationFrame(raf);
    stopTween();
  };
  onCleanup(stop);

  function drawDots(t: number, a: number, b: number): void {
    if (!canvas) return;
    const k = dpr(2), w = canvas.clientWidth, hh = canvas.clientHeight;
    if (canvas.width !== Math.round(w * k) || canvas.height !== Math.round(hh * k)) {
      canvas.width = Math.round(w * k);
      canvas.height = Math.round(hh * k);
      dots = null;
    }
    const c = canvas.getContext("2d");
    if (!c) return;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.clearRect(0, 0, w, hh);
    dots ??= dotLayout(w, hh, a, b);
    for (const d of dots) {
      const q = Math.max(0, Math.min(1, (t - d.d) / 0.7)), e = 1 - Math.pow(1 - q, 3);
      if (q <= 0) continue;
      const x = d.sx + (d.x - d.sx) * e, y = d.sy + (d.y - d.sy) * e;
      if (d.tag === "a") {
        c.fillStyle = "rgba(255,217,122,.22)";
        c.beginPath();
        c.arc(x, y, d.r * 1.9, 0, 6.3);
        c.fill();
        c.fillStyle = "#ffd97a";
      } else c.fillStyle = "#8f9bc4";
      c.beginPath();
      c.arc(x, y, d.r, 0, 6.3);
      c.fill();
    }
  }

  /** The scoreboard for a call: dots drop into two piles, the needle climbs to the real accuracy, the verdict is stamped. */
  function review(r: PublishedResults, c: Call, animate: boolean): HTMLElement {
    const acc = r.h1.accuracy;
    const a = Math.round(acc.estimate * r.counts.pairs), b = r.counts.pairs - a;
    const under = h("div", { class: "under" }, h("i"), "Under review");
    canvas = h("canvas", { id: "dots", "aria-label": `${r.counts.pairs} dots, one per pair of theme nights`, role: "img" });
    const dls = h("div", { class: "dls" }, h("div", { class: "dl dl-a" }, h("b", null, String(a)), "taste picked the bigger crowd"), h("div", { class: "dl dl-b" }, h("b", null, String(b)), "it didn't"));
    const dnote = h("p", { class: "dnote" }, `${r.counts.nightsInput} theme nights at ${NIGHT_CLUBS} clubs (all ${STUDY_CLUBS} clubs were scored). The ${r.counts.clubsWithPairs} clubs that ran two or more different themes made ${r.counts.pairs} same-ballpark pairs (any two nights at one club), so there are more pairs than nights. Each dot is one real pair. The counts are real; positions are illustrative.`);
    const nval = h("b", null, "0.0%");
    const needle = h("div", { class: "needle" }, nval);
    const ci = h("div", { class: "ci", style: `left:${(acc.lo * 100).toFixed(1)}%;width:${((acc.hi - acc.lo) * 100).toFixed(1)}%` });
    const meter = h(
      "div",
      { class: "meter" },
      h("div", { class: "mt" }, ci, h("div", { class: "ln l50" }, h("span", null, "Coin flip 50%")), h("div", { class: "ln l55" }, h("span", null, "The bar we set: 55%")), needle),
      h("div", { class: "ms" }, h("span", null, "0%"), h("span", null, "100%")),
      h("p", { class: "mci" }, `Likely range: ${pct(acc.lo)} to ${pct(acc.hi)}`),
    );
    const verdict = h(
      "div",
      { class: "verdict", "data-testid": "verdict" },
      h("span", { class: "small" }, "The result:"),
      h("div", { class: "stampv" }, STAMP_WORD[r.h1.verdict]),
      h("p", { class: "stamp-plain", "data-testid": "stamp-plain" }, stampPlain(r.h1.verdict, acc.estimate, r.h2.llmAccuracy.estimate)),
      h("p", { class: "v1" }, VERDICT_WORDS[r.h1.verdict]),
      h("p", { class: "echo", "data-testid": "you-said" }, personalLine(c, r.h1.verdict)),
      h("button", { type: "button", class: "btn ghost sm", id: "again", onclick: () => { call = null; try { sessionStorage.removeItem("homestand.call"); } catch { /* ignore */ } paint(false); } }, "Make a different call"),
    );
    const skip = h("button", { type: "button", class: "skip", id: "skip", onclick: () => final() }, "Skip");
    const lead = h("p", { class: "honest lead", "data-testid": "plain-result" }, SHORT_VERSION[r.h1.verdict]);
    const block = h("div", { class: "review" }, under, lead, h("div", { class: "dotsw" }, canvas), dls, dnote, meter, verdict, skip);

    const setNeedle = (v: number): void => {
      needle.style.left = `${v}%`;
      nval.textContent = `${v.toFixed(1)}%`;
    };
    const show = (...els: HTMLElement[]): void => els.forEach((e) => (e.style.opacity = "1"));
    function final(): void {
      stop();
      finished = true;
      drawDots(9, a, b);
      under.classList.add("fin");
      under.replaceChildren(h("i"), "Review complete");
      ci.style.opacity = "1";
      setNeedle(acc.estimate * 100);
      show(meter, verdict, dnote, dls, lead);
      for (const e of [meter, verdict, dnote, dls, lead]) e.style.transition = "";
      skip.hidden = true;
    }
    finalRef = final;
    stageEl.replaceChildren(block);
    // The canvas needs a layout before it can be drawn.
    requestAnimationFrame(() => {
      if (!animate || reduced()) {
        final();
        return;
      }
      // The short version gives the answer away, so it waits for the stamp like the rest of the verdict.
      [meter, verdict, dnote, dls, lead].forEach((e) => (e.style.opacity = "0"));
      ci.style.opacity = "0";
      const t0 = performance.now();
      const loop = (now: number): void => {
        const t = (now - t0) / 1000;
        drawDots(t, a, b);
        if (t < REVIEW_MS.dots / 1000) raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      const T = (ms: number, f: () => void): void => void timers.push(window.setTimeout(f, ms));
      T(REVIEW_MS.notes, () => {
        for (const e of [dls, dnote]) e.style.transition = "opacity .6s";
        show(dls, dnote);
      });
      T(REVIEW_MS.meter, () => {
        meter.style.transition = "opacity .5s";
        show(meter);
        stopTween = tween(0, acc.estimate * 100, 1500, setNeedle, () => {
          ci.style.opacity = "1";
        });
      });
      T(REVIEW_MS.verdict, () => {
        show(verdict, lead);
        const stamp = verdict.querySelector(".stampv");
        if (stamp) gsap.fromTo(stamp, { scale: 2.6, opacity: 0, rotation: -14 }, { scale: 1, opacity: 1, rotation: -4, duration: 0.45, ease: "back.out(1.6)" });
        under.classList.add("fin");
        under.replaceChildren(h("i"), "Review complete");
        skip.hidden = true;
        finished = true;
      });
    });
    return block;
  }
  let finalRef: () => void = () => undefined;

  function paint(animate: boolean): void {
    stop();
    finished = false;
    dots = null;
    canvas = null;
    calls.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === call)));
    root.replaceChildren();
    if (call === null) {
      stageEl.replaceChildren(h("div", { class: "hold" }, "Nothing is shown until you make your call."));
      return;
    }
    if (view.results !== null) review(view.results, call, animate);
    else stageEl.replaceChildren(h("div", { class: "pending", "data-testid": "results-pending" }, h("h2", null, "Results pending"), h("p", null, `You said ${call}. The final numbers are not published yet. They appear here as soon as the planned analysis has run, whatever they show.`)));
    reveal.replaceChildren(...results(view));
    root.append(reveal);
  }
  paint(false);
  onResize(() => {
    if (finished && canvas) {
      dots = null;
      finalRef();
    }
  });
  return h("div", { class: "page" }, section);
}

function results(view: ReturnType<typeof loadStudy>): HTMLElement[] {
  const links = h(
    "section",
    { class: "sect" },
    h("h2", null, "Read the paper trail"),
    h("ul", { class: "checks" },
      h("li", null, h("a", { href: `${REPO}/blob/master/study/PREREGISTRATION.md` }, "Our plan, written before we looked"), " (before any Qloo score was pulled; its later changes are listed in it)"),
      h("li", null, h("a", { href: `${REPO}/blob/master/DATA_RIGHTS.md` }, "Data rights"), ": no MLB game data is published"),
      h("li", null, h("a", { href: REPO }, "The code")),
    ),
  );
  const limits = h(
    "section",
    { class: "sect" },
    h("h2", null, "Limits"),
    h("ul", { class: "checks" },
      h("li", null, "One season (2025) and nine themes. This is a test of local taste, not a model of attendance."),
      h("li", null, "Several themes rest on one Qloo title or artist (Bluey, Margaritaville, Wrestling, Harry Potter, Marvel). One is a thin stand-in for a whole theme."),
      h("li", null, "Qloo scores for very popular entities sit close to 1 everywhere, so differences between towns can be small. Country is the weakest case."),
      h("li", null, "Theme nights carry other promotions we could not control. That adds noise; it could also favour local taste if clubs stack promotions on themes their town loves."),
      h("li", null, "Princess nights are a proxy for children's dress-up nights."),
      h("li", null, "National popularity is the same for every club, so on this design it cannot rank two themes inside one club and scores exactly a coin flip."),
      h("li", null, "Qloo describes its affinity score as the strength of the link between a place and an interest (", h("a", { href: "https://qloo.com/resources/how-qloos-affinity-score-measures-consumer-preferences" }, "Qloo on its affinity score"), "). That is a measure of local taste, not a forecast of what people will do. We tested the forecast question separately, and did not assume it."),
      h("li", null, "A result that misses the line does not prove taste never matters. It means we could not show it at this sample size."),
    ),
  );

  const end = h("div", { class: "page-end", "data-testid": "study-end" }, h("a", { class: "btn pri", href: "#/sample" }, "Try a sample club", icon("arrowRight")));
  if (view.results === null) return [limits, links, end];
  const r = view.results;
  const banner = view.pending
    ? h("div", { class: "pending", "data-testid": "results-pending" }, h("h2", null, view.synthetic ? "Results pending: the numbers below are SYNTHETIC" : "Results pending"), h("p", null, "These are made-up placeholder numbers to show the layout. The real results replace them when the analysis has run."))
    : null;
  return [
    banner ?? h("span"),
    h(
      "section", { class: "sect", "data-testid": "towns-section" },
      h("h2", null, "First, can the method tell towns apart?"),
      h("p", { "data-testid": "towns-line" }, townsLine(r)),
      distinctChart(r),
      h("p", { class: "small" }, "Different answers across the 120 clubs, per theme (most possible: 120). A method that gives every town the same answer has nothing local to offer. Qloo's count stops near 100 because 19 clubs got exactly the same readings as a neighbouring club (for example Tampa, Clearwater and Bradenton, or Durham and Greensboro), which fits Qloo treating nearby places as one local area. We did not confirm how Qloo does that. Telling towns apart is not the same as predicting crowds: that is the test below."),
    ),
    h(
      "section", { class: "sect" },
      h("h2", null, "How often local taste picked the bigger crowd"),
      h("p", { "data-testid": "h1-text" }, `Between two theme nights at the same ballpark, local taste picked the better-drawing one ${interval(r.h1.accuracy)} of the time, over ${r.counts.pairs} pairs at ${r.counts.clubsWithPairs} clubs (${r.counts.nightsInput} theme nights make ${r.counts.pairs} same-ballpark pairs). The bar we set was 55%, with that range above 50%. A coin flip gets 50%.`),
      chart(r),
      h("p", { class: "small" }, `Side by side: an AI guessing with no local data got ${interval(r.h2.llmAccuracy)}, but that is mostly ties: it gave the same rating for nearly every town (${r.flatThemes.llm.length} of 9 themes had no variation at all). What's popular nationally gets exactly ${pct(r.rawLiftAccuracy.nationalPopularityCentred)} by design, because it is the same for every club and so cannot rank two themes inside one club. (A raw, unadjusted count over the nine themes gives ${pct(r.rawLiftAccuracy.nationalPopularity)} for it: a different measure.)`),
    ),
    h(
      "section", { class: "sect" },
      h("h2", null, "Five groups, from least to most local taste"),
      h("p", { class: "small" }, "Theme nights sorted by how strongly their town liked the theme, split into five equal groups."),
      h("div", { class: "table-wrap" },
        h("table", { class: "data" },
          h("thead", null, h("tr", null, ["Group", "Club-themes", "Taste score range", "Crowd vs club's usual"].map((t, i) => h("th", { class: i > 0 ? "num" : "" }, t)))),
          h("tbody", null, r.binnedByQlooZ.map((b, i) => h("tr", null, h("td", null, i === 0 ? "Least" : i === r.binnedByQlooZ.length - 1 ? "Most" : `Group ${i + 1}`), h("td", { class: "num" }, String(b.n)), h("td", { class: "num" }, `${b.zMin.toFixed(1)} to ${b.zMax.toFixed(1)}`), h("td", { class: "num" }, `${b.meanCentredLift >= 0 ? "+" : ""}${((Math.exp(b.meanCentredLift) - 1) * 100).toFixed(1)}%`)))),
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
            const d = r.perTheme[t.id];
            const acc = d?.qlooAccuracy ?? null;
            return h("tr", null, h("td", null, t.label), h("td", { class: "num" }, d ? String(d.pairs) : "n/a"), h("td", { class: "num" }, acc === null ? "n/a" : pct(acc, 0)), h("td", null, acc === null ? "" : h("span", { class: "inline-bar", style: `width:${Math.round(acc * 120)}px`, role: "img", "aria-label": `${pct(acc, 0)}` })));
          })),
        )),
    ),
    limits,
    links,
    end,
  ];
}
