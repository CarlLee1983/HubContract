import { afterEach, expect, it } from "bun:test";
import { config } from "../src/config";
import { LegacyPreconditionAdapter } from "../src/target/legacyPreconditions";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

it("sets MCP maintenance through the pinned Legacy endpoint", async () => {
  let request: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    request = { url: String(url), init };
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const adapter = new LegacyPreconditionAdapter();
  try {
    await adapter.apply({ mcpMaintenance: { platform: "cq9/a", duration: "1h", reason: "Contract setup" } });
  } finally {
    await adapter.close();
  }

  expect(request?.url).toBe(`http://localhost:${config.legacyPort}/mcp/platform-maintenance/cq9%2Fa`);
  expect(request?.init.method).toBe("POST");
  expect(request?.init.headers).toEqual({
    Host: "localhost:8080",
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Station-Mcp-Secret": "synthetic_mcp_secret_for_contract_testing_only_9f3a1c",
  });
  expect(JSON.parse(String(request?.init.body))).toEqual({ duration: "1h", reason: "Contract setup" });
});

it("stops when the Legacy MCP setup request is rejected", async () => {
  globalThis.fetch = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
  const adapter = new LegacyPreconditionAdapter();
  try {
    await expect(adapter.apply({ mcpMaintenance: { platform: "cq9", duration: "1h", reason: "Contract setup" } }))
      .rejects.toThrow("Legacy MCP maintenance precondition failed: HTTP 403");
  } finally {
    await adapter.close();
  }
});
