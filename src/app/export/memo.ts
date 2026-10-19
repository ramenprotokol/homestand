import { AUDIT_LINE, METHOD_WORDS } from "../score";
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
}

export interface MemoData {
  club: string;
  generatedOn: string;
  swaps: MemoSwap[];
  angles: string[];
  nights: number;
  classic: number;
  synthetic: boolean;
  recordedOn: string | null;
  /** Full timestamp of the saved scores, when the scores were a saved result. */
  recordedAt?: string | null;
  /** Qloo's local family ideas for this area, when they were available. */
  ideas?: { city: string; titles: string[]; young: string[] };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const signed = (v: number | null): string => (v === null ? "n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`);

/** The memo's first sentence: fixed wording, filled only with counts the app knows. No model writes it. */
export function memoOpener(d: Pick<MemoData, "club" | "nights" | "swaps">): string {
  const k = d.swaps.length;
  const suggests = k === 0 ? "suggests no swaps" : `suggests ${k} swap${k === 1 ? "" : "s"}`;
  const tail = k === 0 ? "The calendar is unchanged." : "Each swap keeps its original date and sponsor.";
  return `Homestand checked ${d.nights} theme nights for ${d.club} against local taste data from Qloo and ${suggests}. ${tail}`;
}

/** One printable page. Cites the local pull (index) behind each swap; never the per-entity Qloo values. */
export function buildMemoHtml(d: MemoData): string {
  const rows = d.swaps
    .map(
      (s) => `<tr><td>${escapeHtml(s.weekday)} ${escapeHtml(longDate(s.date))}</td><td>${escapeHtml(s.from)}</td><td>${escapeHtml(s.to)}${s.discovered ? " <em>(Discovered by Qloo)</em>" : ""}</td><td>${escapeHtml(s.sponsor || "none")}</td>` +
        `<td>${s.discovered ? `${signed(s.fromZ)} to Found by Qloo` : `${signed(s.fromZ)} to ${signed(s.toZ)}`}</td></tr>`,
    )
    .join("");
  // Template reasons for library themes are the same sentence with different names, so they are said once, not once per swap.
  const collapse = d.swaps.filter((s) => !s.discovered && s.source !== "model").length > 1;
  const whys =
    d.swaps
      .map((s) => {
        const head = `<strong>${escapeHtml(s.from)} to ${escapeHtml(s.to)}${s.discovered ? " (Discovered by Qloo)" : ""}, ${escapeHtml(longDate(s.date))}.</strong>`;
        return collapse && !s.discovered && s.source !== "model" ? `<li>${head}</li>` : `<li>${head} ${escapeHtml(s.why)}</li>`;
      })
      .join("") + (collapse ? `<li>For the library themes, the new theme stands out above this market's own average and the planned one stands out below it. ${d.swaps.every((s) => s.sponsor) ? "Dates and sponsors stay." : "Dates stay, and so do sponsors where there is one."}</li>` : "");
  const ideas = d.ideas && d.ideas.titles.length > 0
    ? `<h2>Fresh family ideas from Qloo for ${escapeHtml(d.ideas.city)}</h2><p>${d.ideas.titles.map(escapeHtml).join(", ")}.${d.ideas.young.length ? ` Under-25 fans here also lean toward: ${d.ideas.young.map(escapeHtml).join(", ")}.` : ""} These come from Qloo's taste data for this area. They are ideas, not scores.</p>`
    : "";
  const angles = d.angles.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  const banner = d.synthetic ? `<p class="warn">SYNTHETIC DEMO DATA. These numbers are made up for testing, not from Qloo.</p>` : "";
  const recorded = d.recordedOn ? ` Scores were pulled from Qloo on ${escapeHtml(longDate(d.recordedOn))}.` : "";
  return `<article class="memo">
<h1>Theme-night rationale: ${escapeHtml(d.club)}</h1>
<p class="meta">Prepared ${escapeHtml(longDate(d.generatedOn))} with Homestand.${recorded}</p>
${banner}
<p>${escapeHtml(memoOpener(d))}</p>
${d.swaps.length ? `<h2>Approved swaps</h2>
<div class="memo-scroll"><table><thead><tr><th>Night</th><th>Was</th><th>Now</th><th>Sponsor</th><th>Local pull (was to now)</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Why</h2><ul>${whys}</ul>` : `<p>No swaps were approved. The calendar is unchanged.</p>`}
${ideas}
${d.angles.length ? `<h2>Locked nights: sponsor-friendly angles</h2><ul>${angles}</ul>` : ""}
<h2>How to read this</h2>
<p>${escapeHtml(METHOD_WORDS)}</p>
<p>${escapeHtml(AUDIT_LINE)}</p>
<p>${d.nights} nights were reviewed; ${d.classic} classic ${d.classic === 1 ? "night" : "nights"} (fireworks, giveaways, heritage and similar) ${d.classic === 1 ? "was" : "were"} left as planned because they are not a pop-culture taste. Taste data comes from Qloo's Taste AI. Every swap keeps its date and sponsor.</p>
</article>`;
}

export const MEMO_CSS = `body{font:15px/1.5 Geist,system-ui,sans-serif;color:#14233c;max-width:760px;margin:2rem auto;padding:0 1rem}h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:1.6rem}table{border-collapse:collapse;width:100%;font-size:.9rem}.memo-scroll{overflow-x:auto}th,td{border:1px solid #9aa4b2;padding:.35rem .5rem;text-align:left}.meta{color:#4a5568}.warn{border:2px solid #b3360b;padding:.5rem;font-weight:600}`;

export function memoDocument(d: MemoData): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Theme-night rationale: ${escapeHtml(d.club)}</title><style>${MEMO_CSS}</style></head><body>${buildMemoHtml(d)}</body></html>`;
}
