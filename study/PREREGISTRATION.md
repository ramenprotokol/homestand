# The Study: pre-registration

**Locked:** 2026-10-05, before any Qloo score was requested. Pipeline at commit `e2c641d` (branch `hs-plan-1`).
**Rule:** everything below is fixed. Any change before the full Qloo pull is added to **Amendments** at the bottom, with its date and reason. After the pull, nothing changes. Results are published whatever they show.

## Question

Does Qloo's measure of how much a ballpark's local market over-indexes on a cultural theme explain how much a Minor League theme night lifted attendance above that club's normal crowd?

## Data and sample (fixed by the committed pipeline)

- **Source:**
  - 2025 Minor League regular-season schedules (Triple-A, Double-A, High-A, Single-A) from the public MLB Stats API.
  - Fetched for individual, non-commercial study on one machine and never redistributed (see `DATA_RIGHTS.md`).
- **Games in the baseline**, all regular-season (`gameType` "R") home games that are:
  - official finals (`codedGameState` "F", including rain-shortened games) with attendance above zero;
  - not double-headers;
  - not rescheduled;
  - not played with the home and away sides reversed;
  - at the club's most-used venue.
- **Study nights:** baseline games carrying **exactly one** of the nine study themes, as defined by the committed rules in `src/study/themes.ts`:
  - Star Wars
  - Princess
  - Bluey
  - Harry Potter
  - Margaritaville
  - Dinosaur
  - Country
  - Marvel
  - Wrestling
- **Counts at lock:**
  - 7,542 baseline games across 120 clubs, baseline R² 0.786.
  - 385 study nights.
  - 89 clubs that ran two or more distinct study themes, giving 543 within-club theme pairs.
  - Per theme (nights / clubs):

| Theme | Nights / clubs |
|---|---|
| Star Wars | 76 / 76 |
| Princess | 66 / 56 |
| Bluey | 56 / 49 |
| Harry Potter | 47 / 44 |
| Margaritaville | 38 / 37 |
| Dinosaur | 36 / 28 |
| Country | 33 / 30 |
| Wrestling | 20 / 17 |
| Marvel | 13 / 13 |

## Outcome

**Residual lift** of a night is ln(attendance) minus the baseline model's fitted value. The baseline model is ordinary least squares on all baseline games, with these regressors:
- an intercept;
- club fixed effects;
- weekday dummies;
- month dummies;
- a fireworks indicator;
- a giveaway indicator.

The indicator definitions are in `src/study/parse.ts`. If a club ran the same theme more than once, the theme's lift for that club is the mean of its nights.

## Predictors (each scored per theme × club)

All three are standardised **within theme across clubs** (z-score), so each one says how far a market leans toward a theme relative to other markets.

1. **Qloo local affinity (the test).** This is the affinity of the theme's entity bundle in the ballpark's local market, from Qloo's Insights API, using the club's ballpark coordinates.
   - **The bundles are fixed now, in words.** The Day-1 tests resolve them to Qloo IDs, and those IDs are recorded as an amendment before the full pull:
     - Star Wars: the film *Star Wars* (1977), *The Mandalorian*.
     - Princess: *Frozen*, *Moana*, *Cinderella* (1950), *Tangled*.
     - Bluey: the TV show *Bluey*.
     - Harry Potter: *Harry Potter and the Sorcerer's Stone* (film) and the book series.
     - Margaritaville: the artist Jimmy Buffett.
     - Dinosaur: *Jurassic Park* (1993), *Jurassic World* (2015).
     - Country: the artists Luke Combs, Morgan Wallen, Carrie Underwood.
     - Marvel: *The Avengers* (2012), *Spider-Man: No Way Home*.
     - Wrestling: WWE (brand or TV, whichever Qloo resolves).
   - **The bundle score** is the mean affinity of the entities Qloo resolves.
   - **The exact request shape** (endpoint, location parameter and radius) is fixed by the Day-1 tests and recorded as an amendment before the full pull. Default: `signal.location` = ballpark POINT, radius 40 km.
2. **National popularity (baseline 1).** Each theme bundle's national popularity as reported by Qloo, the same for every club. Within a club it predicts that the nationally more popular theme draws more.
3. **LLM only (baseline 2).** One request per theme × club to Cloudflare Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, temperature 0, with this prompt and nothing else:
   > "On a scale of 1 to 10, how much does the local market around {city}, {state} over-index on {theme label} compared with the average US Minor League Baseball market? Reply with a single integer."

   A non-integer reply is retried once. If it fails again, it is recorded as missing.

**Missing data:** a theme × club combination missing **any** predictor is dropped for **all** predictors, so every comparison uses the same pairs. The number dropped is reported.

## Analyses

**Primary (H1): within-club pairwise accuracy.**
- **Pairs:** for every club with two or more themes, each pair of its themes (A, B).
- **What counts as a correct call:** a predictor calls the pair correctly when the theme it scores higher had the higher mean lift. A tie in the predictor counts as 0.5.
- **Accuracy** is the mean over all pairs.
- **Uncertainty:** a 95% interval from a club-clustered bootstrap. Clubs are resampled with replacement, 10,000 times, seed `20261030`.
- **H1 passes only if both hold:**
  - Qloo's accuracy is at least **55%**;
  - its 95% interval's lower bound is above **50%**.

**Secondary (H2): Qloo versus the baselines.**
- Paired club-bootstrap intervals for (Qloo accuracy − LLM accuracy) and (Qloo accuracy − national popularity accuracy).
- "Beats" a baseline means the interval of the difference lies above zero.

**Secondary (H3): pooled association.**
- OLS of night-level lift on theme fixed effects plus the predictor's z-score.
- Reported: the coefficient and the partial correlation, with club-bootstrap 95% intervals. Run separately for each predictor.

**Descriptive.**
- Per-theme accuracy (no inference: samples are small, especially Marvel at 13 nights).
- A scatter of predictor z against lift.

Only H1 is confirmatory. Everything else is labelled secondary or descriptive.

## What is published

- **The code, plus aggregate results:**
  - accuracies;
  - intervals;
  - coefficients;
  - per-theme summaries;
  - counts.
- **Not published:** raw MLB data, per-night attendance, or raw Qloo responses.
- **If H1 fails,** the product's claim becomes "a reasoned, cited audit", and the app says so plainly.

## Amendments

_None yet._
