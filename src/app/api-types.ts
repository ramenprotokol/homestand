import type { Resolution } from "./calendar/resolve";
import type { Kind } from "./kind";
import type { Discovered, Proposal, SponsorAngle } from "./propose/propose";
import type { FitLabel } from "./score";
import type { TraceStep } from "./trace";

export interface MarketIn {
  label: string;
  lon: number;
  lat: number;
  /** Signature from /api/geocode. Sample clubs need none. */
  sig?: string;
}

export interface EntityOut {
  name: string;
  type: string;
  affinity: number | null;
}

export interface ThemeScoreOut {
  themeId: string;
  label: FitLabel;
  /** z against the reference ballpark markets. */
  z: number | null;
  /** z minus this market's own mean z over every scored theme: what stands out inside the market. The label uses this. */
  index: number | null;
  /** This market's mean z over the scored themes (its overall level against other markets), and how many themes that is. */
  marketMeanZ: number | null;
  scoredThemes: number;
  score: number | null;
  reason?: string;
  entities: EntityOut[];
  /** When Qloo was asked. */
  fetchedAt: string;
  /** "live" = fetched during this request, "cache" = recorded earlier, "synthetic" = made-up local test data. */
  source: "live" | "cache" | "synthetic";
  ref: { n: number; mean: number; sd: number } | null;
}

export interface Caps {
  /** Live Qloo calls left today. */
  qlooRemaining: number;
  qlooCap: number;
  /** True when Re-check is switched off for today. */
  recheckDisabled: boolean;
  aiRemaining: number;
}

export interface ReferenceInfo {
  markets: number;
  synthetic: boolean;
  pulledAt: string | null;
}

export interface NightOut {
  index: number;
  line: number;
  date: string;
  weekday: string;
  theme: string;
  sponsor: string;
  locked: boolean;
  notes: string;
  resolution: Resolution;
  /** Candidate theme ids when the director has to choose. */
  candidates: string[];
  themeId: string | null;
  label: FitLabel;
  /** The theme's index (see ThemeScoreOut). */
  z: number | null;
  /** Set when the name is a library theme we recognise but have no live Qloo scores for. The night is left alone. */
  recognisedAs: string | null;
  /** Set when the name is a family-title pool entry: scored from that title's own reading near the ballpark. It is never swapped. */
  pool?: { entityId: string; name: string; type: "movie" | "tv_show"; z: number | null; zRaw: number | null; affinity: number | null };
}

export interface AnalyzeResponse {
  market: MarketIn;
  /** Present only for a venue run; a club run has no such field. */
  kind?: Kind;
  mode: "live" | "synthetic";
  /** Date the scores were recorded when they came from the cache. */
  recordedOn: string | null;
  /** When this market's scores were pulled from Qloo (full timestamp). One source for the banner, the step log, the card back and the memo. */
  recordedAt: string | null;
  themes: Record<string, ThemeScoreOut>;
  nights: NightOut[];
  reference: ReferenceInfo;
  caps: Caps;
  trace: TraceStep[];
}

export interface ProposeNightIn {
  index: number;
  date: string;
  themeId: string | null;
  sponsor: string;
  locked: boolean;
  notes: string;
}

/** Qloo's local family ranking for a market: only name, id, type and affinity are kept. */
export interface DiscoveryOut {
  /** Server side only (stripped from the response): every scored pool title, for scoring a night named after one. */
  all?: Discovered[];
  movies: Discovered[];
  shows: Discovered[];
  /** How many of the pool's titles Qloo had a local reading for here, and how big the pool is. */
  scored: number;
  poolSize: number;
  source: "live" | "cache" | "synthetic";
  fetchedAt: string;
}

/** Qloo's local ranking of the touring-act pool for a venue market. Only name, id, genre and a z are kept. */
export interface ActsOut {
  acts: Discovered[];
  /** How many pool acts Qloo had a local reading for here, and how big the pool is. */
  scored: number;
  poolSize: number;
  source: "live" | "cache" | "synthetic";
  fetchedAt: string;
}

export interface ProposeResponse {
  proposals: Array<Proposal & { whySource: "model" | "template" }>;
  /** Null when discovery was unavailable (cap reached or Qloo trouble); swaps then use library themes only. Always null for a venue run. */
  discovery: DiscoveryOut | null;
  /** Venue runs only: the acts that stand out near the venue. Null when unavailable; absent for a club run. */
  acts?: ActsOut | null;
  angles: SponsorAngle[];
  unfixed: Array<{ index: number; date: string; reason: string; counts?: { strong: number; used: number; wrong: number } }>;
  trace: TraceStep[];
  caps: Caps;
}

export interface RecheckResponse {
  theme: ThemeScoreOut;
  /** Every theme again: re-reading one moves the market's own average, so every index can shift. */
  themes: Record<string, ThemeScoreOut>;
  trace: TraceStep[];
  caps: Caps;
  /** True when this theme was already re-checked live in the last 24 hours and the saved answer came back. */
  withinDay?: boolean;
}

/** The city search answer. `message` is a plain-words note for the director: a place outside the US and Canada, a territory, no match in the state they typed. */
export interface GeoResponse {
  results: GeoHit[];
  message?: string;
}

export interface GeoHit {
  label: string;
  lon: number;
  lat: number;
  /** HMAC the search endpoint issued for this place; the API only accepts searched places and the sample clubs. */
  sig: string;
}

export interface ApiError {
  error: string;
  message: string;
}
