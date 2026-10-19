import type { ExportRow } from "../../app/export/csv";
import { exportCsv } from "../../app/export/csv";
import { exportIcs } from "../../app/export/ics";
import { buildMemoHtml, memoDocument, type MemoData } from "../../app/export/memo";
import { themeById } from "../../app/themes/library";
import { syntheticBanner } from "../components";
import { makeCard, specOf } from "../foil/cards";
import { ideaTitles } from "./fix";
import { Fireworks } from "../foil/fx";
import { onCleanup, onMount, onResize, route, routeContext, whileVisible } from "../foil/lifecycle";
import { gsap, reduced } from "../foil/motion";
import { crowdBar } from "../foil/scenery";
import { download, formatDate, h } from "../dom";
import { navigate } from "../flow";
import { localDay } from "../../app/text";
import { icon } from "../icons";
import { approvedSwaps, state, viewOf } from "../store";


function exportRows(): ExportRow[] {
  const a = state.analysis!;
  return a.nights.map((n) => {
    const v = viewOf(n);
    return { date: n.date, theme: v.swappedFrom ? v.themeLabel : n.theme, sponsor: n.sponsor, locked: n.locked, notes: v.swappedFrom ? [n.notes, `Swapped from ${n.theme} (Homestand${v.discovered ? ", discovered by Qloo" : ""})`].filter(Boolean).join(". ") : n.notes };
  });
}

function ideasOf(marketLabel: string): MemoData["ideas"] {
  const d = state.propose?.discovery;
  if (!d) return undefined;
  const titles = ideaTitles(d);
  return titles.length === 0 ? undefined : { city: marketLabel.split(",")[0]!.replace(/ (sample )?club$/, ""), titles, young: d.young.map((x) => x.name).filter((n) => !titles.includes(n)).slice(0, 3) };
}

function memoData(): MemoData {
  const a = state.analysis!;
  const swaps = approvedSwaps().map((p) => ({
    date: p.date, weekday: p.weekday, from: themeById(p.fromThemeId)?.label ?? p.fromThemeId, to: p.discovered?.name ?? themeById(p.toThemeId)?.label ?? p.toThemeId, sponsor: p.sponsor,
    fromZ: p.from.z, toZ: p.to.z, fromScore: p.from.score, toScore: p.to.score, why: p.why, source: p.whySource, discovered: !!p.discovered,
  }));
  return {
    club: a.market.label, generatedOn: localDay(), swaps,
    angles: (state.propose?.angles ?? []).map((x) => x.text), nights: a.nights.length, classic: a.nights.filter((n) => n.resolution.kind === "classic").length,
    ideas: ideasOf(a.market.label),
    synthetic: a.mode === "synthetic" || a.reference.synthetic, recordedOn: a.recordedAt ? localDay(new Date(a.recordedAt)) : a.recordedOn,
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
  const stem = (state.sampleId ?? "my-club") + "-season";
  const data = memoData();

  const summary = swaps.length === 0 ? "No swaps approved, so the calendar is unchanged. You can still export it and the memo." : `${swaps.length} swap${swaps.length === 1 ? "" : "s"} approved. Each keeps its date and sponsor.`;

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
  const caption = swaps.length === 0 ? "The deck stands as planned" : `${counts("leans-in")} in \u00b7 ${counts("average")} average \u00b7 ${counts("leans-away")} away${counts("found") > 0 ? ` \u00b7 ${counts("found")} found` : ""}`;

  const canvas = h("canvas", { id: "fx3", "aria-hidden": "true" });
  const final = h(
    "div",
    { class: "final" },
    h("h2", { class: "final-h" }, "The finished deck"),
    h("div", { class: "grid grid--final" }, views.map((v) => {
      const c = makeCard(specOf(v), { inert: true, extra: v.swappedFrom ? [h("div", { class: "stamp stamp--swap" }, "SWAPPED")] : [] });
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
          h("p", { class: "sum", "data-testid": "send-summary" }, summary),
          syntheticBanner(),
          h(
            "div",
            { class: "exp" },
            h("button", { type: "button", class: "btn gold", "data-testid": "dl-csv", onclick: () => download(`${stem}.csv`, "text/csv", exportCsv(rows)) }, icon("download"), "Download CSV"),
            h("button", { type: "button", class: "btn gold", "data-testid": "dl-ics", onclick: () => download(`${stem}.ics`, "text/calendar", exportIcs(rows, a.market.label, new Date().toISOString())) }, icon("download"), "Download calendar (.ics)"),
            h("button", { type: "button", class: "btn ghost", "data-testid": "dl-memo", onclick: () => download(`${stem}-memo.html`, "text/html", memoDocument(memoData())) }, icon("download"), "Download memo (HTML)"),
            h("button", { type: "button", class: "btn ghost", "data-testid": "print-memo", onclick: () => window.print() }, icon("printer"), "Print memo"),
          ),
          h("h2", { class: "memo-h" }, `Rationale memo, ${formatDate(data.generatedOn)}`),
          memoSheet(data),
          h("a", { class: "btn pri", href: "#/study", "data-testid": "to-study" }, "Did local taste really predict crowds? See The Study", icon("arrowRight")),
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
