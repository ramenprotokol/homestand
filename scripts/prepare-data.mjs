/* global URL, process, console */
// Picks the reference data the Worker bundles: the real files (gitignored, Qloo-derived, present only on a machine that pulled them with its own
// key) or, when they are absent, the committed made-up synthetic files. Writes src/worker/data/*.active.json (gitignored).
// Runs before every test, build and `wrangler deploy` / `wrangler dev` (see package.json and wrangler.toml). No network, no secrets.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const data = new URL("../src/app/data/", import.meta.url);
const out = new URL("../src/worker/data/", import.meta.url);
mkdirSync(out, { recursive: true });
const picks = [];
for (const name of ["reference-stats", "acts-reference", "discovery-reference"]) {
  const real = new URL(`${name}.json`, data);
  const useReal = existsSync(real) && process.env.HOMESTAND_SYNTHETIC_DATA !== "1";
  copyFileSync(useReal ? real : new URL(`${name}.synthetic.json`, data), new URL(`${name}.active.json`, out));
  picks.push(`${name}: ${useReal ? "real" : "synthetic"}`);
}
console.log(`prepare-data: ${picks.join(", ")}`);
