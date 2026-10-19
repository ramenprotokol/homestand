# Homestand

**Your market, not the national chart.**

Homestand checks a Minor League Baseball club's theme-night calendar against what its own ballpark market leans toward, using Qloo's Taste AI. It then proposes swaps that keep every sponsor and every date. Before building it, we ran a sealed, pre-registered test on 385 real 2025 theme nights of whether local taste predicted bigger crowds. The result is published as it came out.

**Live demo:** https://homestand-6az.pages.dev. Pick a sample club, or use your own: type any US or Canadian city, paste or load a calendar, and Homestand scores it live. No sign-up.

## What it does

A promotions director plans dozens of theme nights a season, and most of them are sold to sponsors. Nothing tells a club whether *its own* market leans toward Bluey or toward Margaritaville. Homestand gives that answer in three guided steps:

1. **Check.** The calendar appears as a magnet board, one magnet per night. Each theme is labelled **Leans in**, **About average** or **Leans away** for this market.
   - **Why panel.** Tap a magnet to see what Qloo looked at, the numbers behind the label, and a **Re-check live** button.
   - **Ambiguous names.** When a night's name fits two themes ("Elvis and the Beatles Night"), Homestand asks the director to choose. It never guesses.
   - **Unscored nights.** Classic promos (fireworks, dollar dogs, heritage nights) and unknown themes are labelled, not scored.
2. **Fix.** For unlocked nights that lean away, Homestand proposes a swap. You see the new night, the reason and both scores before you approve.
   - **Audience rule.** A kids or family night is only ever replaced by a kids or family theme; if none leans in, the night is listed as "Could not fix" with a next step. An adult night may take an adult or a family theme, and kids' themes only on weekends and day games.
   - **Ranking.** Within that rule, swaps rank like-for-like first (same kind of theme), then by how strongly the market leans in. It shows up to two alternates.
   - **Locks.** A locked night is never swapped. Instead it gets a sponsor-friendly angle.
   - **Approval.** Nothing changes until the director approves it.
   - **Step log.** "How Homestand decided" logs every step: theme resolution, each Qloo call (cached or live), each constraint check and each model call.
3. **Send.** Export the revised calendar as CSV or ICS, plus a one-page rationale memo for sponsors.

**The rule: code computes, the model explains.** Scoring, normalisation, constraints and ranking are plain TypeScript. A language model (Llama 3.3 70B on Cloudflare Workers AI) only words the reasons for each swap. Every number it writes must appear in the computed facts, and it may not claim an effect on sales or attendance, or the app falls back to template text (also used if the model takes longer than six seconds). The memo's opening sentence is fixed wording built from counts.

## How Qloo is used

- **Entity resolution, done offline** with `npm run qloo:resolve`. Each theme in the 41-theme library is a small, declared bundle of Qloo entities, for example Star Wars = *A New Hope* + *The Mandalorian*. IDs come from `/search` by exact name match (and release year for films); a fuzzy match is never forced.
  - **Coverage check.** Entities that return no local affinity at the sample markets are dropped. One example is *Toy Story*, which returns nothing even with the release-year floor below.
  - **What's committed:** the IDs, in `src/app/data/entity-ids.json`.
- **Local affinity, at runtime.** The call is `GET /v2/insights` with these parameters:
  - `filter.type` (one call per entity type);
  - `filter.results.entities` (every bundle entity of that type);
  - `signal.location=POINT(lon lat)` for the ballpark;
  - `signal.location.radius=80000`;
  - `filter.release_year.min=1900` on movie calls only. Qloo hides older films without it.

  That is five batched calls per market to score the whole library, plus three discovery calls (below): eight Qloo calls for a new city, then none until it is asked again, because the answers are cached. This is the same request shape the Study fixed on Day 1 ([Amendment 4](study/PREREGISTRATION.md)).
- **Discovered by Qloo.** The library is fixed, so a kids or family night can run out of library themes that fit. Then Homestand asks Qloo what families near the ballpark actually rank, among family-friendly animated titles:
  - `GET /v2/insights` with `filter.type` (movie, then tv_show), `filter.tags=urn:tag:genre:media:family,urn:tag:genre:media:animation` with `operator.filter.tags=intersection` (family-friendly animated titles; family alone also returns faith films and sitcoms), the same `signal.location` POINT and 80 km radius, and `take=10`;
  - a third call for family shows with `signal.demographics.age=24_and_younger`, which is Qloo's age signal and changes the ranking;
  - the family and animation tags are always sent. Without them, local results include adult and explicit titles, so there is no artist discovery.
  Titles that are already library themes are dropped. When no library theme can fix a kids or family night, the top unused discovered title is offered as a swap, marked "Discovered by Qloo". It has no local-pull number, because Qloo found it rather than measuring it against the library. The Fix screen also shows "Fresh family ideas from Qloo", and the memo repeats them. Only name, id, type and affinity are kept from each response.
- **A market-relative index.**
  1. A theme's bundle score (the mean affinity of its entities) is compared with 40 reference ballpark markets: z = (score − typical) / spread. Only per-theme aggregates are stored (`src/app/data/reference-stats.json`).
  2. Some markets sit lower or higher on almost everything, so each theme's **index** is its z minus the market's own average z across all scored themes. The Study uses the same within-market comparison.
  3. An index of +0.5 or more is "Leans in", and −0.5 or less is "Leans away".
- **Caching and limits.** The Worker caches Qloo responses in KV, server-side. A daily cap protects the event allowance. Past it, the app serves recorded results with a "recorded on" label. The Qloo key never reaches the browser.

## The Study

A pre-registered test of one question: **at the same ballpark, did the theme with the stronger local Qloo lean draw the bigger crowd?**

- **Sealed first.** The hypotheses, sample, outcome model, metrics and pass line were committed before any Qloo request ([`study/PREREGISTRATION.md`](study/PREREGISTRATION.md), Amendments 1–5). The scores were then frozen with a SHA-256 hash before any attendance data was opened ([`study/PULL_RECORD.md`](study/PULL_RECORD.md)).
- **Data.** These were 385 theme nights from 2025 (Star Wars, Princess, Bluey, Harry Potter, Margaritaville, Dinosaur, Country, Marvel, Wrestling) at 120 clubs. A pair is any two different themes at the same club, so only the 89 clubs that ran two or more themes count, and they make 521 pairs (more pairs than nights). Attendance was compared with each club's own baseline, adjusted for weekday, month, fireworks and giveaways.
- **Verdict: CALL STANDS.** Local taste called 49.1% of 521 within-club pairs (95% interval 43.2% to 54.9%). The pre-registered pass line was 55%, with the interval above 50%. An LLM-only baseline scored 50.6%, mostly ties. This is "not detected at this sample size", not "disproved". (A theme's national popularity scores exactly 50.0% in the app because it is the same for every club and can't rank two nights at one club; the 49.1% for it in `study/RESULTS.md` is a different, unadjusted count.)
- **What that means for the product.** Homestand is a reasoned, cited audit of local taste, not an attendance predictor, and the app says so. Full results: [`study/RESULTS.md`](study/RESULTS.md).

## Limitations

- Qloo's affinity sits near 1 for very popular entities (Country above all), so differences between markets can be tiny.
- Several themes rest on a single Qloo entity. Fifteen library entities were dropped for having no local signal.
- Labels describe what a market leans toward relative to its own average. They do not forecast ticket sales.
- The sample calendars are written by us, with fictional sponsors.

## Run it locally

```
npm install
npm run worker:dev                                  # Worker with synthetic Qloo answers and template text (no keys, no network)
VITE_API_BASE=http://127.0.0.1:8788 npm run dev     # front end
npm test && npm run typecheck && npm run lint && npm run build
npm run e2e                                         # Playwright against the local Worker
```

Local runs show a "Synthetic demo data" banner. To use real Qloo data, put your own `QLOO_API_KEY` and `QLOO_API_URL` in `.dev.vars` (gitignored) and run the `qloo:*` scripts. Re-running the Study needs the 2025 schedules fetched locally (`npm run study:fetch`, see [`DATA_RIGHTS.md`](DATA_RIGHTS.md)).

**Stack:** Vite and vanilla TypeScript on Cloudflare Pages; a Cloudflare Worker (KV, Workers AI); Vitest and Playwright.

## Data rights

No MLB data is in this repository or the app. Raw Qloo responses are never committed or exported. See [`DATA_RIGHTS.md`](DATA_RIGHTS.md).

## How it was built

Built with AI coding assistants, credited in [`BUILD_LOG.md`](BUILD_LOG.md).

## License

MIT
