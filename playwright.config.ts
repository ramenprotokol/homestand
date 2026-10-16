// Local end-to-end: the real Worker (wrangler dev --local --env check: synthetic Qloo, template text, no network)
// and the built front end. Run: npm run e2e
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "test-results/pw",
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
  webServer: [
    {
      command: "rm -rf .wrangler/e2e && npx wrangler dev --local --env check --ip 127.0.0.1 --port 8788 --persist-to .wrangler/e2e",
      url: "http://127.0.0.1:8788/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 5173 --strictPort --host 127.0.0.1",
      url: "http://127.0.0.1:5173/",
      reuseExistingServer: false,
      timeout: 180_000,
      env: { VITE_API_BASE: "http://127.0.0.1:8788", VITE_STUDY_FIXTURE: "1" },
    },
  ],
});
