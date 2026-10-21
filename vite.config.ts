import { execFileSync } from "node:child_process";
import { defineConfig } from "vitest/config";

// Vitest and Vite both start here, so the Worker's reference data (real or synthetic) is always in place first.
execFileSync(process.execPath, ["scripts/prepare-data.mjs"], { stdio: "inherit" });

export default defineConfig({
  server: { hmr: false, host: "127.0.0.1" },
  build: { modulePreload: { polyfill: false } },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/gpu/**", "node_modules/**"],
    testTimeout: 30_000,
  },
});
