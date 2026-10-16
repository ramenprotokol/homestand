// Live run: the same real-data checks as e2e:real, against the deployed site and Worker (no local servers).
// Uses a few live Qloo and Workers AI requests (sample markets are cached). Run: npm run e2e:live
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e-real",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/pw-live",
  use: { baseURL: process.env.LIVE_URL ?? "https://homestand-6az.pages.dev" },
  projects: [
    { name: "live-desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "live-mobile-375", use: { viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
});
