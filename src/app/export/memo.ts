import { copyFor, type Kind } from "../kind";
import { methodWords, pullBand } from "../score";
import { longDate } from "../text";

export interface MemoSwap {
  date: string;
  weekday: string;
  from: string;
  to: string;
  sponsor: string;
  fromZ: number | null;
  toZ: number | null;
  fromScore: number | null;
  toScore: number | null;
  why: string;
  /** Where the reason came from: the model, or the fixed template (identical wording for every swap). */
  source?: "model" | "template";
  /** The new night is a title Qloo found, not a library theme: no local-pull number. */
  discovered?: boolean;
  /** The Qloo entities that were checked for the planned theme and for the new one (names only). */
  fromEntities?: string[];
  toEntities?: string[];
}

export interface MemoData {
  /** "venue" for the concert-venue sample; left out for a club, whose memo reads exactly as before. */
  kind?: Kind;
  club: string;
  generatedOn: string;
  swaps: MemoSwap[];
  angles: string[];
  nights: number;
  /** How many swaps Homestand proposed, of which `swaps` are the ones approved. */
  suggested: number;
  classic: number;
  synthetic: boolean;
  /** When the scores were pulled from Qloo, already formatted in the viewer's time zone. */
  recordedLabel: string | null;
  /** Qloo's local family ideas for this area, when they were available. */
  ideas?: { city: string; titles: string[]; scored: number; poolSize: number };
  /** True for a sample calendar we wrote (the memo then says so). */
  sample?: boolean;
  /** Venue runs: acts that stand out near the venue, when the pool was scored. */
  acts?: { city: string; names: string[]; scored: number; poolSize: number };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** "well below", "about usual", "above": the local pull in words, never a raw index. */
const bandText = (z: number | null): string => {
  const b = pullBand(z);
  return b === null ? "n/a" : b === "about" ? "about usual" : b;
};

/** The memo's first sentence: fixed wording, filled only with counts the app knows. No model writes it. */
export function memoOpener(d: Pick<MemoData, "club" | "nights" | "swaps" | "suggested" | "kind">): string {
  const approved = d.swaps.length;
  const suggested = Math.max(d.suggested, approved);
  const head = `Homestand checked ${d.nights} ${copyFor(d.kind).themeNights} for ${d.club} against local taste data from Qloo.`;
  if (suggested === 0) return `${head} It suggested no swaps, so the calendar is unchanged.`;
  const said = `It suggested ${suggested} swap${suggested === 1 ? "" : "s"}; ${approved === 0 ? "none is" : approved === 1 ? "1 is" : `${approved} are`} in the revised calendar.`;
  return `${head} ${said} ${approved === 0 ? "The calendar is unchanged." : "Each approved swap keeps its original date and sponsor."}`;
}

/** One printable page. Cites the local pull (index) behind each swap; never the per-entity Qloo values. */
export function buildMemoHtml(d: MemoData): string {
  const C = copyFor(d.kind);
  const venue = d.kind === "venue";
  const rows = d.swaps
    .map(
      (s) => `<tr><td>${escapeHtml(s.weekday.slice(0, 3))} ${escapeHtml(longDate(s.date).replace(/^(\w{3})\w*/, "$1"))}</td><td>${escapeHtml(s.from)}</td><td>${escapeHtml(s.to)}${s.discovered ? " <em>(Discovered by Qloo)</em>" : ""}</td><td>${escapeHtml(s.sponsor || "none")}</td>` +
        `<td>${s.discovered ? `${bandText(s.fromZ)} to found by Qloo` : `${bandText(s.fromZ)} to ${bandText(s.toZ)}`}</td></tr>`,
    )
    .join("");
  // Template reasons for library themes are the same sentence with different names, so they are said once, not once per swap.
  const collapse = d.swaps.filter((s) => !s.discovered && s.source !== "model").length > 1;
  const whys =
    d.swaps
      .map((s) => {
        const head = `<strong>${escapeHtml(s.from)} to ${escapeHtml(s.to)}${s.discovered ? " (Discovered by Qloo)" : ""}, ${escapeHtml(longDate(s.date))}.</strong>`;
        const checked = s.fromEntities?.length || s.toEntities?.length
          ? ` Qloo checked ${s.fromEntities?.length ? `${escapeHtml(s.fromEntities.join(", "))} for the planned ${C.night} (${bandText(s.fromZ)})` : ""}${s.fromEntities?.length && s.toEntities?.length ? " and " : ""}${s.toEntities?.length ? `${escapeHtml(s.toEntities.join(", "))} for the swap (${s.discovered ? "found by Qloo, not scored against the library" : bandText(s.toZ)})` : ""}.`
          : "";
        return collapse && !s.discovered && s.source !== "model" ? `<li>${head}${checked}</li>` : `<li>${head} ${escapeHtml(s.why)}${checked}</li>`;
      })
      .join("") + (collapse ? `<li>For the library themes, the new theme stands out above this market's own average and the planned one stands out below it. ${d.swaps.every((s) => s.sponsor) ? "Dates and sponsors stay." : "Dates stay, and so do sponsors where there is one."}</li>` : "");
  const ideas = d.ideas && d.ideas.titles.length > 0
    ? `<h2>Family titles that stand out near ${escapeHtml(d.ideas.city)}</h2><p>${d.ideas.titles.map(escapeHtml).join(", ")}. Qloo had local data for ${d.ideas.scored} of our ${d.ideas.poolSize} family titles here; these stand out against 40 ballpark markets. They come from Qloo's taste data for this area.</p>`
    : "";
  const acts = d.acts && d.acts.names.length > 0
    ? `<h2>Acts that stand out near ${escapeHtml(d.acts.city)}</h2><p>${d.acts.names.map(escapeHtml).join(", ")}. Qloo had local data for ${d.acts.scored} of our ${d.acts.poolSize} touring acts here; these stand out against 40 reference markets. They come from Qloo's taste data for this area.</p>`
    : "";
  const angles = d.angles.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  const banner = d.synthetic ? `<p class="warn">SYNTHETIC DEMO DATA. These numbers are made up for testing, not from Qloo.</p>` : "";
  const recorded = d.recordedLabel ? ` Scores were pulled from Qloo on ${escapeHtml(d.recordedLabel)}.` : "";
  return `<article class="memo">
<h1>${C.memoTitle}: ${escapeHtml(d.club)}</h1>
<p class="meta">Prepared ${escapeHtml(longDate(d.generatedOn))} with Homestand.${recorded}${venue && d.sample ? " This is a made-up calendar for a sample amphitheatre, not a real venue's schedule." : ""}</p>
${banner}
<p>${escapeHtml(memoOpener(d))}</p>
${d.swaps.length ? `<h2>Approved swaps</h2>
<div class="memo-scroll"><table><thead><tr><th>${C.night.replace(/^./, (c) => c.toUpperCase())}</th><th>Was</th><th>Now</th><th>Sponsor</th><th>Local pull (was to now)</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Why</h2><ul>${whys}</ul>` : `<p>No swaps were approved. The calendar is unchanged.</p>`}
${venue ? acts : ideas}
${d.angles.length ? `<h2>${venue ? "Locked headliners: support-act ideas" : "Locked nights: sponsor-friendly angles"}</h2><ul>${angles}</ul>` : ""}
<h2>How to read this</h2>
<p>${escapeHtml(methodWords(d.kind))}</p>
<p>${d.nights} ${C.nights} were reviewed; ${d.classic} classic ${d.classic === 1 ? C.night : C.nights} ${venue ? "(fireworks, symphony nights, local showcases and similar)" : "(fireworks, giveaways, heritage and similar)"} ${d.classic === 1 ? "was" : "were"} left as planned because they are not a ${venue ? "music" : "pop-culture"} taste. Taste data comes from Qloo's Taste AI. Every swap keeps its date and sponsor.</p>
</article>`;
}

export const MEMO_CSS = `body{font:15px/1.5 Geist,system-ui,sans-serif;color:#14233c;max-width:760px;margin:2rem auto;padding:0 1rem}h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:1.6rem}table{border-collapse:collapse;width:100%;font-size:.9rem}.memo-scroll{overflow-x:auto}th,td{border:1px solid #9aa4b2;padding:.35rem .5rem;text-align:left}.meta{color:#4a5568}.warn{border:2px solid #b3360b;padding:.5rem;font-weight:600}`;

export function memoDocument(d: MemoData): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${copyFor(d.kind).memoTitle}: ${escapeHtml(d.club)}</title><style>${MEMO_CSS}</style></head><body>${buildMemoHtml(d)}</body></html>`;
}
