import type { ExportRow } from "../../app/export/csv";
import { exportCsv } from "../../app/export/csv";
import { exportIcs } from "../../app/export/ics";
import { buildMemoHtml, memoDocument, type MemoData } from "../../app/export/memo";
import { themeById } from "../../app/themes/artists";
import { savedCopyBanner, syntheticBanner } from "../components";
import { makeCard, specOf } from "../foil/cards";
import { actIdeas, clubAngleParts, ideaTitles, openerLine } from "./fix";
import { cityOfLabel } from "../../app/kind";
import { fitWordFor } from "../../app/score";
import { dateWithYear, seasonEyebrow } from "../../app/dates";
import { Fireworks } from "../foil/fx";
import { onCleanup, onMount, onResize, route, routeContext, whileVisible } from "../foil/lifecycle";
import { gsap, reduced } from "../foil/motion";
import { crowdBar } from "../foil/scenery";
import { download, formatDateTime, h } from "../dom";
import { navigate } from "../flow";
import { cleanTitle, localDay, longDate } from "../../app/text";
import { icon } from "../icons";
import { approvedSwaps, copy, shownAngles, state, swapTitle, viewOf } from "../store";


function exportRows(): ExportRow[] {
  const a = state.analysis!;
  return a.nights.map((n) => {
    const v = viewOf(n);
    // A venue's swapped date is a new hold: the old note ("offer out") belongs to the act that was dropped, so it is never inherited.
    const note = !v.swappedFrom ? n.notes : state.kind === "venue" ? `New hold${v.discovered ? " (local favorite)" : ""}: withdraw the offer to ${n.theme}` : [n.notes, `Swapped from ${n.theme} (Homestand${v.discovered ? ", local favorite" : ""})`].filter(Boolean).join(". ");
    return { date: n.date, theme: v.swappedFrom ? swapTitle(n.theme, v.themeLabel) : n.theme, sponsor: n.sponsor, locked: n.locked, notes: note, fit: fitWordFor(v.fit, v.slight) };
  });
}

function ideasOf(marketLabel: string): MemoData["ideas"] {
  const d = state.propose?.discovery;
  if (!d) return undefined;
  const titles = ideaTitles(d);
  return titles.length === 0 ? undefined : { city: cityOfLabel(marketLabel), titles, scored: d.scored, poolSize: d.poolSize };
}

function actsOf(marketLabel: string): MemoData["acts"] {
  const d = state.propose?.acts;
  if (!d) return undefined;
  const names = actIdeas(d).map((x) => x.name);
  return names.length === 0 ? undefined : { city: cityOfLabel(marketLabel), names, scored: d.scored, poolSize: d.poolSize };
}

function memoData(): MemoData {
  const a = state.analysis!;
  const swaps = approvedSwaps().map((p) => ({
    date: p.date, weekday: p.weekday, from: a.nights[p.index]!.theme, to: swapTitle(a.nights[p.index]!.theme, p.discovered?.name ?? themeById(p.toThemeId)?.label ?? p.toThemeId), sponsor: p.sponsor,
    fromZ: p.from.z, toZ: p.to.z, fromEntities: (a.themes[p.fromThemeId]?.entities ?? []).map((e) => cleanTitle(e.name)), toEntities: p.discovered ? [p.discovered.name] : (a.themes[p.toThemeId]?.entities ?? []).map((e) => cleanTitle(e.name)), fromScore: p.from.score, toScore: p.to.score, why: p.why, source: p.whySource, discovered: !!p.discovered,
  }));
  const views = a.nights.map(viewOf);
  const props = state.propose?.proposals ?? [];
  const proposedFor = new Map(props.map((p) => [p.index, p]));
  // A clear weak night with no swap at all, versus one that had a swap offered and left undecided. A slight lean is neither.
  const stillWeak = views.filter((v) => v.fit === "leans-away" && !v.slight && !v.swappedFrom && !proposedFor.has(v.night.index)).map((v) => `${dateWithYear(v.night.date)} ${v.night.theme}`);
  const offered = props.filter((p) => !state.decisions[p.id]).map((p) => `${dateWithYear(p.date)} ${a.nights[p.index]!.theme} (offered: ${p.discovered?.name ?? themeById(p.toThemeId)?.label ?? p.toThemeId}${p.optional ? ", optional: only a slight lean" : ""})`);
  const rejected = (state.propose?.proposals ?? []).filter((p) => state.decisions[p.id] === "rejected").map((p) => `${a.nights[p.index]!.theme} \u2192 ${p.discovered?.name ?? themeById(p.toThemeId)?.label ?? p.toThemeId} (${dateWithYear(p.date)})`);
  return {
    stillWeak, offered, rejected,
    ...(state.kind === "venue" ? { kind: "venue" as const, sample: state.sampleId !== null } : state.sport !== "baseball" ? { sport: state.sport, sample: state.sampleId !== null } : {}), club: a.market.label, city: cityOfLabel(a.market.label), generatedOn: localDay(), swaps,
    angles: shownAngles().map((x) => state.kind === "venue" ? openerLine(x) : (([h1, b1, e1]) => [`${h1}.`, b1, e1].filter(Boolean).join(" "))(clubAngleParts(x, cityOfLabel(a.market.label), state.sport))), nights: a.nights.length, suggested: props.filter((p) => !p.optional).length, classic: a.nights.filter((n) => n.resolution.kind === "classic").length,
    ideas: ideasOf(a.market.label),
    ...(state.kind === "venue" ? { acts: actsOf(a.market.label) } : {}),
    synthetic: a.mode === "synthetic" || a.reference.synthetic, recordedLabel: a.recordedAt ? formatDateTime(a.recordedAt) : null,
  };
}

export function sendView(): HTMLElement {
  const a = state.analysis;
  if (!a) {
    navigate("#/sample");
    return h("div");
  }
  const swaps = approvedSwaps();
  const views = a.nights.map(viewOf);
  const rows = exportRows();
  const stem = state.kind === "venue" ? `${state.sampleId ?? "my-venue"}-summer-series` : (state.sampleId ?? `my-${copy().team}`) + "-season";
  const data = memoData();

  const weakLeft = views.filter((v) => v.fit === "leans-away" && !v.slight).length;
  const summary = swaps.length === 0 ? `No ${state.kind === "venue" ? "offers" : "swaps"} made, so the calendar is unchanged. ${weakLeft} weak ${weakLeft === 1 ? copy().night : copy().nights} left. You can still download the memo.` : `${swaps.length} ${state.kind === "venue" ? "offer" : "swap"}${swaps.length === 1 ? "" : "s"} made. ${weakLeft} weak ${weakLeft === 1 ? copy().night : copy().nights} left.`;

  // The fan: every approved swap, landed, in the glowing frame.
  const fan = h("div", { class: "fan" });
  const shownSwaps = swaps.slice(0, 5);
  const rots = shownSwaps.length === 1 ? [0] : shownSwaps.map((_, k) => -21 + (42 * k) / (shownSwaps.length - 1));
  shownSwaps.forEach((p, k) => {
    const c = makeCard(specOf(viewOf(a.nights[p.index]!)), { inert: true });
    c.dataset.notilt = "1";
    c.removeAttribute("aria-label");
    const w = h("div", { class: "fc", "aria-hidden": "true" }, c);
    w.style.transform = `rotate(${rots[k]}deg) translateY(${Math.abs(rots[k]!) * 0.7}px)`;
    fan.append(w);
  });
  const counts = (f: string): number => views.filter((v) => v.fit === f).length;
  const caption = swaps.length === 0 ? "The deck stands as planned" : `${counts("leans-in")} strong \u00b7 ${counts("average")} average \u00b7 ${counts("leans-away")} weak${counts("found") > 0 ? ` \u00b7 ${counts("found")} local favorite` : ""}`;

  const canvas = h("canvas", { id: "fx3", "aria-hidden": "true" });
  const final = h(
    "div",
    { class: "final" },
    h("h2", { class: "final-h" }, "The finished deck"),
    h("div", { class: "grid grid--final" }, views.map((v) => {
      const c = makeCard(specOf(v), { inert: true, extra: v.swappedFrom ? [h("div", { class: "stamp stamp--swap" }, state.kind === "venue" ? "OFFER" : "SWAPPED")] : [] });
      c.dataset.notilt = "1";
      if (v.swappedFrom) c.classList.add("tile--swapped");
      return h("div", { class: "slot" }, c);
    })),
  );

  const section = h(
    "section",
    { class: "send", id: "send" },
    canvas,
    crowdBar(),
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "send-in" },
        h(
          "div",
          { class: "send-l" },
          h("div", { class: "eyebrow" }, "Step 3 of 3 \u00b7 Send"),
          h("h1", { class: "h2", tabindex: "-1" }, "Send: ", h("em", null, "your revised calendar")),
          h("div", { class: "eyebrow season-line", "data-testid": "season-span" }, seasonEyebrow(a.nights.map((n) => n.date), copy().season)),
          h("p", { class: "sum", "data-testid": "send-summary" }, summary),
          syntheticBanner(),
          savedCopyBanner(),
          h(
            "div",
            { class: "exp" },
            h("button", { type: "button", class: "btn gold btn-main", "data-testid": "dl-memo", onclick: () => download(`${stem}-memo.html`, "text/html", memoDocument(memoData())) }, icon("download"), "Download the memo"),
            h(
              "div",
              { class: "exp-2" },
              h("button", { type: "button", class: "btn ghost sm", "data-testid": "dl-ics", onclick: () => download(`${stem}.ics`, "text/calendar", exportIcs(rows, a.market.label, new Date().toISOString(), state.kind)) }, icon("download"), "Add to calendar (.ics)"),
              h("button", { type: "button", class: "btn ghost sm", "data-testid": "dl-csv", onclick: () => download(`${stem}.csv`, "text/csv", exportCsv(rows, state.kind)) }, icon("download"), "Spreadsheet (CSV)"),
              h("button", { type: "button", class: "btn ghost sm", "data-testid": "print-memo", onclick: () => window.print() }, icon("printer"), "Print the memo"),
            ),
          ),
          h("h2", { class: "memo-h" }, `Rationale memo, ${longDate(data.generatedOn)}`),
          memoSheet(data),
          h("a", { class: "btn pri", href: "#/study", "data-testid": "to-study" }, state.kind === "venue" || state.sport !== "baseball" ? "Did local taste predict crowds? The Study tested Minor League baseball only" : "Did local taste really predict crowds? See The Study", icon("arrowRight")),
        ),
        h("div", { class: "send-r" }, h("div", { class: "frame", id: "frame" }, h("i", { class: "c1" }), h("i", { class: "c2" }), h("i", { class: "c3" }), h("i", { class: "c4" }), fan, h("div", { class: "fcap" }, caption))),
      ),
      final,
    ),
  );

  onMount(() => {
    const ctx = routeContext();
    const fw = new Fireworks(canvas, { rate: 0.5, top: [0.08, 0.5], big: 1.8, sparks: 150, fireflies: 40 });
    onResize(() => fw.size());
    onCleanup(() => fw.stop());
    if (reduced()) {
      fw.drawStill();
      return;
    }
    whileVisible(canvas, () => fw.start(), () => fw.stop());
    fw.salvo(2);
    if (route.entering) {
      ctx.add(() => {
        const cards = [...fan.querySelectorAll<HTMLElement>(".fc")];
        if (cards.length > 0) gsap.from(cards, { y: 80, opacity: 0, rotation: 0, duration: 0.9, stagger: 0.12, ease: "back.out(1.4)", clearProps: "opacity" });
        gsap.from(".sum", { opacity: 0, y: 14, duration: 0.6, delay: 0.1 });
      });
    }
  });
  return h("div", { class: "page" }, section);
}

function memoSheet(d: MemoData): HTMLElement {
  const sheet = h("section", { class: "memo-sheet", "data-testid": "memo", "aria-label": "Rationale memo" });
  sheet.innerHTML = buildMemoHtml(d); // every interpolated value is escaped in buildMemoHtml
  return sheet;
}
