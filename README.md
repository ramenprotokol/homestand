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
