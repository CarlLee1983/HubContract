import { describe, expect, it } from "bun:test";
import { buildHttpRequest } from "../src/runner";
import { InboundScenarioSchema } from "../src/schema/scenario";
import { normalizeRequestInputs, signRequest } from "../src/signer/signature";
import { config } from "../src/config";

describe("Issue #6: runner signs normalized inputs and supports form encoding", () => {
  const secretKey = "synthetic_secret_key_for_contract_testing_only_1234567890";

  it("signs the trimmed/empty-to-null normalized payload, not the raw body", () => {
    const scenario = InboundScenarioSchema.parse({
      id: "sign-normalized-inputs",
      name: "Sign normalized inputs",
      route: { method: "POST", path: "/v1/wallet/check-transaction" },
      request: {
        headers: {},
        body: {
          station_code: "  DEMO_STATION  ",
          remark: "",
          timestamp: 1727270000,
        },
        signWith: { secretKey },
      },
    });

    const built = buildHttpRequest(scenario, config.baseUrl);
    const sentBody = JSON.parse(built.body!);

    // The raw body sent over the wire is untouched (still has the whitespace/empty string).
    expect(sentBody.station_code).toBe("  DEMO_STATION  ");
    expect(sentBody.remark).toBe("");

    // But the signature was computed over the normalized payload.
    const expectedSign = signRequest(
      normalizeRequestInputs({
        station_code: "  DEMO_STATION  ",
        remark: "",
        timestamp: 1727270000,
      }),
      secretKey
    );
    expect(sentBody.sign).toBe(expectedSign);
  });

  it("encodes the body as application/x-www-form-urlencoded when the scenario declares that Content-Type", () => {
    const scenario = InboundScenarioSchema.parse({
      id: "form-encoded-request",
      name: "Form encoded request",
      route: { method: "POST", path: "/mcp/platform-maintenance/cq9" },
      request: {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: { duration: "1h", reason: "maintenance" },
      },
    });

    const built = buildHttpRequest(scenario, config.baseUrl);

    expect(built.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(built.body).toBe("duration=1h&reason=maintenance");
  });

  describe("code review MEDIUM #4(a): form-encoded values follow PHP string-cast semantics", () => {
    it("encodes booleans and null the same way signRequest's toPhpString does (true->1, false/null->'')", () => {
      const scenario = InboundScenarioSchema.parse({
        id: "form-encoded-php-cast",
        name: "Form encoded PHP cast semantics",
        route: { method: "POST", path: "/mcp/platform-maintenance/cq9" },
        request: {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: { estimated: true, disabled: false, note: null, reason: "maintenance" },
        },
      });

      const built = buildHttpRequest(scenario, config.baseUrl);

      expect(built.body).toBe("estimated=1&disabled=&note=&reason=maintenance");
    });

    it("throws rather than serializing a nested object/array to '[object Object]'", () => {
      const scenario = InboundScenarioSchema.parse({
        id: "form-encoded-nested-throws",
        name: "Form encoded nested value throws",
        route: { method: "POST", path: "/mcp/platform-maintenance/cq9" },
        request: {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: { reason: "maintenance", meta: { nested: true } },
        },
      });

      expect(() => buildHttpRequest(scenario, config.baseUrl)).toThrow(
        "Array to string conversion"
      );
    });
  });

  it("signs body over query on key conflicts, matching Laravel's Request::all() precedence (code review MEDIUM #4(b))", () => {
    const scenario = InboundScenarioSchema.parse({
      id: "sign-body-over-query",
      name: "Sign body over query on conflict",
      route: { method: "POST", path: "/v1/wallet/check-transaction" },
      request: {
        headers: {},
        query: { station_code: "FROM_QUERY", timestamp: 1727270000 },
        body: { station_code: "FROM_BODY", timestamp: 1727270000 },
        signWith: { secretKey },
      },
    });

    const built = buildHttpRequest(scenario, config.baseUrl);
    const sentBody = JSON.parse(built.body!);

    const expectedSign = signRequest(
      normalizeRequestInputs({ station_code: "FROM_BODY", timestamp: 1727270000 }),
      secretKey
    );
    expect(sentBody.sign).toBe(expectedSign);
  });

  it("defaults to application/json body encoding when Content-Type is not declared", () => {
    const scenario = InboundScenarioSchema.parse({
      id: "json-default-request",
      name: "JSON default request",
      route: { method: "POST", path: "/mcp/platform-maintenance/cq9" },
      request: {
        headers: {},
        body: { duration: "1h", reason: "maintenance" },
      },
    });

    const built = buildHttpRequest(scenario, config.baseUrl);

    expect(built.headers["Content-Type"]).toBe("application/json");
    expect(built.body).toBe(JSON.stringify({ duration: "1h", reason: "maintenance" }));
  });
});
