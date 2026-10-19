# Data rights

## MLB schedule data

The Study uses 2025 Minor League schedules, promotions and attendance from the public MLB Stats API (`statsapi.mlb.com`). Every response carries MLB Advanced Media's notice. The notice in full: "Only individual, non-commercial, non-bulk use of the Materials is permitted and any other use of the Materials is prohibited without prior written authorization from MLBAM."

How this project respects it:
- **Fetched locally only.** `npm run study:fetch` downloads the four season schedules, one request per level and four requests in total, to `data/raw/` on the machine running the study. The local copies are deleted after the study is published.
- **Never in this repository.** The raw data, and anything derived per game such as attendance, dates and promotions, stays in `data/raw/` and `data/derived/`, which are gitignored. It is never committed, served or redistributed.
- **What is published:** the code that fetches and analyses the data, and aggregate results such as accuracies, intervals and per-theme summaries.
- **The live app never calls MLB.** A club uploads its own calendar. The reference-set aggregates were built offline from a locally derived club list (location points only); no club row or name is stored in the repo or the app. The sample calendars in the demo are written by us, with fictional sponsors.

## Qloo data

Qloo results come from the hackathon API with an event key. The key is used only server-side, and the API is used only for the hackathon.

- Responses are cached on the server so the demo stays within the event's limits.
- They are shown only inside the app, with Qloo attribution, as the evidence behind each recommendation (the per-entity numbers sit behind "Show the numbers"). The exported CSV and calendar carry no Qloo values. The one-page memo cites only the derived index (z) and bundle score behind each approved swap, never per-entity values.
- They are not published as a dataset. What is committed: Qloo entity IDs, per-theme aggregates (count, mean, SD) over a 40-market reference set, and a pool of 46 family-friendly animated titles ({id, name, type, national popularity}) with the same kind of aggregates per title (`src/app/data/discovery-reference.json`). Raw pulls for both stay in `data/raw/` (gitignored). The reference set's market names and coordinates are not stored. Test fixtures are synthetic numbers in Qloo's response shape.
- The live Qloo allowance is capped per day in the Worker; past the cap the app serves recorded results with a "recorded on" label.

## Questions

If a rights holder wants anything changed or removed, open an issue on the repository.
