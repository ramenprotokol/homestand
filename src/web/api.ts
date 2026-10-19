import type { AnalyzeResponse, ApiError, GeoHit, MarketIn, ProposeNightIn, ProposeResponse, RecheckResponse } from "../app/api-types";
import type { CalendarRow } from "../app/calendar/csv";

const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export class ApiFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiFailure("network", "Could not reach the Homestand server. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const e = body as ApiError | null;
    throw new ApiFailure(e?.error ?? "error", e?.message ?? "Something went wrong. Try again.");
  }
  return body as T;
}

const post = <T>(path: string, body: unknown): Promise<T> => call<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  analyze: (market: MarketIn, rows: CalendarRow[]) => post<AnalyzeResponse>("/api/analyze", { market, rows }),
  propose: (market: MarketIn, nights: ProposeNightIn[], allowDuplicates: boolean) => post<ProposeResponse>("/api/propose", { market, nights, allowDuplicates }),
  recheck: (market: MarketIn, themeId: string) => post<RecheckResponse>("/api/recheck", { market, themeId }),
  geocode: (q: string) => call<{ results: GeoHit[] }>(`/api/geocode?q=${encodeURIComponent(q)}`),
};
