import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";
import { ContractRunner } from "../src/runner";
import { FixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";

// Issue #15's Player fixtures and DB probes are tied to synthetic seed IDs.
const RESET_TIMEOUT_MS = config.resetTimeoutMs + 10_000;
const VERIFY_TIMEOUT_MS = config.resetTimeoutMs + 30_000;
const DETERMINISM_TIMEOUT_MS = config.resetTimeoutMs * 2 + 30_000;

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV || process.env.HUB_SEED === "snapshot")(
  "Issue #15: Player contract scenarios",
  () => {
    const runner = new ContractRunner({ baseUrl: config.baseUrl, stubUrl: config.stub.baseUrl });

    beforeEach(async () => {
      await resetEnvironment();
    }, RESET_TIMEOUT_MS);

    afterAll(async () => {
      await runner.close();
    });

    const scenarioFiles = [
      "player-create-account-suffix-error.json",
      "player-create-duplicate-player.json",
      "player-create-existing.json",
      "player-create-fresh.json",
      "player-create-signature-failed.json",
      "player-create-unknown-station.json",
      "player-create-validation-failed.json",
      "player-query-outbound-error.json",
      "player-query-outbound-success.json",
      "player-query-outbound-timeout.json",
      "player-query-signature-failed.json",
      "player-query-unknown-station.json",
      "player-query-validation-failed.json",
      "player-balance-no-play-log.json",
      "player-balance-signature-failed.json",
      "player-balance-unknown-station.json",
      "player-balance-validation-failed.json",
    ];

    async function loadScenario(filename: string) {
      const raw = JSON.parse(
        await fs.readFile(path.join(__dirname, "../scenarios/player", filename), "utf-8")
      );
      return ScenarioDefinitionSchema.parse(raw);
    }

    for (const filename of scenarioFiles) {
      it(`verifies ${filename} against its committed fixture`, async () => {
        const scenario = await loadScenario(filename);
        const golden = FixtureSchema.parse(
          JSON.parse(
            await fs.readFile(
              path.join(__dirname, "../fixtures", `${scenario.id}.fixture.json`),
              "utf-8"
            )
          )
        );

        const result = await runner.verify(scenario, golden);
        expect(result.differences).toEqual([]);
        expect(result.passed).toBe(true);
      }, VERIFY_TIMEOUT_MS);
    }

    for (const filename of ["player-create-fresh.json", "player-query-outbound-success.json"]) {
      it(`records ${filename} deterministically after reset`, async () => {
        const scenario = await loadScenario(filename);
        const first = await runner.record(scenario);
        await resetEnvironment();
        const second = await runner.record(scenario);

        expect(first.scenarioId).toBe(scenario.id);
        expect(second).toEqual(first);
      }, DETERMINISM_TIMEOUT_MS);
    }
  }
);
