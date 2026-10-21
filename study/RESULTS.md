# Results

**Verdict: CALL STANDS (shown on the site as NOT PROVEN).** In this sample, Qloo's local-taste score did not call which theme night drew better at the same ballpark any more often than a coin flip would. This is "not detected at this sample size", not "disproved".

Everything below follows `study/PREREGISTRATION.md` (Amendments 1 to 5). The scores were frozen first (`study/PULL_RECORD.md`, commit `6f82c29`, `scores.json` SHA-256 `6154a76e…f535`). The analysis was then run once, with seed 20261030 and 10,000 club-bootstrap draws. Aggregates are in `study/results.json`.

## The main test (H1, the only confirmatory one)

For each ballpark that ran two or more different theme nights, take every pair of themes and ask: did the theme Qloo scored higher for that town draw the bigger crowd (after adjusting for the club's normal crowd and each theme's overall pull)?

- **Qloo got 49.1% of 521 pairs right** (95% interval 43.2% to 54.9%), across 89 clubs.
- To pass, it needed at least 55% with the interval's low end above 50%. It did not. The interval includes 50%, and its top end sits just under the 55% bar.
- It also missed the "wrong way" verdict (the interval's top would have had to be below 50%). So the answer is "not enough evidence either way".

The power check in Amendment 1 said a true accuracy near 58% would be caught about 80% of the time. So a real but small effect, a few points above 50%, could still hide in this sample.

## The comparisons (secondary)

- **LLM guess alone:** 50.6% (49.2% to 52.0%). Qloo minus the LLM was -1.4 points (-7.1 to +4.1), so Qloo does not beat it, and neither did better than chance. The two differ in what they can do at all: the LLM could not tell towns apart. It answered "8" for nearly every town. For five of the nine themes (Star Wars, Princess, Bluey, Margaritaville, Marvel) it gave the same answer at every club it rated (120 clubs, or 114 for Bluey), so those themes scored as ties and its 50.6% is mostly ties. Qloo gave 98 to 101 different readings per theme across the same 120 clubs (`perTheme.qlooDistinct` and `llmDistinct` in `study/results.json`). Telling towns apart is not predicting crowds, and this study found no crowd prediction from either.
- **Raw lift, not adjusted for each theme's overall pull** (descriptive): Qloo 51.2%, LLM 52.3%, national popularity 49.1%. The popularity figure rests on about nine themes, so treat it as nine data points.
- **Pooled association (H3):** the effect of one standard deviation of Qloo's score on a night's lift was +0.009 in log attendance (about 0.9%), interval -0.019 to +0.039, partial correlation 0.03 (-0.07 to 0.14). For the LLM, +0.004 (-0.028 to +0.059). Neither is distinguishable from zero.
- **National popularity** (context only, no theme adjustment): the pooled coefficient is negative and its interval excludes zero (partial r -0.25). With only nine distinct popularity values, mostly near 1.0, this says little about local taste. I have not investigated why it is negative. The Spearman correlation between popularity and the nine theme mean lifts is 0.18.

## Robustness

- **Each club counted equally (R1):** 47.7% (40.9% to 54.5%).
- **Controlling for how many other promos a night carried (R2):** 49.3% (43.7% to 54.8%), same verdict.

## What the data look like (descriptive, nothing tested)

- **Five equal bins by Qloo score**, mean theme-adjusted lift: -0.017, -0.026, +0.025, +0.005, +0.011 (about 69 club-themes each). The two lowest-scoring bins sit below the three highest, but the pattern is not steady and was not tested.
- **Per theme, Qloo accuracy:** Star Wars 51.8%, Princess 53.8%, Margaritaville 52.0%, Wrestling 50.9%, Bluey 48.3%, Country 47.7%, Harry Potter 45.3%, Marvel 43.2%, Dinosaur 42.4%. These are small samples (Marvel has 13 nights) and each pair counts toward both its themes, so they are not independent. None of this is evidence for or against a theme.

## Sample and missing data

- 378 of the 385 study nights were scored, in 344 club-theme combinations. Six combinations (7 nights) were dropped for a missing score: 2 Princess combinations where Qloo returned nothing for *Moana* (Qloo was missing at 3 clubs, 2 of which ran a Princess night), and 4 Bluey combinations where the LLM's reply was not a bare integer even after one retry (6 clubs, 4 of which ran Bluey). A combination missing either score is dropped for all predictors.
- Qloo made 600 requests with no retries or errors. The LLM made 1,080 requests, about 3,200 neurons in total.

## Limits

- **Ceiling compression.** Qloo affinity for very popular entities sits near 1. Across clubs, the Country bundle's SD is 0.001 and Star Wars 0.004. Small differences like that may be mostly noise, which weakens the test, Country especially.
- **Thin bundles.** Five themes (Bluey, Harry Potter, Margaritaville, Marvel, Wrestling) are scored by a single Qloo entity. Day-1 dropped five entities that Qloo returned no local data for, which left Harry Potter with only the book and Marvel with only *No Way Home*.
- **Proxies.** Harry Potter is the first book standing in for the series. Princess is a proxy for the children's dress-up audience, and many matched nights are "Pirates & Princesses" style events.
- **Promo stacking.** Theme nights carry more other promotions than ordinary nights. R2 checks this only crudely; jersey auctions, appearances and drink specials are not controlled.
- **One season, one set of theme rules, one 80 km radius.** The radius and request shape were fixed on Day 1 from Qloo coverage alone, not from outcomes.
- **Scores for nearby ballparks often coincide.** The 120 clubs sit at 119 distinct coordinates (two Jupiter, FL clubs share one ballpark) but have 98 to 101 distinct Qloo values per theme. Checked on 2026-10-20 from the local scores and club coordinates: the repeats are whole readings, not rounding. Nineteen clubs have exactly the same values, to full precision, on all nine themes as another club, in 15 groups (for example Tampa, Clearwater and Bradenton; Durham and Greensboro; Allentown, Reading and Wilmington; Akron and Eastlake). That is why the count is 101 sets of readings for 120 clubs. It is not a plain distance rule: the matching clubs are 0 to 134 km apart, while some much closer clubs differ (Clearwater and Dunedin, 6 km apart, got different readings; Birmingham and Montgomery, 134 km apart, got the same). So it is not rounding and not simple nearness. The likeliest cause is that Qloo maps a query point to a nearby local area and returns that area's reading, but we did not confirm how Qloo does it. The practical effect is that there are about 101 independent local readings, not 120.
- **The analysis ran with an uncommitted `package.json` edit** (the `study:analyze` script line), so the printed commit reads `68c12e0…-dirty`. No analysis code changed after the freeze.
- **The Workers AI response labelled its model `…llama-3.3-70b-instruct-sd`** in the one call I inspected, although the request named `…-fp8-fast`.

## What it means for the product

H1 did not pass, so per the pre-registration the claim becomes a reasoned, cited audit, and the app says so plainly. These results do not show that local taste does not matter, only that Qloo's score, as used here, did not detect it at this sample size.

## A note on commit ids

On 2026-10-15, before this repository was first published, its git history was rewritten once to turn a local absolute file path in two files into a relative one. Commit dates, order and all other content are unchanged, and so is the SHA-256 of `scores.json`. The freeze commit's id changed from `68c12e0` to `6f82c29` (the "-dirty" line above shows the old id, as printed at the time).
