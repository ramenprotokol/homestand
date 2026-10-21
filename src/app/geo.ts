/** City search covers the US and Canada. Labels read the way a director writes them: "Tulsa, OK". */
const US: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};
const CA: Record<string, string> = {
  Alberta: "AB", "British Columbia": "BC", Manitoba: "MB", "New Brunswick": "NB", "Newfoundland and Labrador": "NL", "Nova Scotia": "NS", Ontario: "ON", "Prince Edward Island": "PE", Quebec: "QC", Québec: "QC", Saskatchewan: "SK", "Northwest Territories": "NT", Nunavut: "NU", Yukon: "YT",
};

export const SEARCH_COUNTRIES = ["US", "CA"] as const;

/** Longest city search the API reads. The search box stops typing at the same number. */
export const MAX_CITY = 60;

/** "Tulsa, OK" or "Calgary, AB". Null for a place outside the US and Canada. */
export function placeLabel(name: string, admin1: string | undefined, countryCode: string | undefined): string | null {
  const cc = (countryCode ?? "").toUpperCase();
  if (cc !== "US" && cc !== "CA") return null;
  const abbr = admin1 ? (cc === "US" ? US : CA)[admin1] ?? admin1 : "";
  return abbr ? `${name}, ${abbr}` : `${name}, ${cc}`;
}

// ---------- reading what was typed ----------

/** A US state or Canadian province (or a US territory, which is understood but not covered). */
export interface Region {
  code: string;
  name: string;
  cc: "US" | "CA" | "TERRITORY";
}

/** US territories. The geocoder files them under their own country code, and the app does not cover them (see TERRITORY_MESSAGE). */
const TERRITORIES: Record<string, string> = { "Puerto Rico": "PR", Guam: "GU", "US Virgin Islands": "VI", "Virgin Islands": "VI", "American Samoa": "AS", "Northern Mariana Islands": "MP" };
const TERRITORY_CODES = new Set(Object.values(TERRITORIES));
const TERRITORY_NAMES: Record<string, string> = { PR: "Puerto Rico", GU: "Guam", VI: "the US Virgin Islands", AS: "American Samoa", MP: "the Northern Mariana Islands" };

/** Lower case, no accents, no dots or apostrophes, hyphens and commas as spaces: "St. John's" and "Saint Johns" compare equal after `expand`. */
export function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/[-–,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ABBREVIATIONS: Record<string, string> = { st: "saint", ste: "sainte", ft: "fort", mt: "mount" };
/** norm() with St/Ste/Ft/Mt spelled out, so "St Paul" meets "Saint Paul". */
export const expand = (s: string): string => norm(s).split(" ").map((w) => ABBREVIATIONS[w] ?? w).join(" ");

const REGIONS = new Map<string, Region>();
for (const [name, code] of Object.entries(US)) REGIONS.set(norm(name), { code, name, cc: "US" });
for (const [name, code] of Object.entries(CA)) REGIONS.set(norm(name), { code, name: code === "QC" ? "Quebec" : name, cc: "CA" });
for (const [name, code] of Object.entries(TERRITORIES)) REGIONS.set(norm(name), { code, name, cc: "TERRITORY" });
// Codes last, so "OR" is Oregon and "CA" is California.
for (const r of [...REGIONS.values()]) if (!REGIONS.has(r.code.toLowerCase())) REGIONS.set(r.code.toLowerCase(), r);
REGIONS.set("newfoundland", REGIONS.get("nl")!);
REGIONS.set("pei", REGIONS.get("pe")!);
REGIONS.set("pq", REGIONS.get("qc")!);
REGIONS.set("washington dc", REGIONS.get("dc")!);

const COUNTRY_WORDS: Record<string, "US" | "CA"> = { usa: "US", us: "US", "united states": "US", "united states of america": "US", america: "US", canada: "CA" };

export interface ParsedQuery {
  /** The place name as typed, without the state, province or country. */
  name: string;
  region: Region | null;
  country: "US" | "CA" | null;
  /** Text after a comma that is neither a US/Canadian region nor a country we know ("France"). */
  extra: string | null;
  /** What was typed after the comma, as typed. */
  tail: string;
}

/**
 * "Tulsa, OK", "Tulsa OK", "Tulsa Oklahoma", "Calgary AB", "Quebec City, Quebec", "Toronto, Canada" and plain "Tulsa" all read.
 * A state alone ("Oregon") stays a name, because it is also a town.
 */
export function parsePlaceQuery(q: string): ParsedQuery {
  const text = q.trim().replace(/\s+/g, " ");
  const out: ParsedQuery = { name: text, region: null, country: null, extra: null, tail: "" };
  if (text.includes(",")) {
    const parts = text.split(",").map((x) => x.trim()).filter((x) => x !== "");
    if (parts.length < 2) return { ...out, name: parts[0] ?? "" };
    out.name = parts[0]!;
    out.tail = parts.slice(1).join(", ");
    // "Tulsa, OK, USA": walk the tail from the right.
    let tail = parts.slice(1).map(norm);
    const last = COUNTRY_WORDS[tail[tail.length - 1] ?? ""];
    if (last) {
      out.country = last;
      tail = tail.slice(0, -1);
    }
    if (tail.length === 0) return out;
    const joined = tail.join(" ");
    const hit = REGIONS.get(joined);
    if (hit) {
      out.region = hit;
      if (hit.cc !== "TERRITORY") out.country = hit.cc;
    } else if (!out.country) out.extra = joined;
    return out;
  }
  const words = text.split(" ");
  let end = words.length;
  for (const size of [4, 2, 1]) {
    const c = COUNTRY_WORDS[norm(words.slice(-size).join(" "))];
    if (c && words.length > size) {
      out.country = c;
      end = words.length - size;
      break;
    }
  }
  for (const size of [3, 2, 1]) {
    if (end - size < 1) continue;
    const hit = REGIONS.get(norm(words.slice(end - size, end).join(" ")));
    if (!hit) continue;
    out.region = hit;
    if (hit.cc !== "TERRITORY") out.country = hit.cc;
    end -= size;
    break;
  }
  out.name = words.slice(0, end).join(" ");
  return out;
}

// ---------- matching ----------

/** Edit distance counting a swap of two neighbouring letters as one typo. */
export function typoDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[m]![n]!;
}

/** How many typos a name of this length may have: none up to four letters, one up to seven, two beyond. */
const allowance = (len: number): number => (len <= 4 ? 0 : len <= 7 ? 1 : 2);

/** The spellings of the typed name that results are compared with: St spelled out, and without a trailing "City" ("Quebec City"). */
export function queryTargets(p: ParsedQuery): string[] {
  const base = expand(p.name);
  const out = [base];
  // The geocoder names the capital "Washington D.C.", so "Washington, DC" is an exact match for it.
  if (p.region?.code === "DC") out.push(`${base} dc`);
  if (base.endsWith(" city") && base.length > 7) out.push(base.slice(0, -5));
  return out.filter((x) => x.length > 0);
}

/** 0 for no match; higher is closer. Exact, then same letters ignoring spaces, then a longer name that starts with it, then a prefix, then a typo or two. */
export function matchScore(resultName: string, targets: readonly string[]): number {
  const r = expand(resultName);
  let best = 0;
  for (const t of targets) {
    let s = 0;
    const rs = r.replace(/ /g, ""), ts = t.replace(/ /g, "");
    if (r === t) s = 100;
    else if (rs === ts) s = 95;
    else if (r.startsWith(`${t} `)) s = 70;
    else if (t.length >= 3 && r.startsWith(t)) s = 60;
    else {
      const d = typoDistance(rs, ts);
      if (d > 0 && d <= allowance(ts.length) && ts.length >= 5) s = 85 - 10 * d;
    }
    best = Math.max(best, s);
  }
  return best;
}

/** Names to ask the geocoder for, best first: as typed, St spelled out, then without "City". */
export function exactTries(p: ParsedQuery): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [p.name.trim(), ...queryTargets(p)]) {
    const k = norm(t);
    if (k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Shorter starts of the typed name, for when it has a typo: the geocoder matches the start of a name, so "cincin" finds Cincinnati for "Cincinatti". */
export function prefixTries(p: ParsedQuery): string[] {
  const n = expand(p.name);
  const len = n.length;
  const out: string[] = [];
  for (const k of [len - 2, Math.ceil(len * 0.6), Math.ceil(len * 0.4), len >= 7 ? 3 : 0]) {
    const cut = Math.max(3, k);
    if (cut >= len) continue;
    const t = n.slice(0, cut).trim();
    if (t.length >= 3 && !out.includes(t)) out.push(t);
  }
  return out;
}

// ---------- ranking what the geocoder returned ----------

export interface RawPlace {
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
  feature_code?: string;
  population?: number;
}

export interface PlaceHit {
  label: string;
  lon: number;
  lat: number;
}

export const COVERAGE_MESSAGE = "Homestand covers towns in the US and Canada.";
export const TERRITORY_MESSAGE = "Homestand covers towns in the 50 US states, DC and Canada. Puerto Rico and the other US territories are not covered yet.";

const isCovered = (cc: string | undefined): boolean => cc === "US" || cc === "CA";
const ccOf = (r: RawPlace): string => (r.country_code ?? "").toUpperCase();
const regionOf = (r: RawPlace): string | null => {
  const cc = ccOf(r);
  if (!isCovered(cc) || !r.admin1) return null;
  return (cc === "US" ? US : CA)[r.admin1] ?? null;
};

/**
 * Keeps the places that really are what was typed, best first. Drops a place that only matched through an alternate name
 * (a "Willard" under "Chicago"), sorts by how close the name is and then by population, and says plainly when the place
 * is outside the US and Canada.
 */
export function rankPlaces(raw: readonly RawPlace[], p: ParsedQuery, max = 6): { hits: PlaceHit[]; message?: string; miss?: boolean } {
  const targets = queryTargets(p);
  type Scored = { r: RawPlace; i: number; score: number };
  const scored: Scored[] = raw
    .map((r, i) => ({ r, i, score: r.feature_code && !r.feature_code.startsWith("PPL") && !r.feature_code.startsWith("ADM") ? 0 : matchScore(r.name, targets) }))
    .filter((x) => x.score > 0);
  const covered = scored.filter((x) => isCovered(ccOf(x.r)) && placeLabel(x.r.name, x.r.admin1, x.r.country_code) !== null);
  const others = scored.filter((x) => !covered.includes(x));
  const order = (a: Scored, b: Scored): number => b.score - a.score || (b.r.population ?? 0) - (a.r.population ?? 0) || a.i - b.i;

  let pool = covered;
  let message: string | undefined;
  let miss = false;
  let ordered = false;
  if (p.extra) {
    // "Paris, France": the text after the comma names somewhere we do not cover.
    const e = norm(p.extra);
    const there = (x: Scored): boolean => norm(x.r.country ?? "") === e || norm(x.r.admin1 ?? "") === e;
    if (!covered.some(there) && others.some(there)) return { hits: [], message: `${COVERAGE_MESSAGE} "${p.name}, ${p.tail}" is somewhere else.` };
  }
  if (p.region && p.region.cc !== "TERRITORY") {
    const inRegion = covered.filter((x) => regionOf(x.r) === p.region!.code);
    const elsewhere = covered.filter((x) => !inRegion.includes(x) && x.score >= 95);
    if (inRegion.length === 0 && covered.length > 0) {
      message = `No ${p.name} in ${p.region.name}. These are the closest matches.`;
      miss = true;
    } else if (!inRegion.some((x) => x.score >= 95) && elsewhere.length > 0) {
      // Only a near-miss spelling in that state ("Tulia, TX" for "Tulsa, TX"), while the name as typed exists in another one: show both.
      message = `No ${p.name} in ${p.region.name}. These are the closest matches.`;
      pool = [...[...inRegion].sort(order), ...[...elsewhere].sort(order)];
      ordered = true;
    } else pool = inRegion;
  } else if (p.country) {
    const inCountry = covered.filter((x) => ccOf(x.r) === p.country);
    if (inCountry.length > 0) pool = inCountry;
  }
  if (!ordered) pool = [...pool].sort(order);

  const seen = new Set<string>();
  const hits: PlaceHit[] = [];
  for (const x of pool) {
    const label = placeLabel(x.r.name, x.r.admin1, x.r.country_code)!;
    if (seen.has(label)) continue;
    seen.add(label);
    hits.push({ label, lon: x.r.longitude, lat: x.r.latitude });
    if (hits.length === max) break;
  }
  if (hits.length === 0 && others.some((x) => x.score >= 95)) return { hits, message: `${COVERAGE_MESSAGE} "${p.name}" is somewhere else.` };
  // A bigger place of the same name in a territory ("San Juan", Puerto Rico) is worth a line when it is not shown.
  if (hits.length > 0 && !message) {
    const top = Math.max(0, ...pool.map((x) => x.r.population ?? 0));
    const terr = others.filter((x) => TERRITORY_CODES.has(ccOf(x.r)) && x.score >= 95 && (x.r.population ?? 0) > top).sort(order)[0];
    if (terr) message = `${terr.r.name}, ${TERRITORY_NAMES[ccOf(terr.r)] ?? "a US territory"} is not covered. Homestand covers towns in the 50 US states, DC and Canada.`;
  }
  return message ? { hits, message, ...(miss ? { miss } : {}) } : { hits };
}
