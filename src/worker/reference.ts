// The reference data the Worker scores against. Worker-only: the browser bundle never imports this file, so no Qloo-derived number reaches a visitor's browser.
// The three JSON files under ./data are written by scripts/prepare-data.mjs before every build, test and deploy: the real files (src/app/data/*.json, kept
// out of the public repository under Qloo's data terms) when they exist on this machine, otherwise the committed made-up *.synthetic.json files.
import actsFile from "./data/acts-reference.active.json";
import discoveryFile from "./data/discovery-reference.active.json";
import statsFile from "./data/reference-stats.active.json";
import syntheticFile from "../app/data/reference-stats.synthetic.json";
import type { ActsReference } from "../app/acts";
import type { DiscoveryReference } from "../app/discovery";
import type { ReferenceStats } from "../app/score";

export const REFERENCE: ReferenceStats = statsFile as ReferenceStats;
/** Made-up aggregates for the offline synthetic mode (local runs and tests only). */
export const SYNTHETIC_REFERENCE: ReferenceStats = syntheticFile as ReferenceStats;
export const ACTS_REFERENCE: ActsReference = actsFile as ActsReference;
export const DISCOVERY_REFERENCE: DiscoveryReference = discoveryFile as DiscoveryReference;
