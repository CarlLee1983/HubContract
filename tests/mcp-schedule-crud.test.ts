import { describe, expect, it } from "bun:test";
import fs from "fs/promises";
import { ContractRunner } from "../src/runner";
import { FixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";
import { resetEnvironment } from "../src/env/reset";
import { config } from "../src/config";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";

const names = ["list", "create", "toggle", "delete"] as const;

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("MCP recurring schedule CRUD", () => {
  for (const name of names) {
    it(`${name}: records twice and verifies the response, DB state, and activity log`, async () => {
      const id = `mcp-platform-maintenance-schedule-${name}`;
      const scenario = ScenarioDefinitionSchema.parse(JSON.parse(await fs.readFile(`scenarios/mcp/platform-maintenance-schedule-${name}.json`, "utf8")));
      const golden = FixtureSchema.parse(JSON.parse(await fs.readFile(`fixtures/${id}.fixture.json`, "utf8")));
      const runner = new ContractRunner({ baseUrl: config.baseUrl, stubUrl: config.stub.baseUrl });
      try {
        await resetEnvironment();
        const first = await runner.record(scenario);
        expect(first).toEqual(golden);
        expect(first.layer2_dbState?.before.schedules).toHaveLength(1);
        expect(first.layer2_dbState?.before.activity_log).toEqual([]);
        expect(first.layer2_dbState?.after.schedules).toHaveLength(name === "create" ? 2 : 1);
        expect(first.layer2_dbState?.after.activity_log).toHaveLength(name === "list" || name === "toggle" ? 0 : 1);
        if (name === "toggle") {
          expect(first.layer1_inboundResponse?.statusCode).toBe(503);
          expect(first.layer2_dbState?.after.schedules[0].enabled).toBe(0);
        }
        if (name === "delete") expect(first.layer2_dbState?.after.schedules[0].deleted).toBe(1);

        await resetEnvironment();
        expect(await runner.record(scenario)).toEqual(first);
        await resetEnvironment();
        const result = await runner.verify(scenario, golden);
        expect(result.differences).toEqual([]);
        expect(result.passed).toBe(true);
      } finally {
        await runner.close();
      }
    }, 240000);
  }
});
