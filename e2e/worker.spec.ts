import { expect, test } from "@playwright/test";

// The real Worker with its counter Durable Object (wrangler dev --local): the health route is coarse, a sample and a new city both work, and the MCP
// endpoint answers. Nothing here depends on the browser.
const API = `http://127.0.0.1:${process.env.E2E_API_PORT ?? "8788"}`;
const ORIGIN = `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? "5173"}`;
const headers = { origin: ORIGIN, "content-type": "application/json" };

test("health says only how things stand, never the budget", async ({ request }) => {
  const res = await request.get(`${API}/api/health`, { headers: { origin: ORIGIN } });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body).toMatchObject({ ok: true, mode: "synthetic", live: "ok" });
  expect(JSON.stringify(body)).not.toMatch(/caps|remaining|qloo/i);
  expect(res.headers()["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
});

test("the MCP endpoint answers, and a sample check goes through the counters", async ({ request }) => {
  const rpc = (id: number, method: string, params?: unknown) => request.post(`${API}/mcp`, { headers, data: { jsonrpc: "2.0", id, method, params } });
  const init = await rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
  expect(init.status()).toBe(200);
  const call = await rpc(2, "tools/call", { name: "check_calendar", arguments: { sample: "biloxi" } });
  expect(call.status()).toBe(200);
  const out = (await call.json()) as { result?: { isError?: boolean; content?: Array<{ text: string }> } };
  expect(out.result?.isError).toBeUndefined();
  expect(out.result?.content?.[0]?.text).toMatch(/nights checked for Biloxi/);
});

test("a new city, then the same one again, through the Durable Object gates", async ({ request }) => {
  const geo = (await (await request.get(`${API}/api/geocode?q=Tulsa`, { headers: { origin: ORIGIN } })).json()) as { results: Array<{ label: string; lon: number; lat: number; sig: string }> };
  const market = geo.results[0]!;
  const rows = [
    { date: "2027-04-10", theme: "Bluey Day", sponsor: "", locked: false, notes: "" },
    { date: "2027-04-17", theme: "Star Wars Night", sponsor: "", locked: false, notes: "" },
  ];
  for (let i = 0; i < 2; i++) {
    const res = await request.post(`${API}/api/analyze`, { headers, data: { market, rows } });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { nights: unknown[] }).nights).toHaveLength(2);
  }
});
