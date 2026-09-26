import { afterEach, describe, expect, it } from "bun:test";
import { LegacyTargetAdapter } from "../src/target/legacyAdapter";
import { config } from "../src/config";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const action = {
  name: "platformGameType.setActive" as const,
  parameters: { platformId: 2, platformActive: true, gameTypeId: 1, active: false },
};
const dbBefore = { platforms: [{ id: 2, active: 1 }], platform_game_type_map: [
  { platform_id: 2, game_type_id: 1, active: 1 },
  { platform_id: 2, game_type_id: 2, active: 1 },
] };
const adapter = () => new LegacyTargetAdapter({
  readMappings: async () => dbBefore.platform_game_type_map,
});
const localLegacyUrl = `http://localhost:${config.legacyPort}`;

describe("Legacy admin target adapter", () => {
  it("refuses to send the Legacy admin action to another target", async () => {
    await expect(adapter().executeAction(action, "http://next.example:9090", dbBefore))
      .rejects.toThrow("requires the local recording target");
  });
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

    await adapter().executeAction(action, localLegacyUrl, dbBefore);

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/login", "/login", "/games/platform-and-gametype",
    ]);
    expect(calls.every((call) => new Headers(call.init.headers).get("Host") === "cmghubadmin.test")).toBe(true);
    expect(calls.every((call) => call.init.redirect === "manual")).toBe(true);
    expect(new Headers(calls[1].init.headers).get("X-XSRF-TOKEN")).toBe("csrf=");
    expect(new Headers(calls[2].init.headers).get("Cookie")).toContain("session=synthetic");
    expect(new Headers(calls[2].init.headers).get("X-XSRF-TOKEN")).toBe("csrf=");
    expect(JSON.parse(String(calls[2].init.body))).toEqual([
      { id: 2, active: { value: true }, gameTypes: [{ id: 1, active: "false" }, { id: 2, active: "true" }] },
    ]);
  });

  it("fails closed when login is rejected", async () => {
    const replies = [
      new Response("login", { status: 200, headers: { "Set-Cookie": "XSRF-TOKEN=csrf; Path=/" } }),
      new Response("", { status: 302, headers: { Location: "/login" } }),
    ];
    globalThis.fetch = (async () => replies.shift()!) as unknown as typeof fetch;
    await expect(adapter().executeAction(action, localLegacyUrl, dbBefore))
      .rejects.toThrow("Legacy admin login failed");
  });

  it("fails closed on an action HTTP error", async () => {
    const replies = [
      new Response("login", { status: 200, headers: { "Set-Cookie": "XSRF-TOKEN=csrf; Path=/" } }),
      new Response("", { status: 302, headers: { Location: "/dashboard" } }),
      new Response("SQL error", { status: 500 }),
    ];
    globalThis.fetch = (async () => replies.shift()!) as unknown as typeof fetch;
    await expect(adapter().executeAction(action, localLegacyUrl, dbBefore))
      .rejects.toThrow("Legacy internal action failed with HTTP 500");
  });

  it("refuses to sync when the complete mapping snapshot is missing", async () => {
    await expect(adapter().executeAction(action, localLegacyUrl, { platforms: dbBefore.platforms }))
      .rejects.toThrow("requires a complete platform_game_type_map before probe");
  });

  it("refuses a partial snapshot before Legacy sync can detach a sibling", async () => {
    const partial = { ...dbBefore, platform_game_type_map: [dbBefore.platform_game_type_map[0]] };
    await expect(adapter().executeAction(action, localLegacyUrl, partial))
      .rejects.toThrow("requires a complete platform_game_type_map before probe");
  });

  it("refuses a stale Platform active precondition before the observer can run", async () => {
    await expect(adapter().executeAction(action, localLegacyUrl, {
      ...dbBefore, platforms: [{ id: 2, active: 0 }],
    })).rejects.toThrow("requires a matching platforms.active before probe");
  });
});

const chatIssue = { service_issues: [{ id: 7 }] };
const inertiaPage = () => new Response(JSON.stringify({ props: { flash: { alert: { error: null, errorReload: null }, notify: { error: null } }, errors: {} } }), {
  status: 200, headers: { "Content-Type": "application/json" },
});

describe("Legacy chatroom actions", () => {
  it("translates admin join, close and message through authenticated HTTP", async () => {
    for (const [name, path, expectedBody] of [
      ["chatroom.join", "/chatrooms/7", "client_id=live-client"],
      ["chatroom.close", "/chatrooms/7/closed", ""],
      ["chatroom.messageFromAdmin", "/chatrooms/7/messages", "body=hello"],
    ] as const) {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const replies = [
        new Response("login", { status: 200, headers: { "Set-Cookie": "XSRF-TOKEN=csrf; Path=/" } }),
        new Response("", { status: 302, headers: { Location: "/dashboard", "Set-Cookie": "session=admin; Path=/" } }),
        new Response("", { status: 302, headers: { Location: "/chatrooms" } }),
        inertiaPage(),
      ];
      globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
        calls.push({ url: String(url), init });
        return replies.shift()!;
      }) as typeof fetch;
      const current = name === "chatroom.messageFromAdmin"
        ? { name, parameters: { issueId: 7, body: "hello" } }
        : { name, parameters: { issueId: 7 } };
      await new LegacyTargetAdapter({ getGatewayClientId: async () => "live-client" })
        .executeAction(current, localLegacyUrl, chatIssue);
      expect(new URL(calls[2].url).pathname).toBe(path);
      expect(String(calls[2].init.body)).toBe(expectedBody);
      expect(new Headers(calls[2].init.headers).get("Cookie")).toContain("session=admin");
      expect(calls.every((call) => call.init.redirect === "manual")).toBe(true);
    }
  });

  it("sends the service message with the prepared Laravel guest session", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const replies = [new Response("", { status: 302, headers: { Location: "/service/chatroom" } }), inertiaPage()];
    globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return replies.shift()!;
    }) as typeof fetch;
    await new LegacyTargetAdapter({ prepareServiceSession: async () => ({ cookie: "laravel_session=guest; XSRF-TOKEN=csrf", xsrfToken: "csrf" }) })
      .executeAction({ name: "chatroom.messageFromService", parameters: { issueId: 7, body: "hello" } }, localLegacyUrl, chatIssue);
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual(["/service/chatroom/messages", "/service/chatroom"]);
    expect(new Headers(calls[0].init.headers).get("Host")).toBe("cmghub.test");
    expect(new Headers(calls[0].init.headers).get("Cookie")).toContain("laravel_session=guest");
    expect(new Headers(calls[0].init.headers).get("X-XSRF-TOKEN")).toBe("csrf");
    expect(String(calls[0].init.body)).toBe("body=hello");
  });

  it("fails closed when a redirect carries a flashed Legacy error", async () => {
    const replies = [
      new Response("login", { status: 200, headers: { "Set-Cookie": "XSRF-TOKEN=csrf; Path=/" } }),
      new Response("", { status: 302, headers: { Location: "/dashboard" } }),
      new Response("", { status: 302, headers: { Location: "/chatrooms" } }),
      new Response(JSON.stringify({ props: { flash: { notify: { error: "Gateway unavailable" } } } }), { status: 200 }),
    ];
    globalThis.fetch = (async () => replies.shift()!) as unknown as typeof fetch;
    const withClient = new LegacyTargetAdapter({ getGatewayClientId: async () => "live-client" });
    await expect(withClient.executeAction({ name: "chatroom.join", parameters: { issueId: 7 } }, localLegacyUrl, chatIssue))
      .rejects.toThrow("reported a flashed error");
  });

  it("rejects nonlocal targets before any session preparation", async () => {
    let prepared = false;
    const current = new LegacyTargetAdapter({ prepareServiceSession: async () => {
      prepared = true;
      return { cookie: "session=guest", xsrfToken: "csrf" };
    } });
    await expect(current.executeAction({ name: "chatroom.messageFromService", parameters: { issueId: 7, body: "hello" } }, "http://next.example", chatIssue))
      .rejects.toThrow("requires the local recording target");
    expect(prepared).toBe(false);
  });
});
