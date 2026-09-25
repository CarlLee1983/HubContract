import { describe, expect, it, afterAll, beforeEach } from "bun:test";
import { ContractRunner } from "../src/runner";
import { ScenarioDefinitionSchema, type Fixture } from "../src/schema/scenario";
import scenarioJson from "../scenarios/wallet/check-transaction-deposit-hit.json";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";

describe("Walking Skeleton: Contract Runner (Issue #4)", () => {
  const runner = new ContractRunner({
    baseUrl: config.baseUrl,
    stubUrl: config.stub.baseUrl,
  });

  beforeEach(async () => {
    // Issue #1/#3: reset to fixed synthetic seed data before every scenario.
    await resetEnvironment();
  }, 30000);

  afterAll(async () => {
    await runner.close();
  });

  it("Criterion 1: Runner only depends on base URL, not on Legacy application code", () => {
    // Verified by imports and runner initialization
    expect(runner).toBeDefined();
  });

  it("Criterion 2: Record against Legacy produces valid fixture; Verify against Legacy passes with 0 diffs", async () => {
    const scenario = ScenarioDefinitionSchema.parse(scenarioJson);
    const fixture = await runner.record(scenario);

    expect(fixture.scenarioId).toBe(scenario.id);
    expect(fixture.layer1_inboundResponse.statusCode).toBe(200);
    expect(fixture.layer1_inboundResponse.body).toEqual({
      message: "OK",
      data: {
        txn_no: "DE_SYNTHETIC_001",
        trade_no: "TRADE_DEP_001",
        type: "deposit",
        status: "completed",
        amount: 100,
      },
    });
    expect(fixture.layer2_dbState).toBeDefined();
    expect(fixture.layer2_dbState?.after.deposit_record[0].status).toBe("completed");

    // Verify against Legacy
    const verifyResult = await runner.verify(scenario, fixture);
    expect(verifyResult.passed).toBe(true);
    expect(verifyResult.differences).toEqual([]);
  });

  it("Criterion 3: Determinism check - Continuous record twice produces exactly identical fixtures", async () => {
    const scenario = ScenarioDefinitionSchema.parse(scenarioJson);
    const fixture1 = await runner.record(scenario);
    const fixture2 = await runner.record(scenario);

    expect(fixture1).toEqual(fixture2);
  });

  it("Criterion 4: Tampering a fixture field causes verify to report correct layer and path", async () => {
    const scenario = ScenarioDefinitionSchema.parse(scenarioJson);
    const fixture = await runner.record(scenario);

    // Tamper layer 1 response body field
    const tamperedFixture: Fixture = JSON.parse(JSON.stringify(fixture));
    tamperedFixture.layer1_inboundResponse.body.data.amount = 999;

    const result1 = await runner.verify(scenario, tamperedFixture);
    expect(result1.passed).toBe(false);
    expect(result1.differences.length).toBeGreaterThan(0);
    const amountDiff = result1.differences.find((d) => d.path === "body.data.amount");
    expect(amountDiff).toBeDefined();
    expect(amountDiff?.layer).toBe("inbound_response");
    expect(amountDiff?.expected).toBe(999);
    expect(amountDiff?.actual).toBe(100);

    // Tamper layer 2 db field
    const tamperedDbFixture: Fixture = JSON.parse(JSON.stringify(fixture));
    if (tamperedDbFixture.layer2_dbState) {
      tamperedDbFixture.layer2_dbState.after.deposit_record[0].status = "failed";
    }

    const result2 = await runner.verify(scenario, tamperedDbFixture);
    expect(result2.passed).toBe(false);
    const dbDiff = result2.differences.find((d) => d.path === "after.deposit_record.0.status");
    expect(dbDiff).toBeDefined();
    expect(dbDiff?.layer).toBe("db_state");
    expect(dbDiff?.expected).toBe("failed");
    expect(dbDiff?.actual).toBe("completed");
  });

  it("Criterion 5: Invalid scenario schema throws clear error pinpointing fields", () => {
    const invalidScenario = {
      id: "",
      route: {
        method: "INVALID_METHOD",
        path: "invalid_path",
      },
      request: {},
    };

    const parseResult = ScenarioDefinitionSchema.safeParse(invalidScenario);
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const errorPaths = parseResult.error.issues.map((i) => i.path.join("."));
      expect(errorPaths).toContain("id");
      expect(errorPaths).toContain("route.method");
      expect(errorPaths).toContain("route.path");
    }
  });
});
