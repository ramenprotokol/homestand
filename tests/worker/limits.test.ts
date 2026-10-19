import { describe, expect, it } from "vitest";
import { createQlooClient } from "../../src/qloo/client";
import { ipBucket, memoryLimiter } from "../../src/worker/limits";

describe("ipBucket", () => {
  it("leaves IPv4 alone and reduces IPv6 to its /64", () => {
    expect(ipBucket("203.0.113.9")).toBe("203.0.113.9");
    expect(ipBucket("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:0db8:0001:0002::/64");
    expect(ipBucket("2001:db8:1:2:1:1:1:1")).toBe(ipBucket("2001:DB8:1:2:ffff:eeee:dddd:cccc"));
    expect(ipBucket("2001:db8::1")).toBe("2001:0db8:0000:0000::/64");
    expect(ipBucket("2001:db8:0:0:5::")).toBe("2001:0db8:0000:0000::/64");
    expect(ipBucket("::1")).toBe("0000:0000:0000:0000::/64");
    expect(ipBucket("::ffff:198.51.100.7")).toBe("198.51.100.7");
    expect(ipBucket("local")).toBe("local");
  });
});

describe("in-memory limiter", () => {
  it("counts per route, per client and per minute", async () => {
    let t = 0;
    const lim = memoryLimiter(1, () => t);
    for (let i = 0; i < 12; i++) expect(await lim("analyze", "a")).toBe(true);
    expect(await lim("analyze", "a")).toBe(false);
    expect(await lim("analyze", "b")).toBe(true);
    expect(await lim("propose", "a")).toBe(true);
    t = 61_000;
    expect(await lim("analyze", "a")).toBe(true);
  });
});

describe("Qloo client errors", () => {
  it("do not carry the response body", async () => {
    const q = createQlooClient({ baseUrl: "https://q.test", apiKey: "k", delayMs: 0, sleep: async () => undefined, fetchImpl: async () => new Response("SECRET-BODY", { status: 400 }) });
    await expect(q.search("x", "movie")).rejects.toThrow(/^Qloo \/search: HTTP 400$/);
  });
});
