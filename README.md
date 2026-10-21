# Homestand

**Theme nights your town will actually like.**

Homestand checks a minor league team's theme-night calendar (baseball, basketball, hockey or soccer), or a concert venue's summer dates, against what people in its own town like, using Qloo's Taste AI. It then proposes swaps that keep every sponsor and every date. Before building it, we ran a sealed, pre-registered test, on baseball only, of whether local taste predicted bigger crowds at 385 real 2025 theme nights (at 106 clubs). The result is published as it came out: it did not.

**Live demo:** https://homestand-6az.pages.dev. Pick a sample club, or use your own: type any US or Canadian city, paste or load a calendar, and Homestand scores it live. No sign-up.

Homestand is not affiliated with any team, league, artist or brand named in its examples or sample calendars, and no sponsor in a sample is real. A theme's fit is about what people in a town like, not about an artist's or a brand's draw.

## What it does

A promotions director plans dozens of theme nights a season, and most of them are sold to sponsors. Nothing tells a club whether *its own* market likes Bluey more than Margaritaville. Homestand gives that answer in three guided steps:

1. **Check.** The calendar appears as a board of foil cards, one card per night, each with its sponsor and a lock where it has one. Each theme is labeled **Strong fit**, **Average fit** or **Weak fit** for this market.
   - **Why panel.** Tap a card and it flips: the back gives the plain reading, and the side panel gives what Qloo looked at, the detail, the numbers behind the label (under "Show the numbers") and a **Get fresh data** button.
   - **Ambiguous names.** When a night's name fits two themes ("Elvis and the Beatles Night"), Homestand asks the director to choose. It never guesses.
   - **Unscored nights.** Classic promos (fireworks, dollar dogs, heritage nights) and unknown themes are labeled, not scored.
2. **Fix.** For unlocked nights that lean away, Homestand proposes a swap. You see the new night, the reason and both scores before you approve.
   - **Audience rule.** A kids or family night is only ever replaced by a kids or family theme. Star Trek, pro wrestling, Batman, Top Gun and Lord of the Rings are tagged teen, so a Bluey Day can never become Star Trek or wrestling; if nothing is a strong fit, it may get the best option for its audience (below) or a discovered family title; otherwise the nights are listed together in one "Could not fix" block with a next step. A teen or adult night may take any theme that is not for small children, and kids' themes only on weekends and day games.
   - **Best option for the audience.** If nothing in a kids or family night's audience is a strong fit, it may get the strongest same-audience theme that is at least about this town's usual and clearly better than the planned night. The thresholds are in [`docs/best-option.md`](docs/best-option.md).
   - **Ranking, and joint assignment.** Within that rule, a candidate is ranked by same kind of theme first, then same audience, then how strong a fit it is; a music night also prefers the same genre, then a related one (rock, classic rock, jam, indie and emo are one family; pop, R&B, hip-hop and Latin another; country stands alone). Swaps are assigned together, not first come first served: the set with the best total fit wins, so a country night gets the country act (Garth Brooks gets Kenny Chesney, not The Beatles) and the other night takes the next best. Each night shows up to two alternates.
   - **Locks.** A locked night is never swapped. It gets a sponsor-friendly touch chosen with Qloo's taste graph: one call per locked night asks what fans of the locked theme near the ballpark also lean toward (`signal.interests.entities`), among unused themes of the same kind and audience band, and the best one becomes the suggestion ("Fans of <theme> near <city> also lean toward X…"). A theme that is already a proposed or approved swap is never also offered as a touch, and two locked nights never get the same one; the idea is re-chosen when the director switches a swap to an alternate. One candidate is enough to ask; if there is no same-kind theme it widens to any theme for the same audience, and only then, or if Qloo is unavailable, does it fall back to a generic angle. A real example: Albuquerque's locked Country Music Night gets "Fans of Country music near Albuquerque also lean toward Kenny Chesney…".
   - **Slight leans.** A Weak night whose raw gap is under 0.01 is only a lean ("Leans weak"). Its swap, if there is one, is marked optional and sorted last; if there is none, the night is named in an "Only a slight lean, left as planned" block on Fix and in the memo instead of being listed as "could not fix".
   - **Approval.** Nothing changes until the director approves it.
   - **Step log.** "How Homestand decided" logs every step: theme resolution, each Qloo call (cached or live), each constraint check and each model call.
3. **Send.** Export the revised calendar as CSV or ICS, plus a one-page rationale memo for sponsors.

**The rule: code computes, the model explains.** Scoring, normalization, constraints and ranking are plain TypeScript. A language model (Llama 3.3 70B on Cloudflare Workers AI) only words the reasons for each swap. Every number it writes must appear in the computed facts, and it may not claim an effect on sales or attendance, or the app falls back to template text (also used if the model takes longer than six seconds). The memo's opening sentence is fixed wording built from counts.

## How Homestand uses Qloo

For each night, Homestand asks Qloo's Insights API how much people within 80 km like the theme's declared entities (`signal.location` with a fixed `filter.results.entities` list), and compares that reading with the identical request at 40 reference towns, changing only the location. That is the place-to-place comparison Qloo's docs describe in [Interpreting affinity scores](https://docs.qloo.com/docs/interpreting-affinity-scores) ("how well a restaurant appeals to diners in one neighborhood versus another"), and we tested that it holds for our request shape: the same entity at the same place returned the identical value whether asked alone, in lists of 6, 10 or 12, in a tag-filtered query two days later, or on a repeat call.

A theme's index is how far the town sits from the other towns, in units of their spread, minus the town's own average across all themes, so a town that scores high on everything doesn't light up every card. Qloo's affinity for very popular entities sits near 1 everywhere, and Qloo's docs say "a slight difference, like 0.91 versus 0.92, usually indicates similar relevance" ([Interpreting affinity scores](https://docs.qloo.com/docs/interpreting-affinity-scores)). So when the raw gap behind a label is under 0.01, we mark it as a slight lean ("Leans strong" or "Leans weak") and don't push a swap: its swap is offered as optional, never pre-selected, and left out of the count of nights to fix.

We chose not to use Heatmap Insights, Qloo's tool for comparing places: because it ranks places against each other, it wouldn't remove the small-gap issue. Our pre-registered study found the score didn't predict which theme night drew the bigger crowd, so Homestand describes local taste and never forecasts ticket sales.

One new city, end to end:

1. **Request.** The browser sends the picked city (name, longitude, latitude, signed by the Worker's search) and the calendar rows to `POST /api/analyze`. For each theme in the library, the Worker calls `GET /v2/insights` with `filter.type` (one call per entity type), `filter.results.entities`, `signal.location=POINT(lon lat)` and `signal.location.radius=80000`. That is five batched calls for the library, then two more for a pool of family titles.
2. **Result.** Qloo returns, per entity, how strongly that place likes it. In words: "Bluey's local affinity sits in the bottom fifth of the 40 reference towns", so Bluey is a Weak fit here, unless the raw gap is tiny, in which case it reads "Leans weak".
3. **What you see.** Each night gets Strong, Average or Weak fit (or a lean), with the plain reason and, under "Show the numbers", what Qloo looked at and the raw gap. Clear Weak nights get swap proposals. Nothing in the result is a sales forecast.

The answers are saved server-side for 120 days, so the next visit for that town makes no Qloo call.

## The agent loop

Homestand is an agent in a small, bounded sense: it works through a calendar in steps, and a person decides at the one point that matters.

1. **Looks up local taste through Qloo** for the town (cached after the first time), and logs every call in "How Homestand decided".
2. **Searches for swaps under the rules:** locked nights and sponsors never change, a kids' night only becomes a kids' or family theme, no theme repeats unless the director allows it, and the best set of swaps overall is chosen, not first come first served.
3. **Asks the human when a name is unclear.** A night such as "Elvis and the Beatles Night" fits two themes; Homestand asks which one. It never guesses.
4. **Proposes, then waits.** Every swap is a proposal with its reason and both scores. Nothing changes until the director approves it.
5. **Rechecks on request.** "Get fresh data" asks Qloo again for one theme (once a day per town and theme).
6. **Writes the memo** for the approved changes, as a one-page rationale for sponsors, plus the revised CSV and calendar file.

Reliability choice, stated once: code computes, the model explains. Scoring, constraints and ranking are plain TypeScript; a language model (Llama 3.3 70B on Cloudflare Workers AI) only words the reason for each swap, every number it writes must come from the computed facts, and template text is used otherwise.

## Use Homestand from an AI assistant (MCP)

Homestand also runs as an [MCP](https://modelcontextprotocol.io) server, so an AI assistant can check a calendar and suggest swaps for you. The address is `https://homestand-api.ramenprotokol.workers.dev/mcp`. There is no sign-in. It uses the same daily limits as the website, and it never returns raw Qloo numbers, only fits and reasons.

- **Claude:** Settings, then Connectors, then Add custom connector. Paste the address.
- **Other MCP clients (ChatGPT, Cursor, the MCP Inspector):** add a remote server of type "Streamable HTTP" with the same address. To try it from a terminal: `npx @modelcontextprotocol/inspector --cli https://homestand-api.ramenprotokol.workers.dev/mcp --transport http --method tools/list`.

Tools: `check_calendar` (rates every night), `propose_swaps` (replacements for the weak nights; locked nights, dates and sponsors stay), `explain_night` (why one theme got its rating) and `sample_teams` (the made-up demo teams, so you can try it without typing a calendar).

Example prompt: "Check this hockey calendar for Fargo, ND and fix the weak nights."

## Qloo, call by call

- **Entity resolution, done offline** with `npm run qloo:resolve`. The library recognizes 41 theme names, and 25 of them are scored live with Qloo (30 entities). Each scored theme is a small, declared bundle of Qloo entities, for example Star Wars = *A New Hope* + *The Mandalorian*. The other 16 names (PAW Patrol, Pokemon, Peanuts, Batman and so on) are recognized but left alone, because Qloo returned no local signal for them or no exact-name match was found; the app says so instead of treating them as unknown text. IDs come from `/search` by exact name match (and release year for films); a fuzzy match is never forced.
  - **Coverage check.** Entities that return no local affinity at the sample markets are dropped. One example is *Toy Story*, which returns nothing even with the release-year floor below.
  - **What's committed:** the IDs, in `src/app/data/entity-ids.json`.
- **Local affinity, at runtime.** The call is `GET /v2/insights` with these parameters:
  - `filter.type` (one call per entity type);
  - `filter.results.entities` (every bundle entity of that type);
  - `signal.location=POINT(lon lat)` for the ballpark;
  - `signal.location.radius=80000`;
  - `filter.release_year.min=1900` on movie calls only. Qloo hides older films without it.

  That is five batched calls per market to score the whole library, plus two discovery calls (below): seven Qloo calls for a new city (five to score the library, two to score the title pool), plus one taste-graph call per distinct locked theme (at most five live per request, and a client has 40 a day; see Abuse limits), then none until it is asked again, because the answers are cached. The taste-graph answer is keyed on the market and the locked theme only and asks about a fixed candidate set, so changing something else on the calendar never makes a new live call. This is the same request shape the Study fixed on Day 1 ([Amendment 4](study/PREREGISTRATION.md)).
- **Local favorite.** The library is fixed, so a kids or family night can run out of library themes that fit. Discovery finds family-friendly animated titles that stand out *near this ballpark*, not nationally:
  - **A fixed pool, built offline** (`npm run qloo:discovery-reference`, 96 Qloo requests, run once). The top 30 family+animation movies and top 30 shows at 8 spread-out reference markets give a pool of 46 titles (32 movies, 14 shows). Titles that are already library themes are dropped, and so are titles with no national popularity from Qloo or under 0.7, because a director won't run "RWBY Chibi Day". Each title's popularity is kept with its aggregates. The pool is then scored at all 40 reference markets, and only each title's aggregates (n, mean, SD) are committed in `src/app/data/discovery-reference.json`, the same way `reference-stats.json` is stored. Nothing market-level is stored.
  - **Runtime, two calls:** `GET /v2/insights` with `filter.results.entities` set to the pool's ids (one call for movies, one for shows) at the market's POINT and 80 km radius. Each title's reading is compared with its own spread over the 40 markets (z). That z is then **centered on the market's own average over the whole pool**, the way the library index is centered, so a market that scores high on everything does not show most of the pool as standing out. A title **stands out** when the centered z clears the same bar the library uses for "Strong fit" (+0.5). Only declared big theatrical titles are offered (a title can be popular on Qloo and still unknown to most people): a swap needs one of those with popularity 0.97 or more, and the ideas list (at most three) needs 0.90. There is no artist discovery for clubs, and no under-25 call: Qloo's age signal returns nearly the same national list in every market, which would contradict "your market, not the national chart".
  - **Use:** when no library theme can fix a kids or family night, the top discovered title that stands out here is offered as a swap, marked "Local favorite", with no fit number because it is not measured against the library. The Fix screen shows "Family titles that stand out near <city>" (with "Qloo had local data for N of our 46 family titles here") and the memo repeats them. Only name, id, type and z values are kept from each response. A night named after a pool title (for example "Lion King Night") is scored from that title's own reading with the same centered z and shown as Strong fit, Average fit or Weak fit; it is never swapped. "Frozen" and "Moana" nights score as the Princess theme, whose bundle contains both films.
  - **Why a pool:** asking for "the top family titles near X" returns almost the same list in every city. Scoring a fixed pool and ranking each title against its own spread is what makes the answer local (Fresno, Portland ME and El Paso get different titles).

- **A market-relative index.**
  1. A theme's bundle score (the mean affinity of its entities) is compared with 40 reference towns: z = (score − typical) / spread. Only per-theme aggregates are stored, and they are not in this repository (see Rebuilding the reference data).
  2. Some markets sit lower or higher on almost everything, so each theme's **index** is its z minus the market's own average z across all scored themes. The Study uses the same within-market comparison.
  3. An index of +0.5 or more is "Strong fit", and −0.5 or less is "Weak fit".
  4. In the app this shows as plain words: "Fit: Weak fit" and "Star Wars here: well below most towns" (the z against the 40 markets). The reference stores only mean and SD per theme, so it can say "below most markets" but not "38th of 40". Star Wars at 0.99 can sit below average because nearly every market scores it near the top, so the small gaps are what is compared.
  5. "Average across 24 themes" in the numbers can differ from the 25 themes scored live: a market's average only counts themes Qloo returned a reading for there, and one theme can have no reading at a given market.
- **Caching and limits.** The Worker caches Qloo responses in KV, server-side. A daily cap protects the event allowance. Past it, the app serves recorded results with a "recorded on" label. The Qloo key never reaches the browser.

## Any sport

The engine does not know what sport it is. Homestand also runs for minor league **basketball, hockey and soccer** teams (no football: too few home games to plan theme nights around). "Use your own" asks for the sport first; baseball is the default and reads exactly as before. The sport changes only the words (team or club, arena, ballpark or stadium, the season's months, proven promos such as teddy bear toss, T-shirt nights and scarf giveaways, and the sponsor's ceremonial moment). Scoring, caches and the theme library are the same for every sport. The one extra sample is **Boise, ID sample team**: a made-up basketball team with a November 2027 to April 2028 calendar of 22 nights and fictional sponsors. The Study stays baseball-only, because it is real 2025 baseball data.

## Venue mode (concert venues)

The same Check, Fix and Send engine also runs on a touring-act calendar. The one sample is **Raleigh, NC sample amphitheatre**: a made-up summer calendar (May to September 2027, 18 dates, fictional sponsors) for a sample amphitheatre, not any real venue. Open it from the home page line or the picker, or at `#/check/raleigh`. On the real results, Journey's date is a clear weak fit and gets Rainbow Kitten Surprise as its offer; Avril Lavigne (May 22) and Pierce the Veil (Jun 18) only lean weak, so they are left as planned and named in an "Only a slight lean, left as planned" block. Club runs keep their wording and their library. A snapshot test (`tests/app/club-regression.test.ts`) pins, under synthetic data, every band, swap, alternate, angle and step-log line of the four baseball samples and "Load an example"; it was regenerated only after reviewing the changes the shared engine work caused (joint swap assignment, genre families for music nights, add-ons that never repeat a swap, centered discovery).

- **The calendar.** Five signed headliners (locked, "Contract signed"), nine tentative holds, two tribute nights (Yacht Rock, Emo Night, each a small declared bundle of artists) and two classic dates (Fireworks & Symphony, Local Battle of the Bands). Every act is one that plays amphitheatres and still tours; none is a stadium act.
- **Artist library.** 37 artist and tribute themes (35 scored; Peso Pluma and Eagles returned no local signal at any of the 40 reference markets, and Steely Dan was dropped from the Yacht Rock bundle for the same reason). Nine of them (Zac Brown Band, Brad Paisley, Darius Rucker, Old Dominion, The Revivalists, Hozier, Avril Lavigne, Pierce the Veil, Cage the Elephant) and Stevie Nicks were promoted from the act pool so a calendar can hold them; their aggregates were already pulled. Acts that no longer tour (Fleetwood Mac, Grateful Dead, Elvis, The Beatles, Margaritaville, Dolly Parton) are marked `touring: false`: they are scored, but never offered as a swap or a support act. Each has a `genre`, and so do the ten music themes the club library already had. Each also has a **declared booking tier** (stadium, arena, amphitheatre or theatre): our own judgement of the room it headlines, not Qloo data. IDs come from exact-name `/search` (`npm run qloo:resolve -- --type=artist`). The venue library is the music themes plus these: 45 themes, and exactly 50 artist ids, which is Qloo's limit for one request. Club runs never see the artist themes. Reference aggregates (z against the same 40 markets) were added with `npm run qloo:reference -- --venue`; only aggregates are committed.
- **Genre-aware swaps, as offers.** The Fix page reads as "who to send an offer to for this open date". For a music date, a swap is ranked by same genre first, then a related genre, then anything. Candidates must lean in, still tour, be within one booking tier of the date, not already be on the calendar, and be an act (a solo artist, or a tribute night for a tribute date): never a genre bundle such as "Country music". A venue run never crosses into another genre family, so when nothing in the same or a related genre is a strong fit, the date goes in "Could not fix" with the reason. A swapped date exports as a new hold with the note "withdraw the offer to <act>"; the old "offer out" note is never inherited. The list "Acts that stand out near <city>" leads the page: it is the talent buyer's shortlist.
- **Local favorite, for acts.** Same method as the family titles, including the centering on the market's own pool average. A declared list of touring acts (by genre, with a declared tier) is matched by exact name against Qloo's genre-tagged artist lists (`npm run qloo:acts-reference`: 20 requests for the pool, 80 for the 40-market aggregates). Acts whose reading barely moves between markets (spread under 0.002; Qloo's affinity saturates near 1 for the biggest names) are left out, which removed most pop, hip-hop and R&B names. A second script (`npm run qloo:support-acts`, 26 exact-name searches and 40 market requests) added 21 rising and touring theatre-tier acts. **The pool is one list of 63 acts** (27 of them theatre tier; the 21 rising acts are in it, not in a separate list). At runtime two requests (50 acts each) score the whole pool at the venue. An act is offered as a swap or listed as standing out only if it stands out locally and its national popularity is 0.95 or more, so the rising acts rarely appear there (19 of the 27 theatre-tier acts clear that floor); as a support-act candidate an act needs no popularity floor. A discovered act competes with library themes at its genre tier, and a library theme wins a tie. Some cities get none, and the Fix page says so.
- **Support act for a locked headliner.** One taste-graph call per distinct locked headliner (`signal.interests.entities`, cached under `tg:v2`) asks which acts fans of the headliner near the venue also lean toward. Candidates must still tour and sit **at least one declared booking tier below** the headliner (there is no popularity cap: Qloo's popularity is near 1 for every big act, so it said nothing). The headliner's own genre comes first, 50 candidates at most. The set asked about depends only on the headliner, not on the calendar; acts already on the calendar and acts that are a proposed swap are removed from the answer afterwards. The wording is "Support act idea: fans of X near Raleigh also lean toward Y, so an act like Y could fit the opening slot". When no act qualifies, it is worded as a promo tie-in, never a support act. Two headliners never get the same act. Every locked headliner gets one, not only those that lean away.
- **Qloo calls for a new venue city:** 1 (the venue library, one artist request) + 2 (the 63-act pool, two requests) + 1 per distinct locked headliner, at most 5 live per request. Raleigh (5 headliners) costs 8, then nothing while cached.
- **Wording.** A venue run says city, other cities, summer series and date where a club run says town, towns, season and theme night, on Check, Fix, Send, the memo and the exports. The Study is baseball only, and venue pages say so.

## The Study

A pre-registered test of one question: **at the same ballpark, did the theme with the stronger local Qloo lean draw the bigger crowd?**

- **Locked first.** The hypotheses, sample, outcome model, metrics and the bar we set were committed before any Qloo request ([`study/PREREGISTRATION.md`](study/PREREGISTRATION.md), Amendments 1–5). The scores were then frozen with a SHA-256 hash before any attendance data was opened ([`study/PULL_RECORD.md`](study/PULL_RECORD.md)).
- **Data.** These were 385 theme nights from 2025 (Star Wars, Princess, Bluey, Harry Potter, Margaritaville, Dinosaur, Country, Marvel, Wrestling) at 106 of the 120 clubs we scored (the other 14 ran none of the nine themes). A pair is any two different themes at the same club, so only the 89 clubs that ran two or more themes count, and they make 521 pairs (more pairs than nights). Attendance was compared with each club's own baseline, adjusted for weekday, month, fireworks and giveaways.
- **Verdict: NOT PROVEN** (the pre-registration's own term is CALL STANDS). Local taste called 49.1% of 521 within-club pairs (95% interval 43.2% to 54.9%). The bar we set in advance was 55%, with the interval above 50%. An LLM-only baseline scored 50.6%, mostly ties. This is "not detected at this sample size", not "disproved". (A theme's national popularity scores exactly 50.0% in the app because it is the same for every club and can't rank two nights at one club; the 49.1% for it in `study/RESULTS.md` is a different, unadjusted count.)
- **What that means for the product.** Homestand is a reasoned, cited audit of local taste, not an attendance predictor, and the app says so. Full results: [`study/RESULTS.md`](study/RESULTS.md).

## Known limitations

- **The Study did not show that local taste predicts crowds.** On 521 within-club pairs of 2025 baseball theme nights, local taste picked the bigger crowd 49.1% of the time (likely range 43.2% to 54.9%); the bar we set before looking was 55%. An AI guess with no local data got 50.6%, mostly ties. The honest reading is "not proven in one season of baseball", not "disproved". What the data did show is narrower: an AI guess could not tell towns apart (the same answer at every club for 5 of 9 themes), while Qloo's readings did differ town to town.
- Homestand audits local taste. It is not an attendance predictor, and nothing in it claims to be.
- The Study covered Minor League baseball only. Basketball, hockey, soccer and the concert-venue mode have no sealed test behind them, and no swap is a booking recommendation.
- Qloo's affinity sits near 1 for very popular entities (Country above all), so differences between markets can be tiny.
- Several themes rest on a single Qloo entity. Fifteen library entities were dropped for having no local signal, and one more name has no committed Qloo id, so 16 of the 41 recognized themes are not scored.
- Qloo returned identical readings for some nearby clubs in the Study (19 of 120 shared a full set of readings with a neighbor), so there are about 101 independent local readings, not 120.
- The sample calendars are written by us, with fictional sponsors, for a made-up team and a made-up amphitheatre.
- Live lookups for new cities depend on the hackathon Qloo key. After the hackathon they stop; the sample calendars (saved copies) and any city already checked keep working.
- Free-plan limits apply: each person can look up 30 new cities a day, and the whole site shares a daily Qloo allowance (see Abuse limits).

## Run it locally

```
npm ci
npm run worker:dev                                  # Worker with synthetic Qloo answers and template text (no keys, no network)
VITE_API_BASE=http://127.0.0.1:8788 npm run dev     # front end
npm test && npm run typecheck && npm run lint && npm run build   # 550 unit tests (548 and 2 skipped on a clean clone, where the real reference data is absent)
npm run e2e                                         # Playwright against the local Worker (108 checks: 54 at desktop width, 54 at phone width)
```

A clean clone needs no keys and no Qloo data: the real reference data is not in the repository, so the Worker bundles made-up stand-ins (`src/app/data/*.synthetic.json`) and says so ("Synthetic demo data"). To use real Qloo data, put your own `QLOO_API_KEY`, `QLOO_API_URL` and a random `MARKET_SIGNING_KEY` (16+ characters; it signs the cities the search returns, and the API only accepts searched cities and the sample clubs) in `.dev.vars` (gitignored). Re-running the Study needs the 2025 schedules fetched locally (`npm run study:fetch`, see [`DATA_RIGHTS.md`](DATA_RIGHTS.md)).

### Rebuilding the reference data

Qloo's hackathon guide says not to store Qloo response data in a public repository, so the reference data is yours to pull with your own key. Each script reads `.dev.vars` and writes a gitignored file under `src/app/data/`:

| Command | Writes | What it is |
|---|---|---|
| `npm run qloo:resolve` | `entity-ids.json` (committed: IDs and names only) | Qloo entity IDs for the theme library |
| `npm run qloo:reference` | `reference-stats.json` | Per-theme mean and spread over 40 reference towns |
| `npm run qloo:discovery-reference` | `discovery-reference.json` | The pool of family titles, with per-title aggregates |
| `npm run qloo:acts-reference` and `npm run qloo:support-acts` | `acts-reference.json` | The touring-act pool for venue mode |

Before every build, test and `wrangler dev` / `wrangler deploy`, `scripts/prepare-data.mjs` copies the real file if it exists, or the committed synthetic one if not, into `src/worker/data/` (gitignored), and only the Worker imports it. The browser bundle never contains these values. To force synthetic data on a machine that has the real files, set `HOMESTAND_SYNTHETIC_DATA=1`.

### Deploying (the ops notes)

The Worker is deployed from a machine that has the real reference files, because `wrangler deploy` runs `prepare-data` first (`[build]` in `wrangler.toml`) and bundles what it picks. Before building the site, run `npm run snapshots -- <api base> <site origin>`: it saves each sample's results from the live API into `public/snapshots/` (gitignored), the build copies them into `dist/`, and the site falls back to them with a "Showing a saved copy" banner if the server does not answer. Optional: set a `WARM_TOKEN` secret, then `WARM_TOKEN=... npm run warm:metros -- <api base> 5` warms the largest US and Canadian metros on demand; a cron does the same a few towns every three hours.

**Stack:** Vite and vanilla TypeScript on Cloudflare Pages; a Cloudflare Worker (KV, Workers AI); Vitest and Playwright.

## Abuse limits

The public API is limited three ways, all inside Cloudflare's free plans.

- **Per client, per minute** (Cloudflare Rate Limiting bindings, an IPv6 caller counted as its /64): 20 searches, 30 analyses, 40 swap requests, 15 re-checks, 30 health checks and 60 MCP calls.
- **For everyone together, per minute:** at most 20 live new-city pulls and 30 model calls a minute, so a few addresses need hours, not minutes, to use up the daily caps.
- **Per day:** each client gets 30 new cities, 20 re-checks, 60 model calls and 40 taste-graph lookups (sample markets do not count), and the whole site shares a daily cap of 1,500 Qloo calls and 400 model calls. A re-check is allowed once a day per market and theme.

The quotas are sized so a team of judges behind one office address is not blocked; the shared caps, not the quotas, bound the total.

**Where the counters live.** Every counter and gate is one row in a SQLite-backed Durable Object (`src/worker/counters-do.ts`): an atomic "add unless over the cap", so two visitors can never both take the last unit. KV keeps only saved results (120 days). If the counter object cannot be reached, the shared caps fail closed for NEW lookups only, a client's own daily gate fails open (the per-minute limits still apply), and a saved city or a sample never touches the counters at all: it keeps working. `/api/health` is rate limited, remembers its answer for 45 seconds and says only `ok`, `low` or `paused`, never how much is left. City searches are saved for a week in the edge cache and make at most three geocoder calls.

**Cost of a visit (free-plan limits in brackets).** A new city (Check and Fix) writes 2 saved results to KV (3 with the model's wording) and makes 3 to 5 counter steps; a visit to a saved sample writes nothing and makes no counter step. KV allows 1,000 writes and 100,000 reads a day; the counter object allows 100,000 requests and 100,000 rows written a day.

## Data rights

No MLB data is in this repository or the app. Raw Qloo responses are never committed or exported. See [`DATA_RIGHTS.md`](DATA_RIGHTS.md).

## How it was built

Built with AI coding assistants, credited in [`BUILD_LOG.md`](BUILD_LOG.md).

## License

MIT
