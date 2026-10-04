# Homestand — design

_Status: draft for owner review, 2026-10-03. Built for the Qloo Agentic Hackathon (deadline 2026-10-30, 11:45pm ET). Hosted live demo; no video required._

## 1. What it is

A season-planning agent for a Minor League Baseball club's promotions director.

The director uploads a draft theme-night calendar. The agent:
1. resolves each theme to real cultural entities, and asks when a theme is ambiguous;
2. scores each theme against what the ballpark's own local market over- or under-indexes on (Qloo);
3. respects sponsor and date constraints;
4. proposes concrete swaps, each with a cited "why".

The director approves or rejects each swap, then exports the revised calendar and a short rationale memo they can show sponsors.

It ships with **The Study**: a pre-registered, reproducible test on real 2025 theme nights of how much local taste explained attendance, with LLM-only and national-popularity baselines side by side. The result is published whatever it shows.

**Tagline:** "Your market, not the national chart."

## 2. Who it's for and why

- **Promotions directors** plan next season's 30–75 theme nights in September and October. Fresno aims for 37 unique theme nights and starts planning in July (gameops.com, March 2026). Altoona narrows its list on a whiteboard, and its GM says about 80% of promotions are sponsored (Altoona Mirror, June 2024).
- **Today's inputs** are staff passion, community feedback and fan surveys. Nothing tells a club whether *its own market* over-indexes on Bluey or on Margaritaville.
- **Sponsors** are the constraint: 80% of nights are sold. A swap that ignores the sponsor is useless, so sponsor locks are first-class in the agent.
- **Careful citations:** Kappe et al. (Management Science, 2014) studied MLB's Pittsburgh Pirates across promotion *categories*, not theme choice. Cite it only for "promotion choices move revenue". Every figure in the README links to its source.

## 3. How it works (director's view)

```
upload calendar → resolve themes (ask if ambiguous) → score vs local market
   → flag under/over-indexers → propose swaps within constraints
   → director approves/rejects each → export calendar + rationale memo
```

1. **Upload** a CSV (template provided) or paste rows: date, theme, sponsor (optional), locked yes/no, notes. Or pick a **sample club** (see 6).
2. **Resolve.** Each theme becomes a declared, small **entity bundle**: Bluey → the Bluey TV show; Star Wars → a few core films and shows; "Princess Night" → candidates shown, and the director picks. Following Qloo's kit, the agent **never forces a fuzzy match**. An unresolved theme is marked "not scored", never guessed.
3. **Score.** For each bundle, Qloo returns its affinity in the ballpark's local market (location point + radius), plus the age mix the club cares about. Scores are turned into a market-relative index (z-score) so themes can be compared fairly for this club.
4. **Flag.** Each night is labelled **over-indexes**, **neutral** or **under-indexes** locally, with the Qloo evidence one click away.
5. **Propose.** For under-indexing, unlocked nights, the agent proposes swaps from a **theme library** of about 40 themes, each a declared entity bundle. It respects these constraints:
   - a sponsor-locked night is never swapped; the agent suggests a sponsor-compatible angle instead;
   - no theme is used twice in a season unless the director allows it;
   - date-fit rules, e.g. holiday themes stay in their window.
6. **Decide.** The director approves or rejects each proposal. Nothing changes without approval.
7. **Export** the revised CSV or ICS, plus a one-page rationale memo ("why Bluey over Princess for our market"), with every claim cited to a Qloo result.

**The rule: the model explains; code computes.** Scoring, normalisation, constraint checks and ranking are plain code. The model writes the explanations, asks the clarifying questions, and drafts the memo.

## 4. The Study (pre-registered)

- **Pre-registration first.** `study/PREREGISTRATION.md` is committed **before any Qloo score is pulled**. It holds the hypotheses, sample, model, metrics and pass thresholds below.
- **Data.**
  - A script fetches 2025 MiLB schedule, promotion and attendance data from the public MLB Stats API, **on the runner's own machine**.
  - Raw MLB data is **never committed** or served.
  - The repo holds the script, the derived per-night aggregates, and `DATA_RIGHTS.md`, which explains this plainly.
- **Sample.** Pop-culture themes with 20 or more markets in 2025: Star Wars, Princess, Bluey, Harry Potter, Margaritaville, Dinosaur, Country, Marvel, Wrestling. That's roughly 378 theme nights. Double-headers are excluded.
- **Outcome.** Attendance residual: log attendance versus the club's own baseline for that season, controlling for weekday, fireworks, giveaway and month.
- **Predictors compared**, for each theme × market:
  - (a) Qloo local affinity z-score;
  - (b) national popularity;
  - (c) an LLM's 1–10 rating given the same facts (theme + city).
- **Tests.**
  1. **Pooled:** does adding the predictor improve a model with theme and club fixed effects? Report the partial correlation, with bootstrap confidence intervals clustered by club.
  2. **Within-club pairwise:** across clubs that ran two or more of these themes (about 94 clubs, about 819 pairs), how often does the predictor pick the better-drawing theme? Bootstrap confidence interval by club.
- **Pre-registered pass line:** Qloo's pairwise accuracy is at least 55%, its confidence interval excludes 50%, and it beats the LLM baseline.
- **Either way, we publish.** If it fails, the product stands as a "reasoned, cited audit", and the README says exactly what the study does and doesn't establish.
- **Budget.**
  - About 400 Qloo calls, run once at 4 or fewer per second; the results are committed as a dated `qloo_scores.json`.
  - LLM ratings are batched into a few calls and spread across days to stay inside the free tier.

## 5. Qloo integration

- **Surface.**
  - The kit's supported tools are the `@qloo/qloo-harness` CLI and MCP server. The Node backend runs `qloo mcp` as a long-lived child process, and uses `qloo api` for raw `/v2/insights` parameters the MCP tools don't expose.
  - Calls are paced at 4 or fewer per second, with a daily cap.
- **Main call:** `/v2/insights` with these parameters:
  - `filter.results.entities=<bundle ids>`
  - `signal.location=POINT(lon lat)` and `signal.location.radius`, or `signal.location.query`
  - optional `signal.demographics.age`
  - `feature.explainability=true`
- **Heatmaps:** only if the day-1 test shows they add something.
- **Also used:** `/search` (entity resolution with candidates), `/v2/tags`, `/v2/analysis/compare` (the "why" behind a swap).
- **Cache everything.** Each response is stored under a hash of its request. The cited "why" links to the cached request and result.
- **Replay mode.** When the quota runs out or Qloo is unreachable, the app serves recorded results with a visible "recorded on <date>" label.
- **Safe use:** no personal data is ever sent to Qloo. Results are described as aggregate affinities, never as predictions about individuals.

## 6. What the judge sees

- **Landing:** the tagline, a 3-step explainer, "Try a sample club", and "The Study" tab.
- **Sample clubs:** 4 real ballpark markets in different regions, each with a **sample calendar we wrote** (fictional sponsor names, no MLB data). Their Qloo results are pre-computed so the demo is instant.
- **Audit screen:** the calendar with local index badges, flags and "why" panels. Then the agent's proposals, with approve and reject buttons, an agent trace (each step, each Qloo call, each constraint check), and export.
- **"Re-check live":** re-scores one theme against Qloo in real time, so judges see it isn't canned.
- **Upload your own:** a CSV template, so a judge can try any calendar.
- **The Study tab:** the pre-registration (with its commit date), results charts, baselines side by side, and limitations.

## 7. Architecture (free tier)

- **Front end:** React + Vite + TypeScript on **Cloudflare Pages**. It serves the sample clubs and The Study from static JSON, so they're instant with no cold start.
- **API:** a Node (TypeScript) server on **Render free**, spawning the Qloo harness. It's only needed for uploads and "Re-check live"; the UI shows a "waking the server" state during a cold start.
- **Model:** Cloudflare Workers AI through its REST API (free daily allowance). A small model handles parsing; a larger one handles explanations and the memo. A hard daily budget falls back to template text.
- **Secrets:** the Qloo key and Cloudflare token live only on the server (Render env vars, `.dev.vars` locally, gitignored). The key never reaches the browser.
- **Units:**
  - `calendar` — parse and validate CSV/ICS
  - `themes` — the library, entity bundles and resolution
  - `qloo` — harness client, pacing, cache, replay
  - `score` — normalisation and index
  - `constraints`
  - `propose` — ranking under constraints
  - `agent` — tools, prompts, budget, trace
  - `export` — CSV, ICS and memo
  - `study` — fetch script (local only), model, bootstrap, report
  - `web`

## 8. Errors and edge cases

- **Ambiguous theme:** ask, don't guess. **Unresolvable theme:** "not scored".
- **Qloo quota, rate limit (429) or outage:** replay cached results with a label. Live re-check is disabled with a clear message.
- **LLM budget used up:** templates for explanations; scoring and proposals are unaffected.
- **Render asleep:** the static sample clubs still work fully, and only live actions wait.
- **Bad CSV rows:** row-level errors are shown, and the good rows are still processed.

## 9. Testing

- **Unit:** calendar parser, constraint rules, normalisation, ranking (no locked night ever swapped; no duplicates unless allowed).
- **Contract tests** against recorded Qloo responses.
- **Study:** the pipeline is reproducible (fixed seeds), with a synthetic-data check that it recovers a planted effect and returns null on random data.
- **End to end:** Playwright on the deployed site: sample club audit, approve and export, upload, and the Study tab.
- **Release gate:** the Ramen privacy check before every push.

## 10. Day-1 go / no-go (when the Qloo key arrives)

1. **Resolution:** 6 or more of the 9 study themes resolve to a clear entity or small bundle, with no fuzzy forcing.
2. **Location signal varies:** Bluey's local affinity across 10 ballpark markets, big and small, is not flat (coefficient of variation ≥ 0.10, not saturated).
3. **Face validity:** Bluey, Margaritaville and WWE re-order plausibly across those markets.
4. **Budget:** 50 timed calls at 4 or fewer per second with no 429s, and about 400 study calls look feasible.

All pass → **GO**. Test 2 fails → **switch to the backup, Blast Radius** (an indie-game launch-date overlap check), which gets its own spec.

## 11. Out of scope

Weather controls, a 2026 test split, a "which themes get repeated" test, maps (unless time remains), revenue estimates, MLB-level framing, any MLB data at runtime or in the repo, and any personal data.

## 12. Submission checklist (Qloo Agentic Hackathon)

- Public repo `ramenprotokol/homestand`, MIT license visible in the About box.
- Hosted demo URL (Cloudflare Pages + Render) working through Qloo judging (about Nov 2–16).
- The text description states **exactly** how Qloo is used (judging may use AI analysis), plus limitations.
- README: how to run it, Qloo usage, sources, limitations, `DATA_RIGHTS.md`, and a Study summary.
- A build log crediting which model wrote what (no session IDs).
- **Dates:**
  - Key expected around Oct 6–8; the day-1 test the same day.
  - Before the key arrives: calendar parser, constraints, UI shell, the study data pipeline and the pre-registration.
  - Feature-complete by Oct 26; submit by Oct 28.
