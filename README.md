# Homestand

**Your market, not the national chart.**

Homestand checks a Minor League Baseball club's theme-night calendar against what its own ballpark market leans toward, using Qloo's Taste AI. It then proposes swaps that keep every sponsor and every date. Before building it, we ran a sealed, pre-registered test on 385 real 2025 theme nights of whether local taste predicted bigger crowds. The result is published as it came out.

**Live demo:** https://homestand-6az.pages.dev. Pick a sample club, or use your own: type any US or Canadian city, paste or load a calendar, and Homestand scores it live. No sign-up.

## What it does

A promotions director plans dozens of theme nights a season, and most of them are sold to sponsors. Nothing tells a club whether *its own* market leans toward Bluey or toward Margaritaville. Homestand gives that answer in three guided steps:

1. **Check.** The calendar appears as a board of foil cards, one card per night, each with its sponsor and a lock where it has one. Each theme is labelled **Leans in**, **About average** or **Leans away** for this market.
   - **Why panel.** Tap a card and it flips: the back gives the plain reading, and the side panel gives what Qloo looked at, the detail, the numbers behind the label (under "Show the numbers") and a **Re-check live** button.
   - **Ambiguous names.** When a night's name fits two themes ("Elvis and the Beatles Night"), Homestand asks the director to choose. It never guesses.
   - **Unscored nights.** Classic promos (fireworks, dollar dogs, heritage nights) and unknown themes are labelled, not scored.
2. **Fix.** For unlocked nights that lean away, Homestand proposes a swap. You see the new night, the reason and both scores before you approve.
   - **Audience rule.** A kids or family night is only ever replaced by a kids or family theme. Star Trek, pro wrestling, Batman, Top Gun and Lord of the Rings are tagged teen, so a Bluey Day can never become Star Trek or wrestling; if nothing leans in, it may get the best option for its audience (below) or a discovered family title; otherwise the nights are listed together in one "Could not fix" block with a next step. A teen or adult night may take any theme that is not for small children, and kids' themes only on weekends and day games.
   - **Best option for the audience.** If a kids or family night leans away and nothing in its audience leans in, Homestand offers the strongest same-audience theme, the way a promotions director would ("run the kids theme your town likes most"). It must be clearly better than the planned night (a gain of at least 1.0 on the local pull, a full band) and must not itself lean away (about this town's usual at worst). It is labelled "Best kids option here (about this town's usual)" and its reason says it is the strongest choice, not that it leans in. A well-known discovered title (popularity 0.97 or more, at least typical here) can fill the same role.
   - **Ranking.** Within that rule, swaps are ranked by same kind of theme first, then same audience, then how strongly the market leans in. It shows up to two alternates.
   - **Locks.** A locked night is never swapped. It gets a sponsor-friendly touch chosen with Qloo's taste graph: one call per locked night asks what fans of the locked theme near the ballpark also lean toward (`signal.interests.entities`), among unused themes of the same kind and audience band, and the best one becomes the suggestion ("Fans of <theme> near <city> also lean toward X…"). One candidate is enough to ask; if there is no same-kind theme it widens to any theme for the same audience, and only then, or if Qloo is unavailable, does it fall back to a generic angle. A real example: Albuquerque's locked Country Music Night gets "Fans of Country music near Albuquerque also lean toward Kenny Chesney…".
   - **Approval.** Nothing changes until the director approves it.
   - **Step log.** "How Homestand decided" logs every step: theme resolution, each Qloo call (cached or live), each constraint check and each model call.
3. **Send.** Export the revised calendar as CSV or ICS, plus a one-page rationale memo for sponsors.

**The rule: code computes, the model explains.** Scoring, normalisation, constraints and ranking are plain TypeScript. A language model (Llama 3.3 70B on Cloudflare Workers AI) only words the reasons for each swap. Every number it writes must appear in the computed facts, and it may not claim an effect on sales or attendance, or the app falls back to template text (also used if the model takes longer than six seconds). The memo's opening sentence is fixed wording built from counts.

## How Qloo is used

- **Entity resolution, done offline** with `npm run qloo:resolve`. The library recognises 41 theme names, and 25 of them are scored live with Qloo (30 entities). Each scored theme is a small, declared bundle of Qloo entities, for example Star Wars = *A New Hope* + *The Mandalorian*. The other 16 names (PAW Patrol, Pokemon, Peanuts, Batman and so on) are recognised but left alone, because Qloo returned no local signal for them or no exact-name match was found; the app says so instead of treating them as unknown text. IDs come from `/search` by exact name match (and release year for films); a fuzzy match is never forced.
  - **Coverage check.** Entities that return no local affinity at the sample markets are dropped. One example is *Toy Story*, which returns nothing even with the release-year floor below.
  - **What's committed:** the IDs, in `src/app/data/entity-ids.json`.
- **Local affinity, at runtime.** The call is `GET /v2/insights` with these parameters:
  - `filter.type` (one call per entity type);
  - `filter.results.entities` (every bundle entity of that type);
  - `signal.location=POINT(lon lat)` for the ballpark;
  - `signal.location.radius=80000`;
  - `filter.release_year.min=1900` on movie calls only. Qloo hides older films without it.

  That is five batched calls per market to score the whole library, plus two discovery calls (below): seven Qloo calls for a new city (five to score the library, two to score the title pool), plus one per locked night for the taste graph, then none until it is asked again, because the answers are cached. This is the same request shape the Study fixed on Day 1 ([Amendment 4](study/PREREGISTRATION.md)).
- **Discovered by Qloo.** The library is fixed, so a kids or family night can run out of library themes that fit. Discovery finds family-friendly animated titles that stand out *near this ballpark*, not nationally:
  - **A fixed pool, built offline** (`npm run qloo:discovery-reference`, 96 Qloo requests, run once). The top 30 family+animation movies and top 30 shows at 8 spread-out reference markets give a pool of 46 titles (32 movies, 14 shows). Titles that are already library themes are dropped, and so are titles with no national popularity from Qloo or under 0.7, because a director won't run "RWBY Chibi Day". Each title's popularity is kept with its aggregates. The pool is then scored at all 40 reference markets, and only each title's aggregates (n, mean, SD) are committed in `src/app/data/discovery-reference.json`, the same way `reference-stats.json` is stored. Nothing market-level is stored.
  - **Runtime, two calls:** `GET /v2/insights` with `filter.results.entities` set to the pool's ids (one call for movies, one for shows) at the market's POINT and 80 km radius. Each title's reading is compared with its own spread over the 40 markets (z), and a title **stands out** when z clears the same bar the library uses for "Leans in". A swap also needs a big-studio name (popularity 0.97 or more), and the ideas list needs 0.90, because a director runs "Inside Out 2 Night", not "Next Gen Night". There is no artist discovery, and no under-25 call: Qloo's age signal returns nearly the same national list in every market, which would contradict "your market, not the national chart".
  - **Use:** when no library theme can fix a kids or family night, the top discovered title that stands out here is offered as a swap, marked "Discovered by Qloo", with no local-pull number because it is not measured against the library. The Fix screen shows "Family titles that stand out near <city>" (with "Qloo had local data for N of our 46 family titles here") and the memo repeats them. Only name, id, type and a z are kept from each response.
  - **Why a pool:** asking for "the top family titles near X" returns almost the same list in every city. Scoring a fixed pool and ranking each title against its own spread is what makes the answer local (Fresno, Portland ME and El Paso get different titles).

- **A market-relative index.**
  1. A theme's bundle score (the mean affinity of its entities) is compared with 40 reference ballpark markets: z = (score − typical) / spread. Only per-theme aggregates are stored (`src/app/data/reference-stats.json`).
  2. Some markets sit lower or higher on almost everything, so each theme's **index** is its z minus the market's own average z across all scored themes. The Study uses the same within-market comparison.
  3. An index of +0.5 or more is "Leans in", and −0.5 or less is "Leans away".
  4. In the app this shows as plain words: "Local pull: well below this town's usual" and "Star Wars here: well below most ballpark markets" (the z against the 40 markets). The reference stores only mean and SD per theme, so it can say "below most markets" but not "38th of 40". Star Wars at 0.99 can sit below average because nearly every market scores it near the top, so the small gaps are what is compared.
  5. "Average across 24 themes" in the numbers can differ from the 25 themes scored live: a market's average only counts themes Qloo returned a reading for there, and one theme can have no reading at a given market.
- **Caching and limits.** The Worker caches Qloo responses in KV, server-side. A daily cap protects the event allowance. Past it, the app serves recorded results with a "recorded on" label. The Qloo key never reaches the browser.

## Venue mode (concert venues)

The same Check, Fix and Send engine also runs on a touring-act calendar. The one sample is **Raleigh, NC sample amphitheatre**: a made-up summer calendar (May to September 2027, 18 dates, fictional sponsors) for a sample amphitheatre, not any real venue. Open it from the home page line or the picker, or at `#/check/raleigh`. Club runs are untouched: the four baseball samples and "Load an example" produce exactly what they did before, and a snapshot test (`tests/app/club-regression.test.ts`) checks every band, swap, alternate, angle and step-log line.

- **The calendar.** Four signed headliners (locked, "Contract signed"), ten tentative holds across country, rock, pop, hip-hop, Latin, classic rock, jam and R&B, two tribute nights (Yacht Rock, Emo Night, each a small declared bundle of artists) and two classic dates (Fireworks & Symphony, Local Battle of the Bands). Every act on it still tours.
- **Artist library.** 28 artist and tribute themes (26 scored; Peso Pluma and Eagles returned no local signal at any of the 40 reference markets, and Steely Dan was dropped from the Yacht Rock bundle for the same reason). Acts that no longer tour (Fleetwood Mac, Grateful Dead, Elvis, The Beatles, Margaritaville, Dolly Parton) are marked `touring: false`: they are scored, but never offered as a swap or a support act. Each has a `genre`, and so do the ten music themes the club library already had. IDs come from exact-name `/search` (`npm run qloo:resolve -- --type=artist`). The venue library is the music themes plus these. Club runs never see the artist themes, so a baseball calendar scores, averages and swaps as before. Reference aggregates (z against the same 40 markets) were added with `npm run qloo:reference -- --venue`; only aggregates are committed.
- **Genre-aware swaps.** For a music date, a swap is ranked by same genre first, then a related genre (rock, classic rock, jam, indie and emo are one family; pop, R&B, hip-hop and Latin another; country stands alone), then anything. Inside that: same audience, then how strongly the market leans in. Swap candidates must lean in, still tour, not already be on the calendar, and be an act (a solo artist, or a tribute night for a tribute date): never a genre bundle such as "Country music". A venue run never crosses into another genre family, so when nothing in the same or a related genre leans in, the date goes in "Could not fix" with the reason.
- **Discovered by Qloo, for acts.** Same method as the family titles. A declared list of touring acts (by genre) is matched by exact name against Qloo's genre-tagged artist lists (`npm run qloo:acts-reference`: 20 requests for the pool, 80 for the 40-market aggregates). Acts whose reading barely moves between markets (spread under 0.002; Qloo's affinity saturates near 1 for the biggest names) are left out, which removed most pop, hip-hop and R&B names, so the pool is 52 acts (acts that no longer tour are not in it, and their genres were checked by hand). At runtime two requests score the pool at the venue. An act is offered only if it stands out locally (the "Leans in" bar) and its national popularity is 0.95 or more. It competes at its genre tier, and a library theme wins a tie. Some cities get none, and the Fix page says so.
- **Support act for a locked headliner.** One taste-graph call per locked headliner (`signal.interests.entities`, cached under `tg:`) asks which acts fans of the headliner near the venue also lean toward, among unused artist themes and pool acts that still tour and are no more popular nationally than the headliner (popularity from one request, `npm run qloo:popularity`; the headliner's own genre first, 50 at most): "Support act idea: fans of X near Raleigh also lean toward Y, so an act like Y could fit the opening slot". When no act qualifies, it is worded as a promo tie-in, never a support act. Every locked headliner gets one, not only those that lean away.
- **Qloo calls for a new venue city:** 1 (the venue library, one artist request) + 2 (the act pool) + 1 per locked headliner = 3 plus one per headliner. Raleigh costs 7, then nothing while cached.
- **Wording.** A venue run says venue, reference markets, summer series and date where a club run says ballpark, ballpark markets, season and theme night, on Check, Fix, Send, the memo and the exports. The Study is baseball only, and venue pages say so.

## The Study

A pre-registered test of one question: **at the same ballpark, did the theme with the stronger local Qloo lean draw the bigger crowd?**

- **Sealed first.** The hypotheses, sample, outcome model, metrics and pass line were committed before any Qloo request ([`study/PREREGISTRATION.md`](study/PREREGISTRATION.md), Amendments 1–5). The scores were then frozen with a SHA-256 hash before any attendance data was opened ([`study/PULL_RECORD.md`](study/PULL_RECORD.md)).
- **Data.** These were 385 theme nights from 2025 (Star Wars, Princess, Bluey, Harry Potter, Margaritaville, Dinosaur, Country, Marvel, Wrestling) at 120 clubs. A pair is any two different themes at the same club, so only the 89 clubs that ran two or more themes count, and they make 521 pairs (more pairs than nights). Attendance was compared with each club's own baseline, adjusted for weekday, month, fireworks and giveaways.
- **Verdict: CALL STANDS.** Local taste called 49.1% of 521 within-club pairs (95% interval 43.2% to 54.9%). The pre-registered pass line was 55%, with the interval above 50%. An LLM-only baseline scored 50.6%, mostly ties. This is "not detected at this sample size", not "disproved". (A theme's national popularity scores exactly 50.0% in the app because it is the same for every club and can't rank two nights at one club; the 49.1% for it in `study/RESULTS.md` is a different, unadjusted count.)
- **What that means for the product.** Homestand is a reasoned, cited audit of local taste, not an attendance predictor, and the app says so. Full results: [`study/RESULTS.md`](study/RESULTS.md).

## Limitations

- Qloo's affinity sits near 1 for very popular entities (Country above all), so differences between markets can be tiny.
- Several themes rest on a single Qloo entity. Fifteen library entities were dropped for having no local signal, and one more name has no committed Qloo id, so 16 of the 41 recognised themes are not scored.
- Labels describe what a market leans toward relative to its own average. They do not forecast ticket sales.
- The sample calendars are written by us, with fictional sponsors. The venue sample is a made-up calendar for a sample amphitheatre; the Study covered Minor League baseball only, so nothing about attendance is claimed for venues.
- Venue mode has no sealed test behind it. Its swaps are reasoned from local taste, like the club ones, and no swap here is a booking recommendation.

## Run it locally

```
npm install
npm run worker:dev                                  # Worker with synthetic Qloo answers and template text (no keys, no network)
VITE_API_BASE=http://127.0.0.1:8788 npm run dev     # front end
npm test && npm run typecheck && npm run lint && npm run build
npm run e2e                                         # Playwright against the local Worker
```

Local runs show a "Synthetic demo data" banner. To use real Qloo data, put your own `QLOO_API_KEY`, `QLOO_API_URL` and a random `MARKET_SIGNING_KEY` (16+ characters; it signs the cities the search returns, and the API only accepts searched cities and the sample clubs) in `.dev.vars` (gitignored) and run the `qloo:*` scripts. Re-running the Study needs the 2025 schedules fetched locally (`npm run study:fetch`, see [`DATA_RIGHTS.md`](DATA_RIGHTS.md)).

**Stack:** Vite and vanilla TypeScript on Cloudflare Pages; a Cloudflare Worker (KV, Workers AI); Vitest and Playwright.

## Abuse limits

The public API is limited per client: a Cloudflare Rate Limiting binding per route (per minute, an IPv6 caller counted as its /64), per-client daily quotas (6 new-city lookups, 10 live re-checks, 30 model calls), one live re-check per market and theme per day, and shared daily caps on Qloo and model calls. Model answers are cached in KV, so a repeat costs nothing. A visit to a warm sample club writes nothing to KV.

## Data rights

No MLB data is in this repository or the app. Raw Qloo responses are never committed or exported. See [`DATA_RIGHTS.md`](DATA_RIGHTS.md).

## How it was built

Built with AI coding assistants, credited in [`BUILD_LOG.md`](BUILD_LOG.md).

## License

MIT
