import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";
import { ContractRunner } from "../src/runner";
import { FixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";

const files = [
  "pg-launch-callback",
  "pg-launch-recall",
  "pg-launch-recall-failure",
  "pg-callback-auth-rejected",
  "pg-callback-expired",
  "pg-launch-maintenance",
  "pg-launch-provider-failure",
  "pg-launch-missing-game",
];

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV || process.env.HUB_SEED === "snapshot")(
  "Issue #17: game launch and PG callback contracts",
  () => {
    const runner = new ContractRunner({ baseUrl: config.baseUrl, stubUrl: config.stub.baseUrl });

    beforeEach(async () => resetEnvironment(), config.resetTimeoutMs + 10_000);
    afterAll(async () => runner.close());

    for (const id of files) {
      it(`records and verifies ${id} against Legacy`, async () => {
        const scenario = ScenarioDefinitionSchema.parse(JSON.parse(
          await fs.readFile(path.join(__dirname, "../scenarios/game", `${id}.json`), "utf8")
        ));
        const golden = FixtureSchema.parse(JSON.parse(
          await fs.readFile(path.join(__dirname, "../fixtures", `${id}.fixture.json`), "utf8")
        ));
        const recorded = await runner.record(scenario);
        expect(recorded.scenarioId).toBe(id);
        expect(recorded.layer3_outboundCalls).toBeDefined();
        await resetEnvironment();
        const result = await runner.verify(scenario, golden);
        expect(result.differences).toEqual([]);
        expect(result.passed).toBe(true);
      }, config.resetTimeoutMs * 2 + 60_000);
    }
  }
);
