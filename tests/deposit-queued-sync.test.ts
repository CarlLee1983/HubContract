import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fixtureJson from "../fixtures/deposit-queued-sync.fixture.json";
import scenarioJson from "../scenarios/wallet/deposit-queued-sync.json";
import { ContractRunner } from "../src/runner";
import { config } from "../src/config";
import { FixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";
import { resetEnvironment } from "../src/env/reset";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("Issue #9: queued wallet deposit", () => {
  const runner = new ContractRunner({ baseUrl: config.baseUrl, stubUrl: config.stub.baseUrl });
  const scenario = ScenarioDefinitionSchema.parse(scenarioJson);
  const golden = FixtureSchema.parse(fixtureJson);

  beforeEach(async () => {
    await resetEnvironment();
  }, 30000);

  afterAll(async () => {
    await runner.close();
  });

  it("compares final DB, outbound and httplog effects after both queues drain", async () => {
    const result = await runner.verify(scenario, golden);
    expect(result).toEqual({ scenarioId: scenario.id, passed: true, differences: [] });
    expect(golden.layer2_dbState?.after.game_wallet[0].balance).toBe("1025.0000");
    expect(golden.layer3_outboundCalls?.calls).toHaveLength(1);
    expect(golden.layer4_sharedResources?.mongo?.newDocuments.httplog_deposit).toHaveLength(1);
  });

  it("reports a Mongo log mismatch as a shared resource difference", async () => {
    const alteredLog = structuredClone(golden);
    alteredLog.layer4_sharedResources!.mongo!.newDocuments.httplog_deposit = [];
    const result = await runner.verify(scenario, alteredLog);
    expect(result.passed).toBe(false);
    expect(result.differences).toContainEqual(
      expect.objectContaining({ layer: "shared_resources", path: "after.mongo.newDocuments.httplog_deposit.length" })
    );
  });
});
