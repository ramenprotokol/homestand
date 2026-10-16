// The kept bundles and the LLM prompt wording, fixed by study/PREREGISTRATION.md Amendment 4 (and A6).
// Single source of truth for the full pull. Pure: no I/O.
import type { AffinityRow, QlooType } from "../qloo/client";
import { STUDY_THEMES, type StudyThemeId } from "./themes";

export interface KeptEntity {
  name: string;
  type: QlooType;
  id: string;
}

export const KEPT_BUNDLES: Readonly<Record<StudyThemeId, readonly KeptEntity[]>> = {
  "star-wars": [
    { name: "Star Wars: Episode IV - A New Hope", type: "movie", id: "1EC3A1AE-9466-4338-BAF6-E20659697569" },
    { name: "The Mandalorian", type: "tv_show", id: "24FA08F2-0B47-4A01-B44E-CF18C06E5781" },
  ],
  princess: [
    { name: "Frozen", type: "movie", id: "3CE60F10-EA7D-4743-B67A-8B53D84351C5" },
    { name: "Moana", type: "movie", id: "B4783599-F934-4159-8003-720406FC1C80" },
  ],
  bluey: [{ name: "Bluey", type: "tv_show", id: "F6013EAC-8F32-4080-B1ED-2BFABB9C706E" }],
  "harry-potter": [{ name: "Harry Potter and the Sorcerer's Stone (Harry Potter, #1)", type: "book", id: "0C97E7FE-8A86-4B48-9F54-CB0A73CC2B96" }],
  margaritaville: [{ name: "Jimmy Buffett", type: "artist", id: "33B34573-DBF2-49C8-BCEB-CBECF31038F0" }],
  dinosaur: [
    { name: "Jurassic Park", type: "movie", id: "D3529AD8-9349-481E-8FCB-D107EFB75E68" },
    { name: "Jurassic World", type: "movie", id: "8573DA59-4BA6-406A-A022-1BEE0E09B678" },
  ],
  country: [
    { name: "Luke Combs", type: "artist", id: "3CBD78B1-D2F2-4551-A342-4621B6BDB5E2" },
    { name: "Morgan Wallen", type: "artist", id: "59DCDFA8-5082-47D9-B3E5-2B49CF2A778F" },
    { name: "Carrie Underwood", type: "artist", id: "19AC0383-5BB2-4423-8598-709713C22148" },
  ],
  marvel: [{ name: "Spider-Man: No Way Home", type: "movie", id: "CB376BE9-384A-41C5-9231-3592AF84ADCD" }],
  wrestling: [{ name: "WWE", type: "brand", id: "764E1D34-B48B-4757-94F2-063B9F912C03" }],
};

export const QLOO_TYPES: readonly QlooType[] = ["movie", "tv_show", "book", "artist", "brand"];
/** Amendment 4: 80 km radius; the release-year floor goes on movie calls only. */
export const QLOO_RADIUS_M = 80_000;
export const MOVIE_RELEASE_YEAR_MIN = 1900;

/** The kept entity IDs of one type, in bundle order (themes in STUDY_THEMES order). One batched call per club per type. */
export function keptIdsOfType(type: QlooType): string[] {
  return STUDY_THEMES.flatMap((t) => KEPT_BUNDLES[t.id].filter((e) => e.type === type).map((e) => e.id));
}

export const THEME_IDS: readonly StudyThemeId[] = STUDY_THEMES.map((t) => t.id);

/** Filesystem-safe lower-case slug, e.g. "Aberdeen IronBirds" -> "aberdeen-ironbirds". */
export function slug(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface EntityReading {
  affinity: number | null;
  popularity: number | null;
}

/**
 * The fixed-bundle rule (Amendment 4): the club-theme Qloo score is the mean affinity of ALL the theme's kept
 * entities; if any one has no numeric affinity at that club the score is missing (null).
 */
export function bundleAffinity(theme: StudyThemeId, readings: ReadonlyMap<string, EntityReading>): number | null {
  const values = KEPT_BUNDLES[theme].map((e) => readings.get(e.id)?.affinity ?? null);
  if (values.some((v) => v === null)) return null;
  return (values as number[]).reduce((s, v) => s + v, 0) / values.length;
}

/** Readings for a club, from its per-type raw bodies' parsed rows. */
export function readingsFromRows(rows: readonly AffinityRow[]): Map<string, EntityReading> {
  return new Map(rows.map((r) => [r.entityId, { affinity: r.affinity, popularity: r.popularity }]));
}

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface PopularityResult {
  /** One number per theme: mean over the theme's kept entities of that entity's popularity. */
  perTheme: Record<StudyThemeId, number>;
  /** Per entity ID: min, max, and the value used (the common value if constant, else the median across clubs). */
  perEntity: Record<string, { min: number; max: number; used: number; constant: boolean; clubs: number }>;
}

/**
 * National popularity (Amendment 1, A1): the mean of the kept entities' popularity values at the pull. Per entity, the
 * value is the common value if it is the same at every club, else the median across clubs (the range is reported).
 */
export function nationalPopularityFromReadings(byClub: readonly ReadonlyMap<string, EntityReading>[]): PopularityResult {
  const perEntity: PopularityResult["perEntity"] = {};
  const perTheme = {} as Record<StudyThemeId, number>;
  for (const theme of THEME_IDS) {
    const used: number[] = [];
    for (const e of KEPT_BUNDLES[theme]) {
      const vals = byClub.map((m) => m.get(e.id)?.popularity).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (vals.length === 0) throw new Error(`no popularity value for ${e.name} at any club`);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const u = min === max ? min : median(vals);
      perEntity[e.id] = { min, max, used: u, constant: min === max, clubs: vals.length };
      used.push(u);
    }
    perTheme[theme] = used.reduce((s, v) => s + v, 0) / used.length;
  }
  return { perTheme, perEntity };
}

// ---------- LLM baseline (A6 + Amendment 4) ----------

export const LLM_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export const LLM_THEME_TEXT: Readonly<Record<StudyThemeId, { label: string; examples: string }>> = {
  "star-wars": { label: "Star Wars", examples: "Star Wars (1977), The Mandalorian" },
  princess: { label: "Princess", examples: "Frozen, Moana" },
  bluey: { label: "Bluey", examples: "Bluey" },
  "harry-potter": { label: "Harry Potter", examples: "the Harry Potter books" },
  margaritaville: { label: "Margaritaville", examples: "Jimmy Buffett" },
  dinosaur: { label: "Dinosaur", examples: "Jurassic Park, Jurassic World" },
  country: { label: "country music", examples: "Luke Combs, Morgan Wallen, Carrie Underwood" },
  marvel: { label: "Marvel", examples: "Spider-Man: No Way Home" },
  wrestling: { label: "pro wrestling", examples: "WWE" },
};

export function llmPrompt(city: string, state: string, theme: StudyThemeId): string {
  const t = LLM_THEME_TEXT[theme];
  return `On a scale of 1 to 10, how much does the local market around ${city}, ${state} over-index on ${t.label} (for example ${t.examples}) compared with the average US Minor League Baseball market? Reply with a single integer.`;
}

/** Amendment 5: an integer only if, after trimming whitespace and one optional trailing period, the reply is exactly a whole number 1-10. */
export function parseLlmInteger(reply: unknown): number | null {
  if (typeof reply === "number") return Number.isInteger(reply) && reply >= 1 && reply <= 10 ? reply : null;
  if (typeof reply !== "string") return null;
  const m = /^(\d+)\.?$/.exec(reply.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 10 && /^(10|[1-9])$/.test(m[1]!) ? n : null;
}

/** The assistant's text from a Workers AI REST result (OpenAI-style choices, or the legacy `response` field). */
export function llmReplyText(result: unknown): unknown {
  const r = result as { choices?: { message?: { content?: unknown } }[]; response?: unknown } | null;
  const content = r?.choices?.[0]?.message?.content;
  return content !== undefined && content !== null ? content : r?.response;
}
