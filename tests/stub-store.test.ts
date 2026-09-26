import { describe, expect, it } from "bun:test";
import { StubStore } from "../src/stub/store";

describe("StubStore (Issue #8)", () => {
  it("matches on method + path and returns the matcher's response", () => {
    const store = new StubStore();
    store.loadScript({
      matchers: [
        {
          method: "POST",
          path: "/web-root/restricted/player/get-player-balance.aspx",
          response: { status: 200, body: { error: { id: 0, msg: "" }, balance: 600, outstanding: 50 }, headers: {}, delayMs: 0 },
        },
      ],
    });

    const result = store.handle({
      method: "POST",
      path: "/web-root/restricted/player/get-player-balance.aspx",
      query: {},
      headers: { "content-type": "application/json" },
      body: { Username: "u1" },
    });

    expect(result.matched).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ error: { id: 0, msg: "" }, balance: 600, outstanding: 50 });
  });

  it("requires body condition keys to match when the matcher specifies one", () => {
    const store = new StubStore();
    store.loadScript({
      matchers: [
        {
          method: "POST",
          path: "/x",
          body: { Username: "expected-user" },
          response: { status: 200, body: {}, headers: {}, delayMs: 0 },
        },
      ],
    });

    const wrongUser = store.handle({
      method: "POST",
      path: "/x",
      query: {},
      headers: {},
      body: { Username: "someone-else" },
    });
    expect(wrongUser.matched).toBe(false);

    const rightUser = store.handle({
      method: "POST",
      path: "/x",
      query: {},
      headers: {},
      body: { Username: "expected-user" },
    });
    expect(rightUser.matched).toBe(true);
  });

  it("rejects an AboSend body with a well-formed but incorrect dynamic MD5", () => {
    const store = new StubStore();
    store.loadScript({ matchers: [{
      method: "POST",
      path: "/api/viewOrgBalance",
      body: { orgCode: "synthetic_org_code" },
      bodyMd5: {
        outputField: "sign",
        inputFields: ["orgCode", "rand"],
        suffix: "synthetic_md5_key",
        uppercase: true,
      },
      response: { status: 200, body: {}, headers: {}, delayMs: 0 },
    }] });
    const request = {
      method: "POST",
      path: "/api/viewOrgBalance",
      query: {},
      headers: {},
      body: { orgCode: "synthetic_org_code", rand: "000123", sign: "BDAB8F275B9F3D7492D95ED52E5CA026" },
    };

    expect(store.handle(request).matched).toBe(true);
    expect(store.handle({ ...request, body: { ...request.body, sign: "A".repeat(32) } }).matched).toBe(false);
    expect(store.getRequests().unmatchedCount).toBe(1);
  });

  it("deep-equals nested object/array body condition values, not just top-level primitives", () => {
    const store = new StubStore();
    store.loadScript({
      matchers: [
        {
          method: "POST",
          path: "/x",
          body: { profile: { tier: "gold", tags: ["a", "b"] } },
          response: { status: 200, body: { matched: true }, headers: {}, delayMs: 0 },
        },
      ],
    });

    const differentOrderSameShape = store.handle({
      method: "POST",
      path: "/x",
      query: {},
      headers: {},
      // Same structure, freshly-built objects (different references) — a
      // shallow `!==` comparison would wrongly reject this.
      body: { profile: { tier: "gold", tags: ["a", "b"] } },
    });
    expect(differentOrderSameShape.matched).toBe(true);

    const differentNestedValue = store.handle({
      method: "POST",
      path: "/x",
      query: {},
      headers: {},
      body: { profile: { tier: "silver", tags: ["a", "b"] } },
    });
    expect(differentNestedValue.matched).toBe(false);
  });

  it("records query string parameters alongside method/path/headers/body", () => {
    const store = new StubStore();
    store.loadScript({
      matchers: [{ method: "GET", path: "/api/merchant/player/balance", response: { status: 200, body: {}, headers: {}, delayMs: 0 } }],
    });

    store.handle({
      method: "GET",
      path: "/api/merchant/player/balance",
      query: { account: "u1", currency: "TWD" },
      headers: {},
      body: undefined,
    });

    expect(store.getRequests().requests[0]?.query).toEqual({ account: "u1", currency: "TWD" });
  });

  it("records unmatched requests as a 500 and counts them (Story 17)", () => {
    const store = new StubStore();
    store.loadScript({ matchers: [] });

    const result = store.handle({ method: "GET", path: "/undefined", query: {}, headers: {}, body: undefined });

    expect(result.matched).toBe(false);
    expect(result.status).toBe(500);
    expect(store.getRequests().unmatchedCount).toBe(1);
  });

  it("records every request it handles, matched or not, in order", () => {
    const store = new StubStore();
    store.loadScript({
      matchers: [{ method: "GET", path: "/ok", response: { status: 200, body: {}, headers: {}, delayMs: 0 } }],
    });

    store.handle({ method: "GET", path: "/ok", query: {}, headers: {}, body: undefined });
    store.handle({ method: "GET", path: "/missing", query: {}, headers: {}, body: undefined });

    const { requests, unmatchedCount } = store.getRequests();
    expect(requests.map((r) => r.path)).toEqual(["/ok", "/missing"]);
    expect(unmatchedCount).toBe(1);
  });

  it("reset() clears the script, recorded requests, and unmatched count", () => {
    const store = new StubStore();
    store.loadScript({
      matchers: [{ method: "GET", path: "/ok", response: { status: 200, body: {}, headers: {}, delayMs: 0 } }],
    });
    store.handle({ method: "GET", path: "/ok", query: {}, headers: {}, body: undefined });
    store.handle({ method: "GET", path: "/missing", query: {}, headers: {}, body: undefined });

    store.reset();

    expect(store.getRequests()).toEqual({ requests: [], unmatchedCount: 0 });
    // The script was cleared too — even a previously-matching path is now unmatched.
    const afterReset = store.handle({ method: "GET", path: "/ok", query: {}, headers: {}, body: undefined });
    expect(afterReset.matched).toBe(false);
  });

  it("returns the matcher's configured delayMs so the caller can simulate a timeout", () => {
    const store = new StubStore();
    store.loadScript({
      matchers: [{ method: "GET", path: "/slow", response: { status: 200, body: {}, headers: {}, delayMs: 3000 } }],
    });

    const result = store.handle({ method: "GET", path: "/slow", query: {}, headers: {}, body: undefined });
    expect(result.delayMs).toBe(3000);
  });

  it("getRequests() returns a copy — mutating the result must not affect the store's own state", () => {
    const store = new StubStore();
    store.loadScript({
      matchers: [{ method: "GET", path: "/ok", response: { status: 200, body: {}, headers: {}, delayMs: 0 } }],
    });
    store.handle({ method: "GET", path: "/ok", query: {}, headers: {}, body: undefined });

    const first = store.getRequests();
    first.requests.push({ method: "GET", path: "/tampered", query: {}, headers: {}, body: undefined });
    first.requests[0]!.path = "/tampered-too";

    const second = store.getRequests();
    expect(second.requests).toHaveLength(1);
    expect(second.requests[0]?.path).toBe("/ok");
  });
});
