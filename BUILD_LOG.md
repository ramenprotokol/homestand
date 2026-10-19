# Build log

Homestand was built by one developer working with AI coding assistants. This file records who did what.

## Roles

- **The developer:** chose the problem and the hackathon; picked the design direction ("The Magnet") and the guided flow; made the go/no-go calls; owns every decision and every line.
- **Claude Opus 5.5 (Anthropic):** planned the work and reviewed it.
  - Planning: the spec, the study design, and the plans for each build stage.
  - Day-1 investigation: it found Qloo's hidden release-year floor on movie insights, and identified which entities have no local signal.
  - Amendment 4.
  - Review of every stage, including the call to switch the app to a market-centred index.
- **Claude Sonnet 5.5 (Anthropic):** wrote most of the code and tests.
  - The MLB data pipeline, the baseline crowd model and the analysis script.
  - The Qloo client and the Day-1 probe.
  - The full pull and the score freeze, and Amendment 5.
  - The app: the Worker, the agent, the front end and the e2e tests.
- **Claude Fable 5.1 (Anthropic):** independent reviews.
  - The pre-registration review, which produced Amendment 1.
  - The statistics review of the analysis script. It re-implemented the script independently, matched it to 6 decimals, and produced Amendment 3.

## Timeline

| Date (2026) | What happened |
|---|---|
| Oct 3 | Idea chosen; design spec written. |
| Oct 5 | MLB data pipeline built. Pre-registration committed before any Qloo request. Amendments 1–3 followed independent reviews. Analysis script tested on synthetic data. |
| Oct 15 | Qloo key arrived. Day-1 go/no-go settled the request shape (Amendment 4). Full pull of 600 Qloo and 1,080 LLM requests; scores frozen by SHA-256; the analysis ran once (CALL STANDS). App built on real Qloo data. |
| Oct 19 | Venue mode: a made-up Raleigh amphitheatre calendar on the same Check, Fix and Send engine, with 34 artist and tribute themes (32 scored), genre-aware swaps, a touring-act pool (Discovered by Qloo) and support-act ideas from the taste graph. Club runs pinned by a snapshot test. Built with Claude Opus 5.5 (direction) and Claude Sonnet 5.5 (build and QA). |
