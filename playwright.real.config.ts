// Real-data run: the local Worker talks to the live Qloo API (QLOO_MODE overridden to live; key from .dev.vars) and the
// built front end renders the real study results. Cold sample markets cost 5 Qloo requests each, then they are cached
// in .wrangler/real. Run: npm run e2e:real
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e-real",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/pw-real",
  use: { baseURL: "http://127.0.0.1:5174" },
  projects: [
    { name: "real-desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "real-mobile-375", use: { viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
  webServer: [
    {
      command: "npx wrangler dev --local --env check --var QLOO_MODE:live --var ALLOWED_ORIGINS:http://127.0.0.1:5174 --ip 127.0.0.1 --port 8789 --persist-to .wrangler/real",
      url: "http://127.0.0.1:8789/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npx vite build --outDir dist-real && npx vite preview --outDir dist-real --port 5174 --strictPort --host 127.0.0.1",
      url: "http://127.0.0.1:5174/",
      reuseExistingServer: false,
      timeout: 180_000,
      env: { VITE_API_BASE: "http://127.0.0.1:8789" },
    },
  ],
});
