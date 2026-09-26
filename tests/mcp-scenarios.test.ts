import { describe, expect, it, afterAll, beforeEach } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { ContractRunner } from "../src/runner";
import { ScenarioDefinitionSchema, InboundFixtureSchema } from "../src/schema/scenario";
import { LegacyPreconditionAdapter } from "../src/target/legacyPreconditions";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";

const scenarioIds = [
  "mcp-health",
  "mcp-platform-maintenance-index",
  "mcp-platform-maintenance-set",
  "mcp-platform-maintenance-clear",
  "mcp-platform-maintenance-unauthorized",
  "mcp-platform-maintenance-wrong-secret",
  "mcp-platform-maintenance-denied-ip",
] as const;

const deniedWrites = [
  "mcp-platform-maintenance-unauthorized",
  "mcp-platform-maintenance-wrong-secret",
  "mcp-platform-maintenance-denied-ip",
] as const;

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("MCP core contract integration", () => {
  const runner = new ContractRunner({
    baseUrl: config.baseUrl,
    stubUrl: config.stub.baseUrl,
    preconditionAdapter: new LegacyPreconditionAdapter(),
  });

  beforeEach(async () => {
    await resetEnvironment();
  }, 30000);

  afterAll(async () => {
    await runner.close();
  });

  for (const id of scenarioIds) {
    it(`verifies ${id} against the recorded Legacy fixture`, async () => {
      const scenario = ScenarioDefinitionSchema.parse(JSON.parse(await fs.readFile(
        path.join(__dirname, `../scenarios/mcp/${id.replace(/^mcp-/, "")}.json`), "utf-8"
      )));
      const golden = InboundFixtureSchema.parse(JSON.parse(await fs.readFile(
        path.join(__dirname, `../fixtures/${id}.fixture.json`), "utf-8"
      )));

      if (deniedWrites.some((deniedId) => deniedId === id)) {
        expect(golden.layer1_inboundResponse?.statusCode).toBe(403);
        const redis = golden.layer4_sharedResources?.redis;
        expect(redis?.before["platform-maintenance:v1:cq9"]).toBeDefined();
        expect(redis?.before["platform-maintenance:v1:cq9"]).not.toBeNull();
        expect(redis?.before).toEqual(redis?.after);
      }

      const result = await runner.verify(scenario, golden);
      if (!result.passed) {
        console.error(`${id} differences:`, JSON.stringify(result.differences, null, 2));
      }
      expect(result.passed).toBe(true);
      expect(result.differences).toEqual([]);
    });
  }
});
