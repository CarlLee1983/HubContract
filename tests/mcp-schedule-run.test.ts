import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";
import { ContractRunner } from "../src/runner";
import { InboundFixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";

const FLAG_KEY = "platform-maintenance:v1:cq9";
const MARKER_KEY = "platform-maintenance:recurring-applied:v1:cq9:900000019:2026-09-28";

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("Issue #19: MCP schedule run", () => {
  const runner = new ContractRunner({ baseUrl: config.baseUrl, stubUrl: config.stub.baseUrl });

  beforeEach(async () => {
    await resetEnvironment();
  }, 30000);

  afterAll(async () => {
    await runner.close();
  });

  it("sets the cq9 maintenance flag and recurring marker for the seeded Monday window", async () => {
    const scenario = ScenarioDefinitionSchema.parse(JSON.parse(await fs.readFile(
      path.join(__dirname, "../scenarios/mcp/platform-maintenance-schedule-run.json"), "utf-8"
    )));
    const golden = InboundFixtureSchema.parse(JSON.parse(await fs.readFile(
      path.join(__dirname, "../fixtures/mcp-platform-maintenance-schedule-run.fixture.json"), "utf-8"
    )));

    expect(golden.layer1_inboundResponse.body).toEqual({
      ok: true,
      data: {
        at: "2026-09-28T10:30:00+08:00",
        dry_run: false,
        actions: [{
          rule_id: 900000019,
          action: "set",
          ttl: 1800,
          reason: "Synthetic MCP recurring maintenance",
          platform: "cq9",
        }],
      },
    });
    const redis = golden.layer4_sharedResources?.redis;
    expect(redis?.before[FLAG_KEY]).toBeNull();
    expect(redis?.before[MARKER_KEY]).toBeNull();
    expect(redis?.after[FLAG_KEY]?.value).toMatchObject({
      reason: "Synthetic MCP recurring maintenance",
      source: "recurring",
      set_by: "schedule:900000019",
      estimated: true,
    });
    expect(redis?.after[FLAG_KEY]?.ttl).toBe(1800);
    expect(redis?.after[MARKER_KEY]?.value).toBe(1);
    expect(redis?.after[MARKER_KEY]?.ttl).toBe(1800);

    const result = await runner.verify(scenario, golden);
    if (!result.passed) {
      console.error("Schedule run differences:", JSON.stringify(result.differences, null, 2));
    }
    expect(result.differences).toEqual([]);
    expect(result.passed).toBe(true);
  });
});
