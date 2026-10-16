import type { Resolution } from "./calendar/resolve";
import type { Proposal, SponsorAngle } from "./propose/propose";
import type { FitLabel } from "./score";
import type { TraceStep } from "./trace";

export interface MarketIn {
  label: string;
  lon: number;
  lat: number;
}

export interface EntityOut {
  name: string;
  type: string;
  affinity: number | null;
}

export interface ThemeScoreOut {
  themeId: string;
  label: FitLabel;
  z: number | null;
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
  z: number | null;
}

export interface AnalyzeResponse {
  market: MarketIn;
  mode: "live" | "synthetic";
  /** Date the scores were recorded when they came from the cache. */
  recordedOn: string | null;
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

export interface ProposeResponse {
  proposals: Array<Proposal & { whySource: "model" | "template" }>;
  angles: SponsorAngle[];
  unfixed: Array<{ index: number; date: string; reason: string }>;
  trace: TraceStep[];
  caps: Caps;
}

export interface RecheckResponse {
  theme: ThemeScoreOut;
  trace: TraceStep[];
  caps: Caps;
}

export interface MemoSwapFacts {
  date: string;
  fromThemeId: string;
  toThemeId: string;
  fromZ: number | null;
  toZ: number | null;
  fromScore: number | null;
  toScore: number | null;
}

export interface MemoResponse {
  summary: string;
  summarySource: "model" | "template";
  swaps: MemoSwapFacts[];
  recordedOn: string | null;
  trace: TraceStep[];
}

export interface GeoHit {
  label: string;
  lon: number;
  lat: number;
}

export interface ApiError {
  error: string;
  message: string;
}
