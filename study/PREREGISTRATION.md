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

### Amendment 1: 2026-10-05, after an independent design review, before any Qloo request

The original text above is kept unchanged. Where they differ, the rules below replace it.

**A1. National popularity is not z-scored.**
- Qloo local affinity and the LLM rating are standardised **within theme across clubs** (z-score over the clubs in A2), so each says how far a market leans toward a theme relative to other markets.
- National popularity is **not** standardised. It is one number per theme, identical for every club: the mean of the bundle entities' Qloo `popularity` values at the time of the pull.
- By construction it carries no local information. It answers "which themes are big everywhere", not "which themes this market leans to".

**A2. Every theme is scored for every club.**
- **What is requested:** Qloo and LLM scores for **every theme × every baseline club**, 9 × 120 = 1,080 requests each, not only the combinations that ran a theme. Z-scores are computed over all 120 clubs.
- **Fallback:** if Qloo's event limits do not allow 1,080 requests, use the 350 theme × club combinations that ran a theme, with z-scores over those clubs per theme. This fallback is recorded as an amendment before the pull.
- **Location:** each club's location is its most-used venue's latitude and longitude from the pipeline. Two clubs share identical coordinates, so they get identical Qloo and LLM scores. This is noted, not corrected.

**A3. H1 uses theme-centred lift, and national popularity leaves H2.**
- **H1, correct call:** a predictor calls a pair correctly when the theme it scores higher had the higher **theme-centred lift**. A tie in the predictor, or in the outcome, counts as 0.5.
- **Theme-centred lift:** the club's mean lift for that theme, minus the mean of that quantity over all clubs that ran the theme.
- **H2 becomes:** a paired club-bootstrap interval for (Qloo accuracy − LLM accuracy), both on the theme-centred outcome. "Beats" means the interval lies above zero.
- **National popularity is reported descriptively instead.** It predicts the same order for every club, and on the centred outcome every one of its calls is a tie. The two descriptive reports:
  - (a) its pairwise accuracy on **raw** (uncentred) lift, next to Qloo's and the LLM's raw-lift accuracies. This is labelled as a theme-level baseline with about 9 effective data points.
  - (b) the Spearman correlation between national popularity and the nine theme mean lifts.
- **H3:** for national popularity, the pooled OLS leaves out the theme fixed effects, because it is collinear with them. This is reported for context only.

**A4. The Day-1 request shape is chosen without looking at outcomes.**
- **No outcome data:** the Day-1 tests run from a club list containing only club name, city, state, latitude and longitude. They never read `data/derived/` or any attendance or lift value. No accuracy or correlation against lift is computed before the full pull.
- **How the shape is chosen,** by these criteria in order:
  1. It returns a numeric affinity for every resolved entity at 95% of ballparks or more.
  2. The score varies across ballparks (more than one distinct value per entity).
  3. It uses the smallest radius of 40 km or more that meets (1) and (2).
  4. If `signal.location` as a POINT fails (1), the fallback is the locality entity nearest the ballpark.
- **Scope:** the tests use at most 10 clubs, chosen alphabetically.
- **Recorded before the pull, as an amendment:** the chosen shape, the bundle entity IDs, the popularity values and the request count.

**A5. The "flat affinity" diagnostic is fixed in advance.**
- Under Descriptive: report each theme bundle's across-club SD of the Qloo score and its number of distinct values.
- If a bundle's score doesn't vary across clubs, its pairs are ties (0.5) and it stays in the sample. Nothing is dropped on this basis.

**A6. The LLM prompt uses the bundle wording.** The prompt becomes:

> "On a scale of 1 to 10, how much does the local market around {city}, {state} over-index on {theme label} (for example {bundle entities, exactly as listed in the Qloo bundle}) compared with the average US Minor League Baseball market? Reply with a single integer."

The theme labels used are "country music" and "pro wrestling" for those two themes.

**Bundle refinements, decided now:**
- **Dinosaur** adds the children's TV show *Dinosaur Train* to *Jurassic Park* (1993) and *Jurassic World* (2015), if Qloo resolves it. MiLB dinosaur nights are children's events.
- **Princess** is recorded as a proxy for the children's dress-up audience. Many matched nights are "Pirates & Princesses" style events.
- **Country** stays the three artists. A genre tag will not be tried.

**Robustness and limitations, labelled as such:**
- **R1, per-club-weighted accuracy:** each club's pairs are averaged first, then the club averages are averaged. Twelve clubs with 6–8 themes contribute 37% of pairs, so this checks the result isn't driven by a dozen large clubs.
- **R2, promo stacking:**
  - Study nights carry 2.5–3.0 promos on average, against 1.75 on other nights. Jersey auctions, appearances and drink specials are not controlled.
  - This is noise, not bias, unless clubs stack more promos on themes their market loves. That would favour Qloo, and this is stated.
  - A robustness baseline adds a "number of other promos" regressor.
- **R3, baseline includes the study nights:** the baseline is fitted with the 385 study nights included, which shrinks their lift slightly. In-sample and held-out lifts correlate at 0.999. This is noted, not changed.
- **R4, edge nights:** no study night falls on July 3 or 4 or on a club's opening date. Six fall on a club's last home date. This is noted, not changed.

**Power, from a simulation on the real cluster structure (89 clubs, 543 pairs, 200 simulations per effect size, club bootstrap):**
- **Under no effect:** the accuracy SD is about 2.8 percentage points (about 300 effective pairs), and the false-pass rate is 1–4%.
- **Where the pass line sits:** the lower-bound rule binds at an observed accuracy of about 55.5%.
- **What is detectable:** 80% power needs a true pairwise accuracy of about 58%.
- **How a miss is reported:** "not detected at this sample size", not "disproved".

**The analysis script** (per-club-theme averaging, centring, z-scores, pairs, ties, a seeded club bootstrap, H1–H3, R1 and the descriptives) is written and tested on synthetic data before the pull. It is committed as part of this lock.

**Verdict words.** These are shown in the app. Each depends only on H1's Qloo accuracy on the centred outcome and its 95% interval:
- **CONFIRMED:** H1 passes (accuracy 55% or more and lower bound above 50%).
- **OVERTURNED:** the interval's upper bound is below 50%, meaning evidence that local taste points the wrong way.
- **CALL STANDS:** anything else (not enough evidence either way).

### Amendment 2: 2026-10-05, after the analysis script was written and tested on synthetic data, before any Qloo request

- **No variation means no call.** If a predictor has no across-club variation for a theme (every club gets the same value), it makes **no call** on any pair that contains that theme, and those pairs score 0.5.
  - This is how A5's "its pairs are ties" is implemented.
  - It is also why national popularity scores exactly 0.5 on the centred outcome (A3).
- **Centring uses every club that ran the theme,** as A3 says, not only the clubs kept after the missing-data rule.
- **The robustness baseline (R2)** adds the number of **other** promos on the night, not the total.
- **H3 for national popularity** reports a coefficient and a partial correlation, each with a club-bootstrap interval, as the original H3 says. It is labelled context.
- **Inference details:**
  - Z-scores and centring are computed once on the full sample and held fixed. The bootstrap resamples clubs only.
  - H1, H2, R1 and R2 share the same bootstrap draws.
  - H3 uses its own seeded draws over every club with a kept night.
  - Percentiles use linear interpolation (R type 7).
- **Settings:** seed `20261030`, 10,000 draws.

### Amendment 3: 2026-10-05, after an independent statistical review of the analysis script, before any Qloo request

The review re-implemented the analysis independently and matched it to 6 decimals. It found no statistical bug. These lines make the text match the code exactly.

- **Binned summary instead of a scatter.** The "scatter of predictor z against lift" is published as five equal-count bins of kept club-theme combinations, sorted by Qloo z. Each bin shows n, z range, mean z and mean centred lift. A per-combination scatter would expose MLB-derived lift values, so it is not published.
- **Per-theme accuracy:** Qloo's accuracy on the centred outcome over the pairs that contain that theme. Each pair counts toward both of its themes. It is descriptive only, with no interval.
- **One definition of "theme mean lift".** The Spearman correlation between national popularity and the nine theme mean lifts (A3 b) uses the same theme mean as the centring constant: the mean club-theme lift over every club that ran the theme.
- **Club names are checked before analysis.** If any club in the score tables isn't in the 120-club list (`clubs-2025.json`), the analysis stops. It also stops if any club in the theme nights is missing from both score tables. It prints the number of clubs scored per table. A typo can no longer pass as a missing score.
