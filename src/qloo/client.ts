export type QlooType = "artist" | "book" | "brand" | "movie" | "tv_show";

export interface SearchHit {
  entityId: string;
  name: string;
  types: string[];
  releaseYear: number | null;
  popularity: number | null;
}

export interface AffinityRow {
  entityId: string;
  name: string;
  affinity: number | null;
  popularity: number | null;
}

export interface AffinityQuery {
  type: QlooType;
  entityIds: string[];
  lon: number;
  lat: number;
  radiusM?: number;
  /** Sent as filter.release_year.min; Qloo hides older films from movie insights unless a floor is given. */
  releaseYearMin?: number;
  /** Sent as `take` when set. The app sends it (= the number of IDs) for batches over 20, so Qloo's default page size never cuts a batch short. */
  take?: number;
  /** Fuzzy locality string (A4 fallback); replaces the POINT when set. */
  locationQuery?: string;
}

export interface DiscoverQuery {
  type: "movie" | "tv_show";
  lon: number;
  lat: number;
  radiusM?: number;
  take: number;
  /** Qloo's age signal, e.g. "24_and_younger". */
  age?: string;
}

export interface DiscoveredRow {
  entityId: string;
  name: string;
  affinity: number | null;
}

/** Always sent with discovery: without it, local results include adult and explicit titles. */
export const FAMILY_TAG = "urn:tag:genre:media:family";
/** Family AND animation: family alone also returns faith films and sitcoms. Sent as an intersection. */
export const KIDS_TAGS = `${FAMILY_TAG},urn:tag:genre:media:animation`;

/** Only these three fields are kept from a discovery response. */
export function discoveredFromBody(raw: unknown, type: DiscoverQuery["type"]): Array<DiscoveredRow & { type: DiscoverQuery["type"] }> {
  const body = raw as { results?: { entities?: Record<string, unknown>[] } };
  return (body.results?.entities ?? []).flatMap((e) => {
    const name = typeof e.name === "string" ? e.name.trim() : "";
    const id = typeof e.entity_id === "string" ? e.entity_id : "";
    if (!name || !id) return [];
    const q = e.query as { affinity?: unknown } | undefined;
    return [{ entityId: id, name, type, affinity: num(q?.affinity) }];
  });
}

export interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Minimum gap between requests, ms. */
  delayMs?: number;
  maxTries?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Called with every parsed response body, for local raw logging. */
  onResponse?: (path: string, params: Record<string, string>, body: unknown) => void;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function yearOf(props: Record<string, unknown> | undefined): number | null {
  const y = num(props?.release_year);
  if (y !== null) return y;
  const m = typeof props?.release_date === "string" ? /^(\d{4})/.exec(props.release_date) : null;
  return m ? Number(m[1]) : null;
}

/** One row per requested ID from a raw /v2/insights body; an ID Qloo does not return gets affinity null. */
export function affinityRowsFromBody(raw: unknown, entityIds: readonly string[]): AffinityRow[] {
  const body = raw as { results?: { entities?: Record<string, unknown>[] } };
  const byId = new Map((body.results?.entities ?? []).map((e) => [String(e.entity_id), e]));
  return entityIds.map((id) => {
    const e = byId.get(id);
    const query = e?.query as { affinity?: unknown } | undefined;
    return { entityId: id, name: e ? String(e.name) : "", affinity: num(query?.affinity), popularity: num(e?.popularity) };
  });
}

export function createQlooClient(opts: ClientOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const delayMs = opts.delayMs ?? 300;
  const maxTries = opts.maxTries ?? 5;
  let requests = 0;
  let last = 0;
  const retries = { http429: 0, http5xx: 0, network: 0 };

  async function get(path: string, params: Record<string, string>): Promise<unknown> {
    // WKT contains spaces and commas: encode with %20, not "+".
    const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const url = `${opts.baseUrl}${path}?${qs}`;
    let lastFailure = "";
    for (let attempt = 0; attempt < maxTries; attempt++) {
      const wait = last + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      requests++;
      let res: Response;
      try {
        res = await doFetch(url, { headers: { "X-Api-Key": opts.apiKey } });
      } catch (e) {
        retries.network++;
        lastFailure = `network error: ${e instanceof Error ? e.message : String(e)}`;
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new Error(`Qloo ${path}: HTTP ${res.status} (auth)`);
      if (res.status === 429) {
        retries.http429++;
        lastFailure = "rate-limited (429)";
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.status >= 500) {
        retries.http5xx++;
        lastFailure = `HTTP ${res.status}`;
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        // The body stays in the server log; it never reaches an error message the app might show.
        console.error("Qloo error body", path, (await res.text()).slice(0, 200));
        throw new Error(`Qloo ${path}: HTTP ${res.status}`);
      }
      const body: unknown = await res.json();
      opts.onResponse?.(path, params, body);
      return body;
    }
    throw new Error(`Qloo ${path}: still failing after ${maxTries} tries (${lastFailure})`);
  }

  async function search(query: string, type: QlooType, take = 5): Promise<SearchHit[]> {
    const body = (await get("/search", { query, types: `urn:entity:${type}`, take: String(take) })) as { results?: Record<string, unknown>[] };
    return (body.results ?? []).map((r) => {
      const props = r.properties as Record<string, unknown> | undefined;
      return {
        entityId: String(r.entity_id),
        name: String(r.name),
        types: Array.isArray(r.types) ? r.types.map(String) : [],
        releaseYear: yearOf(props),
        popularity: num(r.popularity) ?? num(props?.popularity),
      };
    });
  }

  /** One row per requested ID; an ID Qloo does not return gets affinity null. */
  async function localAffinity(q: AffinityQuery): Promise<AffinityRow[]> {
    const params: Record<string, string> = {
      "filter.type": `urn:entity:${q.type}`,
      "filter.results.entities": q.entityIds.join(","),
    };
    if (q.releaseYearMin !== undefined) params["filter.release_year.min"] = String(q.releaseYearMin);
    if (q.take !== undefined) params["take"] = String(q.take);
    if (q.locationQuery !== undefined) params["signal.location.query"] = q.locationQuery;
    else {
      params["signal.location"] = `POINT(${q.lon} ${q.lat})`; // WKT: longitude first
      params["signal.location.radius"] = String(q.radiusM ?? 40000);
    }
    return affinityRowsFromBody(await get("/v2/insights", params), q.entityIds);
  }

  /** The top family-tagged titles of one type near a point, optionally for one age group. Never called without the family tag. */
  async function discoverFamily(q: DiscoverQuery): Promise<Array<DiscoveredRow & { type: DiscoverQuery["type"] }>> {
    const params: Record<string, string> = {
      "filter.type": `urn:entity:${q.type}`,
      "filter.tags": KIDS_TAGS,
      "operator.filter.tags": "intersection",
      "signal.location": `POINT(${q.lon} ${q.lat})`,
      "signal.location.radius": String(q.radiusM ?? 40000),
      take: String(q.take),
    };
    if (q.age) params["signal.demographics.age"] = q.age;
    return discoveredFromBody(await get("/v2/insights", params), q.type);
  }

  return { search, localAffinity, discoverFamily, get requests() { return requests; }, get retries() { return { ...retries }; } };
}

export type QlooClient = ReturnType<typeof createQlooClient>;
