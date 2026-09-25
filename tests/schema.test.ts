import { describe, expect, it } from "bun:test";
import { ScenarioDefinitionSchema } from "../src/schema/scenario";

describe("Scenario Schema (Zod)", () => {
  it("should validate a valid check-transaction scenario definition", () => {
    const validScenario = {
      id: "check-transaction-deposit-hit",
      name: "Check Transaction: Deposit Order Hit",
      route: {
        method: "POST",
        path: "/v1/wallet/check-transaction",
      },
      request: {
        headers: {
          "Host": "localhost:8080",
          "Content-Type": "application/json",
        },
        body: {
          station_code: "DEMO_STATION",
          txn_no: "TRADE_DEP_001",
          timestamp: 1727270000,
        },
        signWith: {
          secretKey: "synthetic_secret_key_for_contract_testing_only_1234567890",
        },
      },
      dbProbe: {
        queries: [
          {
            name: "deposit_record",
            sql: "SELECT no, trade_no, amount, status FROM deposit_records WHERE trade_no = ? AND deleted_at IS NULL",
            params: ["TRADE_DEP_001"],
          },
        ],
      },
      normalizers: [
        {
          target: "request.body.timestamp",
          type: "current_timestamp",
        },
      ],
    };

    const parsed = ScenarioDefinitionSchema.parse(validScenario);
    expect(parsed.id).toBe("check-transaction-deposit-hit");
    expect(parsed.route.method).toBe("POST");
  });

  it("should fail validation and pinpoint missing/invalid fields", () => {
    const invalidScenario = {
      id: "invalid-scenario",
      route: {
        method: "INVALID_METHOD",
      },
      request: {},
    };

    const result = ScenarioDefinitionSchema.safeParse(invalidScenario);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      const pathList = issues.map((i) => i.path.join("."));
      expect(pathList).toContain("route.path");
      expect(pathList).toContain("route.method");
    }
  });
});
