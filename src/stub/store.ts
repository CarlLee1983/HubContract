import type { StubMatcher, StubRequestRecord, StubScript } from "../schema/scenario";

export type { StubRequestRecord };

export interface StubMatchResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  delayMs: number;
  matched: boolean;
}

/**
 * Pure, in-memory state for the provider stub (Issue #8). Kept separate from
 * the node:http transport (server.ts) so the request-matching logic can be
 * unit-tested in-process without a real socket.
 */
export class StubStore {
  private script: StubScript = { matchers: [] };
  private requests: StubRequestRecord[] = [];
  private unmatchedCount = 0;

  loadScript(script: StubScript): void {
    this.script = script;
  }

  reset(): void {
    this.script = { matchers: [] };
    this.requests = [];
    this.unmatchedCount = 0;
  }

  /** Returns a copy — callers must never be able to mutate this store's internal state through it. */
  getRequests(): { requests: StubRequestRecord[]; unmatchedCount: number } {
    return {
      requests: this.requests.map((r) => structuredClone(r)),
      unmatchedCount: this.unmatchedCount,
    };
  }

  /**
   * Records the incoming request and returns the response its matched
   * matcher describes. A request that matches no matcher is still recorded
   * (so the runner can see what the target under test actually sent) and
   * gets a 5xx "no matcher" response — Story 17: an undefined outbound call
   * must fail the scenario, not silently pass through as a 200.
   */
  handle(req: StubRequestRecord): StubMatchResult {
    this.requests.push(structuredClone(req));

    const matcher = this.script.matchers.find((m) => this.matches(m, req));
    if (!matcher) {
      this.unmatchedCount++;
      return {
        status: 500,
        body: { error: "hub-contract stub: no matcher defined for this request" },
        headers: {},
        delayMs: 0,
        matched: false,
      };
    }

    return {
      status: matcher.response.status,
      body: matcher.response.body ?? {},
      headers: matcher.response.headers,
      delayMs: matcher.response.delayMs,
      matched: true,
    };
  }

  private matches(matcher: StubMatcher, req: StubRequestRecord): boolean {
    if (matcher.method !== req.method) return false;
    if (matcher.path !== req.path) return false;

    if (matcher.body) {
      const body = (req.body ?? {}) as Record<string, unknown>;
      for (const [key, expected] of Object.entries(matcher.body)) {
        // Deep-equal, not `!==` (code review Standards #4) — a matcher
        // condition on a nested object/array must actually compare
        // structure, not object identity.
        if (!Bun.deepEquals(body[key], expected, true)) return false;
      }
    }

    return true;
  }
}
