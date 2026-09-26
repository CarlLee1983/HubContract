import { describe, expect, it } from "bun:test";
import { ScenarioDefinitionSchema, RedisProbeKeyRuleSchema, MongoProbeSchema } from "../src/schema/scenario";
import { ContractRunner } from "../src/runner";

describe("Scenario Schema (Zod)", () => {
  it("rejects Mongo collection names the probe cannot capture", () => {
    expect(MongoProbeSchema.safeParse({ collections: ["httplog_deposit!"] }).success).toBe(false);
    expect(MongoProbeSchema.safeParse({ pattern: "httplog_*" }).success).toBe(true);
  });

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
    expect(parsed.route!.method).toBe("POST");
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

  it("validates a target-neutral SMS lock precondition", () => {
    const scenario = {
      id: "sms-locked",
      name: "SMS locked",
      route: { method: "POST", path: "/v1/sms/send" },
      request: {},
      preconditions: { smsLock: { nationalNumber: "639123456789" } },
    };
    const parsed = ScenarioDefinitionSchema.parse(scenario);
    expect(parsed.preconditions?.smsLock?.nationalNumber).toBe("639123456789");
    expect(ScenarioDefinitionSchema.safeParse({
      ...scenario,
      preconditions: { smsLock: { nationalNumber: "not-a-number" } },
    }).success).toBe(false);
  });

  it("validates a target-neutral MCP maintenance precondition", () => {
    const scenario = {
      id: "mcp-clear", name: "MCP clear",
      route: { method: "DELETE", path: "/mcp/platform-maintenance/cq9" },
      preconditions: { mcpMaintenance: { platform: "cq9", duration: "1h", reason: "Contract setup" } },
    };
    expect(ScenarioDefinitionSchema.parse(scenario).preconditions?.mcpMaintenance?.platform).toBe("cq9");
    expect(ScenarioDefinitionSchema.safeParse({
      ...scenario, preconditions: { mcpMaintenance: { platform: "", duration: "1h", reason: "Contract setup" } },
    }).success).toBe(false);
  });

  it("fails closed when a target has no precondition adapter", async () => {
    const runner = new ContractRunner({ baseUrl: "http://127.0.0.1:1", stubUrl: "http://127.0.0.1:2" });
    const scenario = ScenarioDefinitionSchema.parse({
      id: "sms-locked",
      name: "SMS locked",
      route: { method: "POST", path: "/v1/sms/send" },
      request: {},
      preconditions: { smsLock: { nationalNumber: "901234567" } },
    });
    try {
      await expect(runner.record(scenario)).rejects.toThrow("requires a precondition adapter");
    } finally {
      await runner.close();
    }
  });
});
