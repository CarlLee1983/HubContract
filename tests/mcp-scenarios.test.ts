import { describe, expect, it, afterAll, beforeEach } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { ContractRunner } from "../src/runner";
import { ScenarioDefinitionSchema, InboundFixtureSchema } from "../src/schema/scenario";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";

const MCP_SECRET = "synthetic_mcp_secret_for_contract_testing_only_9f3a1c";

async function setMaintenanceFlag(): Promise<void> {
  const res = await fetch(`${config.baseUrl}/mcp/platform-maintenance/cq9`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Station-Mcp-Secret": MCP_SECRET,
    },
    body: JSON.stringify({ duration: "1h", reason: "Contract testing maintenance flag" }),
  });
  if (res.status !== 200) {
    throw new Error(
      `Pre-condition failed: POST /mcp/platform-maintenance/cq9 returned ${res.status}, expected 200`
    );
  }
}

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("Issue #7: MCP Platform Maintenance Contract Integration Test", () => {
  const runner = new ContractRunner({
    baseUrl: config.baseUrl,
    stubUrl: config.stub.baseUrl,
  });

  beforeEach(async () => {
    // Issue #1/#3: reset to fixed synthetic seed data (incl. Redis FLUSHALL) before
    // every scenario. The maintenance flag therefore always starts clear.
    await resetEnvironment();
  }, 30000);

  afterAll(async () => {
    await runner.close();
  });

  it("should verify POST /mcp/platform-maintenance/{platform} (Set) against the committed golden fixture", async () => {
    // No extra pre-condition needed: reset already guarantees the flag is clear.

    const scenarioPath = path.join(__dirname, "../scenarios/mcp/platform-maintenance-set.json");
    const rawScenario = JSON.parse(await fs.readFile(scenarioPath, "utf-8"));
    const scenario = ScenarioDefinitionSchema.parse(rawScenario);

    const fixturePath = path.join(
      __dirname,
      "../fixtures/mcp-platform-maintenance-set.fixture.json"
    );
    const rawFixture = JSON.parse(await fs.readFile(fixturePath, "utf-8"));
    const golden = InboundFixtureSchema.parse(rawFixture);

    const result = await runner.verify(scenario, golden);
    if (!result.passed) {
      console.error("Set verification differences:", JSON.stringify(result.differences, null, 2));
    }
    expect(result.passed).toBe(true);
    expect(result.differences).toEqual([]);
  });

  it("should verify DELETE /mcp/platform-maintenance/{platform} (Clear) against the committed golden fixture", async () => {
    // Scenario pre-condition (not a workaround): "clear" only makes sense once
    // something has been set, so we set the flag once here before verifying.
    await setMaintenanceFlag();

    const scenarioPath = path.join(__dirname, "../scenarios/mcp/platform-maintenance-clear.json");
    const rawScenario = JSON.parse(await fs.readFile(scenarioPath, "utf-8"));
    const scenario = ScenarioDefinitionSchema.parse(rawScenario);

    const fixturePath = path.join(
      __dirname,
      "../fixtures/mcp-platform-maintenance-clear.fixture.json"
    );
    const rawFixture = JSON.parse(await fs.readFile(fixturePath, "utf-8"));
    const golden = InboundFixtureSchema.parse(rawFixture);

    const result = await runner.verify(scenario, golden);
    if (!result.passed) {
      console.error("Clear verification differences:", JSON.stringify(result.differences, null, 2));
    }
    expect(result.passed).toBe(true);
    expect(result.differences).toEqual([]);
  });

  it("should verify that a DELETE missing X-Station-Mcp-Secret is rejected with 403 and has no side effect (Issue #7)", async () => {
    // Pre-condition: the flag must already be set, so the DELETE would have a
    // real (observable) effect if it were allowed through. We use this to prove
    // the 403 actually short-circuits the request rather than merely returning
    // the right status code while still mutating Redis.
    await setMaintenanceFlag();

    const scenarioPath = path.join(
      __dirname,
      "../scenarios/mcp/platform-maintenance-unauthorized.json"
    );
    const rawScenario = JSON.parse(await fs.readFile(scenarioPath, "utf-8"));
    const scenario = ScenarioDefinitionSchema.parse(rawScenario);

    const fixturePath = path.join(
      __dirname,
      "../fixtures/mcp-platform-maintenance-unauthorized.fixture.json"
    );
    const rawFixture = JSON.parse(await fs.readFile(fixturePath, "utf-8"));
    const golden = InboundFixtureSchema.parse(rawFixture);

    expect(golden.layer1_inboundResponse!.statusCode).toBe(403);
    // The golden fixture itself must prove no side effect: before == after,
    // and the key is still present (not cleared).
    const redisGolden = golden.layer4_sharedResources?.redis;
    expect(redisGolden?.before["platform-maintenance:v1:cq9"]).not.toBeNull();
    expect(redisGolden?.after["platform-maintenance:v1:cq9"]).not.toBeNull();
    expect(redisGolden?.before).toEqual(redisGolden?.after);

    const result = await runner.verify(scenario, golden);
    if (!result.passed) {
      console.error(
        "Unauthorized verification differences:",
        JSON.stringify(result.differences, null, 2)
      );
    }
    expect(result.passed).toBe(true);
    expect(result.differences).toEqual([]);
  });
});
