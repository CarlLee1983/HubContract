import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";
import { buildHttpRequest, ContractRunner, httpStepScenario } from "../src/runner";
import { FixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";
import { expectRecordedFixture } from "./helpers/recordedFixture";

const files = [
  "pg-launch-callback",
  "pg-launch-recall",
  "pg-launch-recall-failure",
  "pg-callback-auth-rejected",
  "pg-callback-wrong-ops",
  "pg-callback-expired",
  "pg-launch-maintenance",
  "pg-launch-provider-failure",
  "pg-launch-missing-game",
];

describe("PG HTTP step request normalization", () => {
  it("adds a current timestamp only to launch, not the callback body", async () => {
    const scenario = ScenarioDefinitionSchema.parse(await Bun.file(
      path.join(__dirname, "../scenarios/game/pg-launch-callback.json")
    ).json());
    const launch = buildHttpRequest(httpStepScenario(scenario, scenario.steps![0]!), config.baseUrl);
    const callback = buildHttpRequest(httpStepScenario(scenario, scenario.steps![1]!, "issued-ops"), config.baseUrl);
    expect(JSON.parse(launch.body!).timestamp).toBeGreaterThan(0);
    expect(JSON.parse(callback.body!)).toEqual({
      operator_token: "synthetic_pg_operator_token",
      secret_key: "synthetic_pg_secret_key",
      bet_type: 1,
      operator_player_session: "issued-ops",
    });
  });

  it("records wrong ops as rejected while retaining the issued verifyData", async () => {
    const golden = FixtureSchema.parse(await Bun.file(
      path.join(__dirname, "../fixtures/pg-callback-wrong-ops.fixture.json")
    ).json());
    expect(golden.stepResponses?.[1]?.body).toEqual({
      data: null,
      error: { code: 1034, message: "Invalid request" },
    });
    const issuedKey = "launchGame:verifyData:<PG_OPS>";
    expect(golden.redisCheckpoints?.launch?.[issuedKey]?.value.ops).toBe("<PG_OPS>");
    expect(golden.redisCheckpoints?.verifySession?.[issuedKey]?.value.ops).toBe("<PG_OPS>");
  });
});

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
        expectRecordedFixture(recorded, golden);
        await resetEnvironment();
        const result = await runner.verify(scenario, golden);
        expect(result.differences).toEqual([]);
        expect(result.passed).toBe(true);
      }, config.resetTimeoutMs * 2 + 60_000);
    }
  }
);
