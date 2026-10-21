// Local end-to-end: the real Worker (wrangler dev --local --env check: synthetic Qloo, template text, no network)
// and the built front end. Run: npm run e2e
import { defineConfig } from "@playwright/test";

// The ports can be moved (E2E_API_PORT, E2E_WEB_PORT) so two checkouts can run the suite side by side.
const API = process.env.E2E_API_PORT ?? "8788";
const WEB = process.env.E2E_WEB_PORT ?? "5173";
const PROXY = process.env.E2E_PROXY_PORT ?? "5199";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "test-results/pw",
  use: { baseURL: `http://127.0.0.1:${WEB}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
  webServer: [
    {
      command: `node scripts/prepare-data.mjs && rm -rf .wrangler/e2e-${API} && npx wrangler dev --local --env check --var RATE_LIMIT_SCALE:10 --var ALLOWED_ORIGINS:http://127.0.0.1:${WEB},http://localhost:${WEB},http://127.0.0.1:${PROXY} --ip 127.0.0.1 --port ${API} --persist-to .wrangler/e2e-${API}`,
      url: `http://127.0.0.1:${API}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${WEB} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB}/`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { VITE_API_BASE: `http://127.0.0.1:${API}`, VITE_STUDY_FIXTURE: "1" },
    },
  ],
});
