import { describe, expect, it, afterAll } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { ContractRunner } from "../src/runner";
import { ScenarioDefinitionSchema, FixtureSchema } from "../src/schema/scenario";

describe("Issue #7: MCP Platform Maintenance Contract Integration Test", () => {
  const runner = new ContractRunner({
    baseUrl: "http://localhost:8080",
  });

  afterAll(async () => {
    // Ensure cleanup of maintenance key after test suite
    await fetch("http://localhost:8080/mcp/platform-maintenance/cq9", {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    await runner.close();
  });

  it("should record and verify POST /mcp/platform-maintenance/{platform} (Set)", async () => {
    // 1. Ensure clear before setting
    await fetch("http://localhost:8080/mcp/platform-maintenance/cq9", {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });

    const scenarioPath = path.join(__dirname, "../scenarios/mcp/platform-maintenance-set.json");
    const rawScenario = JSON.parse(await fs.readFile(scenarioPath, "utf-8"));
    const scenario = ScenarioDefinitionSchema.parse(rawScenario);

    // Record fixture
    const fixture = await runner.record(scenario);
    expect(fixture.layer1_inboundResponse.statusCode).toBe(200);
    expect(fixture.layer1_inboundResponse.body.ok).toBe(true);
    expect(fixture.layer1_inboundResponse.body.data.action).toBe("set");
    expect(fixture.layer4_sharedResources?.redis?.after["platform-maintenance:v1:cq9"]).toBeDefined();
    expect(fixture.layer4_sharedResources?.redis?.after["platform-maintenance:v1:cq9"]?.db).toBe(1);

    // Verify against Legacy
    const verifyResult = await runner.verify(scenario, fixture);
    if (!verifyResult.passed) {
      console.error("Set verification differences:", JSON.stringify(verifyResult.differences, null, 2));
    }
    expect(verifyResult.passed).toBe(true);
    expect(verifyResult.differences).toEqual([]);
  });

  it("should record and verify DELETE /mcp/platform-maintenance/{platform} (Clear)", async () => {
    // 1. Set maintenance flag first so clear has something to clear
    await fetch("http://localhost:8080/mcp/platform-maintenance/cq9", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ duration: "1h", reason: "Contract testing maintenance flag" }),
    });

    const scenarioPath = path.join(__dirname, "../scenarios/mcp/platform-maintenance-clear.json");
    const rawScenario = JSON.parse(await fs.readFile(scenarioPath, "utf-8"));
    const scenario = ScenarioDefinitionSchema.parse(rawScenario);

    // Record fixture
    const fixture = await runner.record(scenario);
    expect(fixture.layer1_inboundResponse.statusCode).toBe(200);
    expect(fixture.layer1_inboundResponse.body.ok).toBe(true);
    expect(fixture.layer1_inboundResponse.body.data.action).toBe("clear");
    expect(fixture.layer4_sharedResources?.redis?.before["platform-maintenance:v1:cq9"]).toBeDefined();
    expect(fixture.layer4_sharedResources?.redis?.after["platform-maintenance:v1:cq9"]).toBeNull();

    // Verify against Legacy after resetting state to flagged
    await fetch("http://localhost:8080/mcp/platform-maintenance/cq9", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ duration: "1h", reason: "Contract testing maintenance flag" }),
    });

    const verifyResult = await runner.verify(scenario, fixture);
    if (!verifyResult.passed) {
      console.error("Clear verification differences:", JSON.stringify(verifyResult.differences, null, 2));
    }
    expect(verifyResult.passed).toBe(true);
    expect(verifyResult.differences).toEqual([]);
  });
});
