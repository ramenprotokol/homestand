import type { AnalyzeResponse, ApiError, GeoResponse, MarketIn, ProposeNightIn, ProposeResponse, RecheckResponse } from "../app/api-types";
import type { CalendarRow } from "../app/calendar/csv";
import type { Kind, Sport } from "../app/kind";

const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export class ApiFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** How long a request may take before we stop waiting. Check can score a whole new town, so it gets a long wait; a city search does not. */
export const TIMEOUT_MS = 45_000;
export const GEOCODE_TIMEOUT_MS = 15_000;
const TIMEOUT_TEXT = "This is taking much longer than it should, so we stopped waiting. Nothing you typed is lost. Try again in a moment.";

async function call<T>(path: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<T> {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { ...init, signal: ctl.signal });
    } catch {
      if (timedOut) throw new ApiFailure("timeout", TIMEOUT_TEXT);
      throw new ApiFailure("network", "Could not reach the Homestand server. Check your connection and try again.");
    }
    // The body can stall after the headers arrive; the same timer covers it.
    let body: T | ApiError | null;
    try {
      body = (await res.json()) as T | ApiError | null;
    } catch {
      if (timedOut) throw new ApiFailure("timeout", TIMEOUT_TEXT);
      body = null;
    }
    if (!res.ok) {
      const e = body as ApiError | null;
      throw new ApiFailure(e?.error ?? "error", e?.message ?? "Something went wrong. Try again.");
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

const post = <T>(path: string, body: unknown): Promise<T> => call<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** A club run sends no `kind`, exactly as before venue mode; only a venue run says so. Likewise only a sport other than baseball is sent, so a baseball request is byte for byte what it always was. */
const runFields = (kind: Kind, sport: Sport): { kind?: Kind; sport?: Sport } => (kind === "venue" ? { kind } : sport !== "baseball" ? { sport } : {});

export const api = {
  analyze: (market: MarketIn, rows: CalendarRow[], kind: Kind = "club", sport: Sport = "baseball") => post<AnalyzeResponse>("/api/analyze", { market, rows, ...runFields(kind, sport) }),
  propose: (market: MarketIn, nights: ProposeNightIn[], allowDuplicates: boolean, kind: Kind = "club", sport: Sport = "baseball") => post<ProposeResponse>("/api/propose", { market, nights, allowDuplicates, ...runFields(kind, sport) }),
  recheck: (market: MarketIn, themeId: string, kind: Kind = "club", sport: Sport = "baseball") => post<RecheckResponse>("/api/recheck", { market, themeId, ...runFields(kind, sport) }),
  geocode: (q: string) => call<GeoResponse>(`/api/geocode?q=${encodeURIComponent(q)}`, undefined, GEOCODE_TIMEOUT_MS),
};
