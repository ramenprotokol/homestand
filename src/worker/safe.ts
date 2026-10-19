import type { KvPort } from "./ports";

/** KV can fail (outage, daily write limit on a free plan). A failed read or write is logged and the request is still served. */
export async function safeGet(kv: KvPort, key: string): Promise<string | null> {
  try {
    return await kv.get(key);
  } catch (err) {
    console.error("kv get failed", key.split(":")[0], err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function safePut(kv: KvPort, key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
  try {
    await kv.put(key, value, opts);
  } catch (err) {
    console.error("kv put failed", key.split(":")[0], err instanceof Error ? err.message : String(err));
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
