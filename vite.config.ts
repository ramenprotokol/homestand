import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { hmr: false, host: "127.0.0.1" },
  build: { modulePreload: { polyfill: false } },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/gpu/**", "node_modules/**"],
    testTimeout: 30_000,
  },
});
