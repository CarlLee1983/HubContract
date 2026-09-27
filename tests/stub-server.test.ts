import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import type { AddressInfo } from "node:net";
import { createStubServer } from "../src/stub/server";
import { StubStore } from "../src/stub/store";
import type { StubRequestRecord } from "../src/schema/scenario";

interface StubRequestsResponse {
  requests: StubRequestRecord[];
  unmatchedCount: number;
}

interface StubErrorResponse {
  error: string;
  issues?: unknown[];
}

describe("Provider stub HTTP transport (Issue #8)", () => {
  let baseUrl: string;
  let server: ReturnType<typeof createStubServer>;
  let store: StubStore;

  beforeAll(async () => {
    store = new StubStore();
    server = createStubServer(store);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("records query string parameters on outbound requests", async () => {
    await fetch(`${baseUrl}/__stub/reset`, { method: "POST" });
    await fetch(`${baseUrl}/__stub/script`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        matchers: [{ method: "GET", path: "/api/merchant/player/balance", response: { status: 200, body: {} } }],
      }),
    });

    await fetch(`${baseUrl}/api/merchant/player/balance?account=u1&currency=TWD`);

    const { requests } = (await (await fetch(`${baseUrl}/__stub/requests`)).json()) as StubRequestsResponse;
    expect(requests).toEqual([
      {
        method: "GET",
        path: "/api/merchant/player/balance",
        query: { account: "u1", currency: "TWD" },
        headers: expect.any(Object),
        body: undefined,
      },
    ]);
  });

  it("returns PG launcher HTML verbatim", async () => {
    await fetch(`${baseUrl}/__stub/reset`, { method: "POST" });
    await fetch(`${baseUrl}/__stub/script`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchers: [{
        method: "POST", path: "/external-game-launcher/api/v1/GetLaunchURLHTML",
        response: { rawBody: "<html>launcher</html>" },
      }] }),
    });
    const res = await fetch(`${baseUrl}/external-game-launcher/api/v1/GetLaunchURLHTML`, { method: "POST" });
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("<html>launcher</html>");
  });

  it("returns 400 with issues when the script fails schema validation", async () => {
    const res = await fetch(`${baseUrl}/__stub/script`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchers: [{ method: "NOT_A_METHOD", path: "no-leading-slash" }] }),
    });

    expect(res.status).toBe(400);
    const payload = (await res.json()) as StubErrorResponse;
    expect(payload.error).toBe("invalid stub script");
    expect(Array.isArray(payload.issues)).toBe(true);
    expect(payload.issues?.length ?? 0).toBeGreaterThan(0);
  });

  it("returns 500 for an unexpected error (e.g. unparseable JSON), without crashing the server", async () => {
    const res = await fetch(`${baseUrl}/__stub/script`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{not valid json",
    });

    expect(res.status).toBe(500);
    const payload = (await res.json()) as StubErrorResponse;
    expect(payload.error).toContain("hub-contract stub:");

    // The server must still be usable afterwards.
    const health = await fetch(`${baseUrl}/__stub/health`);
    expect(health.status).toBe(200);
  });

  it("GET /__stub/requests returns a copy — mutating it must not affect the store", async () => {
    await fetch(`${baseUrl}/__stub/reset`, { method: "POST" });
    await fetch(`${baseUrl}/__stub/script`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchers: [{ method: "GET", path: "/x", response: { status: 200, body: {} } }] }),
    });
    await fetch(`${baseUrl}/x`);

    const first = (await (await fetch(`${baseUrl}/__stub/requests`)).json()) as StubRequestsResponse;
    first.requests.push({ method: "GET", path: "/tampered", query: {}, headers: {}, body: undefined });

    const second = (await (await fetch(`${baseUrl}/__stub/requests`)).json()) as StubRequestsResponse;
    expect(second.requests).toHaveLength(1);
    expect(second.requests[0]?.path).toBe("/x");
  });
});
