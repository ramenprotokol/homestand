# Data rights

## MLB schedule data

The Study uses 2025 Minor League schedules, promotions and attendance from the public MLB Stats API (`statsapi.mlb.com`). Every response carries MLB Advanced Media's notice. The notice in full: "Only individual, non-commercial, non-bulk use of the Materials is permitted and any other use of the Materials is prohibited without prior written authorization from MLBAM."

How this project respects it:
- **Fetched locally only.** `npm run study:fetch` downloads the four season schedules, one request per level and four requests in total, to `data/raw/` on the machine running the study. The local copies are deleted after the study is published.
- **Never in this repository.** The raw data, and anything derived per game such as attendance, dates and promotions, stays in `data/raw/` and `data/derived/`, which are gitignored. It is never committed, served or redistributed.
- **What is published:** the code that fetches and analyses the data, and aggregate results such as accuracies, intervals and per-theme summaries.
- **The live app never calls MLB.** A club uploads its own calendar. The sample calendars in the demo are written by us, with fictional sponsors.

## Qloo data

Qloo results come from the hackathon API with an event key. The key is used only server-side, and the API is used only for the hackathon.

- Responses are cached on the server so the demo stays within the event's limits.
- They are shown only inside the app, with Qloo attribution, as the evidence behind each recommendation. They are never exported.
- They are not published as a dataset. The Study publishes only aggregate results.

## Questions

If a rights holder wants anything changed or removed, open an issue on the repository.
