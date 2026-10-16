# Homestand

A season-planning agent for Minor League Baseball promotions directors: theme nights scored against what the ballpark's own market loves.

Work in progress. Built for the Qloo hackathon.

License: MIT

## Run it locally

```
npm install
npm run worker:dev        # Worker with synthetic Qloo answers and template text (no login, no network)
VITE_API_BASE=http://127.0.0.1:8788 npm run dev
npm test && npm run typecheck && npm run lint && npm run build
npm run e2e               # Playwright against the local Worker and a built front end
```

Local runs show a "Synthetic demo data" banner: the scores are made up. Deploys go through the Ramen deploy wrapper only.

## How a theme is scored

1. Qloo returns an affinity for each entity in a theme's bundle near the ballpark (POINT + 80 km, Amendment 4's request shape). The bundle score is the mean; if any entity has no reading the theme is "Not scored" for that market.
2. z compares that score with 40 reference ballpark markets (per-theme mean and SD, `src/app/data/reference-stats.json`).
3. Some markets sit lower or higher on almost every entity, so plain z would measure the market's overall level. Each theme's **index** is its z minus the market's own mean z over all scored library themes. Index of +0.5 or more is "Leans in", -0.5 or less is "Leans away", else "About average". This is the same within-market comparison The Study uses.
4. Code does all of this and the swap ranking. The model only words the explanations, and any number it writes must appear in the computed facts.

Scores describe local taste. The Study found no detectable link to attendance at this sample size, so Homestand is a reasoned, cited audit of local taste, not an attendance predictor.
