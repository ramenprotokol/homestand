# Pull record (the freeze)

Written after the full pull and before the analysis, as Amendment 5 requires. No outcome data (attendance, lift, theme nights) was read before this commit.

- **Scores pulled at:** 2026-10-16T00:29:41.652Z (the Qloo pull ran 00:24 to 00:27 UTC and the LLM pull 00:24 to 00:29 UTC, i.e. the evening of 2026-10-15 local time)
- **SHA-256 of `data/derived/scores.json`:** `6154a76e240ba6e4a8a5815566252874b7aa789bbb2c4d616c998cce7646f535`
- `scores.json` itself is gitignored. It is validated with `parseScores`, and its club keys equal the 120 clubs in `clubs-2025.json` in both tables.

## Qloo (Amendment 4 request shape)

- **Requests:** 600 (120 clubs x 5 types), one batched call per club per type. All saved to `data/raw/qloo-pull/` (gitignored).
- **Retries:** 0 x 429, 0 x 5xx, 0 network errors. No quota error.
- **Missing club-theme scores (fixed-bundle rule):** 3, all Princess. *Moana* returned no affinity at 3 clubs, so those clubs' Princess score is missing. Every other theme: 0 missing. 1,077 of 1,080 scored.
- **Across-club spread of the Qloo bundle score** (raw, before z-scoring): every theme has 100 to 101 distinct values over 120 clubs. The 120 clubs sit at 119 distinct coordinates (A2), so the further ties come from Qloo returning identical values to nearby ballparks. I have not investigated why. Ranges: Star Wars 0.977 to 0.999, Princess 0.843 to 0.982, Bluey 0.909 to 0.991, Harry Potter 0.825 to 0.987, Margaritaville 0.959 to 0.999, Dinosaur 0.893 to 0.980, Country 0.994 to 1.000, Marvel 0.880 to 0.998, Wrestling 0.963 to 0.999.

## National popularity (A1, Amendment 5 rule)

Popularity was **constant across clubs for every kept entity** (min = max at every club that returned a value), so the common value is used and no median was needed. The values equal the Day-1 values in Amendment 4.

| Star Wars | Princess | Bluey | Harry Potter | Margaritaville | Dinosaur | Country | Marvel | Wrestling |
|---|---|---|---|---|---|---|---|---|
| 0.99892 | 0.99694 | 0.91962 | 0.99925 | 0.98888 | 0.99771 | 0.98158 | 0.99910 | 0.99941 |

## LLM baseline (Amendment 5 parsing)

- **Model:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` through the Cloudflare Workers AI REST API, temperature 0, the prompt only and no system message. The API's response labelled its model `@cf/meta/llama-3.3-70b-instruct-sd` in the one smoke call that was inspected. Run on 2026-10-15 (evening, local) = 2026-10-16 UTC.
- **Requests:** 1,080 club-theme requests, all saved to `data/raw/llm-pull/` (gitignored). Plus 6 identical retries after non-integer first replies, plus 1 unrelated smoke call ("Reply with the single integer 7") before the pull, which is not part of the data. 1,087 HTTP calls in all.
- **HTTP retries:** 0. No quota error.
- **Cost:** about 2.7 neurons per call, about 3,210 neurons in total (free allowance 10,000 per day). The full 1,080 completed in one day.
- **Non-integer first replies:** 6, all for Bluey. The model answered in a sentence ending in a number instead of a bare integer. Each was retried once with the identical request. All 6 were non-integer again, so all 6 are **missing**: Bluey 6 missing (114 of 120 scored). Every other theme: 0 missing. 1,074 of 1,080 scored.
- **The LLM scores barely vary.** Distinct values over the 120 clubs: Star Wars 1 (all 8), Princess 1 (all 8), Bluey 1 (all 8), Harry Potter 4, Margaritaville 1 (all 8), Dinosaur 2, Country 4, Marvel 1 (all 8), Wrestling 2. Under Amendment 2, a theme with no variation makes no call, so its pairs score 0.5. This is stated before the analysis and changes nothing.
