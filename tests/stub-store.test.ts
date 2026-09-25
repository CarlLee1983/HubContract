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
      headers: {},
      body: { Username: "someone-else" },
    });
    expect(wrongUser.matched).toBe(false);

    const rightUser = store.handle({
      method: "POST",
      path: "/x",
      headers: {},
      body: { Username: "expected-user" },
    });
    expect(rightUser.matched).toBe(true);
  });

  it("records unmatched requests as a 500 and counts them (Story 17)", () => {
    const store = new StubStore();
    store.loadScript({ matchers: [] });

    const result = store.handle({ method: "GET", path: "/undefined", headers: {}, body: undefined });

    expect(result.matched).toBe(false);
    expect(result.status).toBe(500);
    expect(store.getRequests().unmatchedCount).toBe(1);
  });

  it("records every request it handles, matched or not, in order", () => {
    const store = new StubStore();
    store.loadScript({
      matchers: [{ method: "GET", path: "/ok", response: { status: 200, body: {}, headers: {}, delayMs: 0 } }],
    });

    store.handle({ method: "GET", path: "/ok", headers: {}, body: undefined });
    store.handle({ method: "GET", path: "/missing", headers: {}, body: undefined });

    const { requests, unmatchedCount } = store.getRequests();
    expect(requests.map((r) => r.path)).toEqual(["/ok", "/missing"]);
    expect(unmatchedCount).toBe(1);
  });

  it("reset() clears the script, recorded requests, and unmatched count", () => {
    const store = new StubStore();
    store.loadScript({
      matchers: [{ method: "GET", path: "/ok", response: { status: 200, body: {}, headers: {}, delayMs: 0 } }],
    });
    store.handle({ method: "GET", path: "/ok", headers: {}, body: undefined });
    store.handle({ method: "GET", path: "/missing", headers: {}, body: undefined });

    store.reset();

    expect(store.getRequests()).toEqual({ requests: [], unmatchedCount: 0 });
    // The script was cleared too — even a previously-matching path is now unmatched.
    const afterReset = store.handle({ method: "GET", path: "/ok", headers: {}, body: undefined });
    expect(afterReset.matched).toBe(false);
  });

  it("returns the matcher's configured delayMs so the caller can simulate a timeout", () => {
    const store = new StubStore();
    store.loadScript({
      matchers: [{ method: "GET", path: "/slow", response: { status: 200, body: {}, headers: {}, delayMs: 3000 } }],
    });

    const result = store.handle({ method: "GET", path: "/slow", headers: {}, body: undefined });
    expect(result.delayMs).toBe(3000);
  });
});
