import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "dist-e2e/**", "dist-real/**", ".wrangler/**", "node_modules/**", "data/**", "test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
