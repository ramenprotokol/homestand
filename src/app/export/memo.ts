import { copyFor, type Kind, type Sport } from "../kind";
import { FIT_WORDS, pullBand } from "../score";
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
  /** A club run's sport; left out for baseball, whose memo reads exactly as before. */
  sport?: Sport;
  club: string;
  /** The city alone ("Biloxi"), for plain sentences. */
  city?: string;
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
  /** Clear weak nights Homestand found no swap for. */
  stillWeak?: string[];
  /** Nights with a swap offered that is neither approved nor rejected, each with what was offered. */
  offered?: string[];
  /** Swaps the user turned down. */
  rejected?: string[];
  /** True for a sample calendar we wrote (the memo then says so). */
  sample?: boolean;
  /** Venue runs: acts that stand out near the venue, when the pool was scored. */
  acts?: { city: string; names: string[]; scored: number; poolSize: number };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** "Strong fit", "Average fit" or "Weak fit": the rating in words, never a raw index. */
const ratingText = (z: number | null): string => {
  const b = pullBand(z);
  return b === null ? "No data" : b === "about" ? "Average fit" : b === "above" || b === "well above" ? "Strong fit" : "Weak fit";
};
const lower = (t: string): string => t.charAt(0).toLowerCase() + t.slice(1);

/** The memo's first sentence: fixed wording, filled only with counts the app knows. No model writes it. */
export function memoOpener(d: Pick<MemoData, "club" | "nights" | "swaps" | "suggested" | "kind" | "sport">): string {
  const approved = d.swaps.length;
  const suggested = Math.max(d.suggested, approved);
  const head = `Homestand checked ${d.nights} ${copyFor(d.kind, d.sport).themeNights} for ${d.club} against local taste data from Qloo.`;
  if (suggested === 0) return `${head} It suggested no swaps, so the calendar is unchanged.`;
  const noun = d.kind === "venue" ? "offer" : "swap";
  const said = `It suggested ${suggested} ${noun}${suggested === 1 ? "" : "s"}; ${approved === 0 ? "none is" : approved === 1 ? "1 is" : `${approved} are`} in the revised calendar.`;
  return `${head} ${said} ${approved === 0 ? "The calendar is unchanged." : `Each approved ${noun} keeps its original date and sponsor.`}`;
}

/** One printable page. Cites the local pull (index) behind each swap; never the per-entity Qloo values. */
export function buildMemoHtml(d: MemoData): string {
  const C = copyFor(d.kind, d.sport);
  const venue = d.kind === "venue";
  const anySponsor = d.swaps.some((s) => s.sponsor);
  const rows = d.swaps
    .map(
      (s) => `<tr><td data-label="${C.night.replace(/^./, (c) => c.toUpperCase())}">${escapeHtml(s.weekday.slice(0, 3))} ${escapeHtml(longDate(s.date).replace(/^(\w{3})\w*/, "$1"))}</td><td data-label="Was">${escapeHtml(s.from)}</td><td data-label="Now">${escapeHtml(s.to)}${s.discovered ? ` <em>(${FIT_WORDS.found})</em>` : ""}</td>${anySponsor ? `<td data-label="Sponsor">${escapeHtml(s.sponsor)}</td>` : ""}` +
        `<td data-label="Fit">${ratingText(s.fromZ)} \u2192 ${s.discovered ? FIT_WORDS.found : ratingText(s.toZ)}</td></tr>`,
    )
    .join("");
  // Template reasons for library themes are the same sentence with different names, so they are said once, not once per swap.
  const collapse = d.swaps.filter((s) => !s.discovered && s.source !== "model").length > 1;
  const whys =
    d.swaps
      .map((s) => {
        const head = `<strong>${escapeHtml(s.from)} to ${escapeHtml(s.to)}${s.discovered ? ` (${FIT_WORDS.found})` : ""}, ${escapeHtml(longDate(s.date))}.</strong>`;
        const checked = s.fromEntities?.length || s.toEntities?.length
          ? ` Qloo checked ${s.fromEntities?.length ? `${escapeHtml(s.fromEntities.join(", "))} for the planned ${C.night} (${lower(ratingText(s.fromZ))})` : ""}${s.fromEntities?.length && s.toEntities?.length ? " and " : ""}${s.toEntities?.length ? `${escapeHtml(s.toEntities.join(", "))} for the swap (${s.discovered ? `local favorite${d.city ? `: people in ${escapeHtml(d.city)} like it more than people in most towns do` : ""}` : lower(ratingText(s.toZ))})` : ""}.`
          : "";
        return collapse && !s.discovered && s.source !== "model" ? `<li>${head}${checked}</li>` : `<li>${head} ${escapeHtml(s.why)}${checked}</li>`;
      })
      .join("") + (collapse ? `<li>For the themes from our list, the new theme is a stronger fit for this town than the planned one. ${d.swaps.every((s) => s.sponsor) ? "Dates and sponsors stay." : "Dates stay, and so do sponsors where there is one."}</li>` : "");
  const ideas = d.ideas && d.ideas.titles.length > 0
    ? `<h2>Family movies ${escapeHtml(d.ideas.city)} likes more than most towns</h2><p>${d.ideas.titles.map(escapeHtml).join(", ")}. Use one for a family night.</p>`
    : "";
  const acts = d.acts && d.acts.names.length > 0
    ? `<h2>Acts ${escapeHtml(d.acts.city)} likes more than most cities</h2><p>${d.acts.names.map(escapeHtml).join(", ")}.</p>`
    : "";
  const angles = d.angles.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  const banner = d.synthetic ? `<p class="warn">SYNTHETIC DEMO DATA. These numbers are made up for testing, not from Qloo.</p>` : "";
  const recorded = d.recordedLabel ? ` Data checked ${escapeHtml(d.recordedLabel)}.` : "";
  return `<article class="memo">
<h1>${C.memoTitle}: ${escapeHtml(d.club)}</h1>
<p class="meta">Prepared ${escapeHtml(longDate(d.generatedOn))} with Homestand.${recorded}${venue && d.sample ? " This is a made-up calendar for a sample amphitheatre, not a real venue's schedule." : !venue && d.sample && d.sport && d.sport !== "baseball" ? ` This is a made-up calendar for a sample ${C.sport} team, not a real team's schedule.` : ""}</p>
${banner}
<p>${escapeHtml(memoOpener(d))}</p>
${d.swaps.length ? `<h2>Approved ${venue ? "offers" : "swaps"}</h2>
<div class="memo-scroll"><table><thead><tr><th>${C.night.replace(/^./, (c) => c.toUpperCase())}</th><th>Was</th><th>Now</th>${anySponsor ? "<th>Sponsor</th>" : ""}<th>Fit: before \u2192 after</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Why</h2><ul>${whys}</ul>` : ``}
${d.rejected?.length ? `<h2>Rejected</h2><p>${d.rejected.map(escapeHtml).join("; ")}.</p>` : ""}
${d.offered?.length ? `<h2>${venue ? "Offer proposed" : "Swap offered"}, not approved</h2><p>${d.offered.map(escapeHtml).join("; ")}.</p>` : ""}
${d.stillWeak?.length ? `<h2>No ${venue ? "offer" : "swap"} available</h2><p>${d.stillWeak.map(escapeHtml).join("; ")}.</p>` : ""}
${venue ? acts : ideas}
${d.angles.length ? `<h2>${venue ? "Locked headliners: a support act idea" : "Locked nights: an idea for the sponsor"}</h2><ul>${angles}</ul>` : ""}
<h2>How to read this</h2>
<p>Strong, average and weak compare each ${venue ? "act" : "theme"} with this ${C.place}'s other ${venue ? "acts" : "themes"}. They describe taste, not ticket sales.</p>
<p>${d.nights} ${C.nights} were reviewed${d.classic > 0 ? `; ${d.classic} proven ${d.classic === 1 ? "promo" : "promos"} ${venue ? "(fireworks, symphony nights, local showcases and similar)" : `(${C.provenExamples} and similar)`} ${d.classic === 1 ? "was" : "were"} left as planned because ${d.classic === 1 ? "it isn't" : "they aren't"} graded` : ""}. Taste data comes from Qloo. A rating that rests on a raw gap under 0.01 is called a slight lean, and no swap is pushed for it. Every ${venue ? "offer" : "swap"} keeps its date and sponsor.</p>
</article>`;
}

export const MEMO_CSS = `body{font:15px/1.5 Geist,system-ui,sans-serif;color:#14233c;max-width:760px;margin:2rem auto;padding:0 1rem}h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:1.6rem}table{border-collapse:collapse;width:100%;font-size:.9rem}.memo-scroll{overflow-x:auto}th,td{border:1px solid #9aa4b2;padding:.35rem .5rem;text-align:left}.meta{color:#4a5568}.warn{border:2px solid #b3360b;padding:.5rem;font-weight:600}@media (max-width:640px){body{font-size:16px}.memo-scroll{overflow:visible}table,thead,tbody,tr,th,td{display:block}thead{position:absolute;left:-9999px}tr{border:1px solid #9aa4b2;margin:0 0 .6rem;padding:.3rem .2rem}td{border:0;padding:.15rem .4rem}td:empty{display:none}td::before{content:attr(data-label) ": ";font-weight:700}}`;

export function memoDocument(d: MemoData): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${copyFor(d.kind).memoTitle}: ${escapeHtml(d.club)}</title><style>${MEMO_CSS}</style></head><body>${buildMemoHtml(d)}</body></html>`;
}
