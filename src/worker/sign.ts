import type { MarketIn } from "../app/api-types";
import { SAMPLE_MARKETS } from "../app/markets";

const enc = new TextEncoder();

const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** HMAC-SHA256 over "label|lon|lat": the search endpoint signs what it returned, so only searched places are accepted. */
export async function signMarket(key: string, m: Pick<MarketIn, "label" | "lon" | "lat">): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(`${m.label}|${m.lon}|${m.lat}`)));
}

function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const isSampleMarket = (m: Pick<MarketIn, "label" | "lon" | "lat">): boolean => SAMPLE_MARKETS.some((s) => s.label === m.label && s.lon === m.lon && s.lat === m.lat);

/** A sample club, or a market whose signature this Worker issued. With no signing key, only sample clubs pass. */
export async function marketAllowed(m: MarketIn, key: string | null): Promise<boolean> {
  if (isSampleMarket(m)) return true;
  if (!key || typeof m.sig !== "string") return false;
  return sameHex(await signMarket(key, m), m.sig.toLowerCase());
}
