export interface KvPort {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface AiPort {
  run(model: string, input: unknown): Promise<unknown>;
}

export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** In-memory KV for tests. */
export function memoryKv(): KvPort & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    put: async (k, v) => void data.set(k, v),
  };
}
