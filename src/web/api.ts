import type { AnalyzeResponse, ApiError, GeoHit, MarketIn, ProposeNightIn, ProposeResponse, RecheckResponse } from "../app/api-types";
import type { CalendarRow } from "../app/calendar/csv";
import type { Kind, Sport } from "../app/kind";
import { SAMPLE_MARKETS } from "../app/markets";
import { ui } from "./store";

const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export class ApiFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** What the server returned for a sample's own calendar, saved at deploy time (scripts/make-snapshots.ts) so the samples still open if the server does not answer. */
interface Snapshot {
  v: 1;
  analyze: AnalyzeResponse;
  propose: ProposeResponse;
}

const sampleIdOf = (m: MarketIn): string | null => SAMPLE_MARKETS.find((s) => s.label === m.label && s.lon === m.lon && s.lat === m.lat)?.id ?? null;

async function snapshotOf(m: MarketIn): Promise<Snapshot | null> {
  const id = sampleIdOf(m);
  if (!id) return null;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}snapshots/${id}.json`);
    if (!res.ok) return null;
    const s = (await res.json()) as Partial<Snapshot>;
    return s.v === 1 && s.analyze && s.propose ? (s as Snapshot) : null;
  } catch {
    return null;
  }
}

/** The server did not answer at all, or answered with a server error (not a refusal such as a limit). */
const serverDown = (status: number): boolean => status === 502 || status === 503 || status === 504;

async function call<T>(path: string, init?: RequestInit, saved?: () => Promise<T | null>): Promise<T> {
  let res: Response | null = null;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    res = null;
  }
  if (res === null || serverDown(res.status)) {
    const copy = saved ? await saved() : null;
    if (copy) {
      ui.savedCopy = true;
      return copy;
    }
    if (res === null) throw new ApiFailure("network", "The Homestand server isn't answering right now. Please try again in a minute. If it keeps happening, the sample calendars may still open.");
  }
  const body = (await res!.json().catch(() => null)) as T | ApiError | null;
  if (!res!.ok) {
    const e = body as ApiError | null;
    throw new ApiFailure(e?.error ?? "error", e?.message ?? "Something went wrong. Try again.");
  }
  return body as T;
}

const post = <T>(path: string, body: unknown, saved?: () => Promise<T | null>): Promise<T> => call<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, saved);

/** A club run sends no `kind`, exactly as before venue mode; only a venue run says so. Likewise only a sport other than baseball is sent, so a baseball request is byte for byte what it always was. */
const runFields = (kind: Kind, sport: Sport): { kind?: Kind; sport?: Sport } => (kind === "venue" ? { kind } : sport !== "baseball" ? { sport } : {});

export const api = {
  analyze: async (market: MarketIn, rows: CalendarRow[], kind: Kind = "club", sport: Sport = "baseball") => {
    ui.savedCopy = false;
    return post<AnalyzeResponse>("/api/analyze", { market, rows, ...runFields(kind, sport) }, async () => (await snapshotOf(market))?.analyze ?? null);
  },
  propose: (market: MarketIn, nights: ProposeNightIn[], allowDuplicates: boolean, kind: Kind = "club", sport: Sport = "baseball") => post<ProposeResponse>("/api/propose", { market, nights, allowDuplicates, ...runFields(kind, sport) }, async () => (allowDuplicates ? null : ((await snapshotOf(market))?.propose ?? null))),
  recheck: (market: MarketIn, themeId: string, kind: Kind = "club", sport: Sport = "baseball") => post<RecheckResponse>("/api/recheck", { market, themeId, ...runFields(kind, sport) }),
  geocode: (q: string) => call<{ results: GeoHit[] }>(`/api/geocode?q=${encodeURIComponent(q)}`),
};
