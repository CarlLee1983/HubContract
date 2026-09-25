import { afterEach, describe, expect, it } from "bun:test";
import { LegacyTargetAdapter } from "../src/target/legacyAdapter";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const action = {
  name: "platformGameType.setActive" as const,
  parameters: { platformId: 2, platformActive: true, gameTypeId: 1, active: false },
};

describe("Legacy admin target adapter", () => {
  it("logs in with a continuous CSRF-protected session and translates the abstract action", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const replies = [
      new Response("login", { status: 200, headers: { "Set-Cookie": "XSRF-TOKEN=csrf%3D; Path=/" } }),
      new Response("", { status: 302, headers: { Location: "/dashboard", "Set-Cookie": "session=synthetic; Path=/" } }),
      new Response("", { status: 302, headers: { Location: "/games/platform-and-gametype" } }),
    ];
    globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return replies.shift()!;
    }) as typeof fetch;

    await new LegacyTargetAdapter().executeAction(action, "http://localhost:8080");

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/login", "/login", "/games/platform-and-gametype",
    ]);
    expect(calls.every((call) => new Headers(call.init.headers).get("Host") === "cmghubadmin.test")).toBe(true);
    expect(calls.every((call) => call.init.redirect === "manual")).toBe(true);
    expect(new Headers(calls[1].init.headers).get("X-XSRF-TOKEN")).toBe("csrf=");
    expect(new Headers(calls[2].init.headers).get("Cookie")).toContain("session=synthetic");
    expect(new Headers(calls[2].init.headers).get("X-XSRF-TOKEN")).toBe("csrf=");
    expect(JSON.parse(String(calls[2].init.body))).toEqual([
      { id: 2, active: { value: true }, gameTypes: [{ id: 1, active: "false" }] },
    ]);
  });

  it("fails closed when login is rejected", async () => {
    const replies = [
      new Response("login", { status: 200, headers: { "Set-Cookie": "XSRF-TOKEN=csrf; Path=/" } }),
      new Response("", { status: 302, headers: { Location: "/login" } }),
    ];
    globalThis.fetch = (async () => replies.shift()!) as unknown as typeof fetch;
    await expect(new LegacyTargetAdapter().executeAction(action, "http://localhost:8080"))
      .rejects.toThrow("Legacy admin login failed");
  });

  it("fails closed on an action HTTP error", async () => {
    const replies = [
      new Response("login", { status: 200, headers: { "Set-Cookie": "XSRF-TOKEN=csrf; Path=/" } }),
      new Response("", { status: 302, headers: { Location: "/dashboard" } }),
      new Response("SQL error", { status: 500 }),
    ];
    globalThis.fetch = (async () => replies.shift()!) as unknown as typeof fetch;
    await expect(new LegacyTargetAdapter().executeAction(action, "http://localhost:8080"))
      .rejects.toThrow("Legacy internal action failed with HTTP 500");
  });
});
