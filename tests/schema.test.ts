import { describe, expect, it } from "bun:test";
import { ScenarioDefinitionSchema, RedisProbeKeyRuleSchema } from "../src/schema/scenario";

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

  it("should reject a Redis key pattern containing '.' (code review LOW #7)", () => {
    const result = RedisProbeKeyRuleSchema.safeParse({
      pattern: "platform.maintenance:v1:cq9",
    });
    expect(result.success).toBe(false);
  });

  it("should accept a Redis key pattern without '.'", () => {
    const result = RedisProbeKeyRuleSchema.safeParse({
      pattern: "platform-maintenance:v1:cq9",
    });
    expect(result.success).toBe(true);
  });

  it("validates a finite synthetic Redis lock precondition", () => {
    const scenario = {
      id: "sms-locked",
      name: "SMS locked",
      route: { method: "POST", path: "/v1/sms/send" },
      request: {},
      redisSetup: {
        keys: [{ key: "stationhublegacy_cache_:sms_639123456789", value: "synthetic-owner", ttlSeconds: 10 }],
      },
    };
    const parsed = ScenarioDefinitionSchema.parse(scenario);
    expect(parsed.redisSetup?.keys[0]?.db).toBe(1);
    expect(ScenarioDefinitionSchema.safeParse({
      ...scenario,
      redisSetup: { keys: [{ ...scenario.redisSetup.keys[0], ttlSeconds: -1 }] },
    }).success).toBe(false);
  });
});
