import { describe, expect, it, afterAll, beforeEach } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { ContractRunner } from "../src/runner";
import { ScenarioDefinitionSchema, FixtureSchema } from "../src/schema/scenario";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("Issue #5: Pilot Scenarios Contract Suite", () => {
  const runner = new ContractRunner({
    baseUrl: config.baseUrl,
  });

  beforeEach(async () => {
    // Issue #1/#3: reset to fixed synthetic seed data before every scenario.
    await resetEnvironment();
  }, 30000);

  afterAll(async () => {
    await runner.close();
  });

  const scenarioFiles = [
    "check-transaction-deposit-hit.json",
    "check-transaction-withdrawal-hit.json",
    "check-transaction-both-hit.json",
    "check-transaction-not-found.json",
    "check-transaction-soft-deleted.json",
    "check-transaction-validation-failed.json",
    "check-transaction-signature-failed.json",
    "check-transaction-unknown-station.json",
    "check-transaction-duplicate-trade-no.json",
  ];

  for (const filename of scenarioFiles) {
    it(`should record and verify ${filename} successfully`, async () => {
      const scenarioPath = path.join(__dirname, "../scenarios/wallet", filename);
      const rawScenario = JSON.parse(await fs.readFile(scenarioPath, "utf-8"));
      const scenario = ScenarioDefinitionSchema.parse(rawScenario);

      const fixturePath = path.join(__dirname, "../fixtures", `${scenario.id}.fixture.json`);
      const rawFixture = JSON.parse(await fs.readFile(fixturePath, "utf-8"));
      const golden = FixtureSchema.parse(rawFixture);

      const result = await runner.verify(scenario, golden);
      if (!result.passed) {
        console.error(`Verify failed for ${filename}:`, JSON.stringify(result.differences, null, 2));
      }
      expect(result.passed).toBe(true);
      expect(result.differences).toEqual([]);
    });
  }
});
