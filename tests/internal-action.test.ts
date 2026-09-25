import { afterAll, describe, expect, it } from "bun:test";
import { ContractRunner } from "../src/runner";
import { LegacyTargetAdapter } from "../src/target/legacyAdapter";
import { ScenarioDefinitionSchema, type ActionFixture } from "../src/schema/scenario";
import { resetEnvironment } from "../src/env/reset";
import { config } from "../src/config";
import scenarioJson from "../scenarios/internal/platform-game-type-deactivate.json";

describe("Legacy internal action contract (#11)", () => {
  const runner = new ContractRunner({ baseUrl: config.baseUrl, targetAdapter: new LegacyTargetAdapter() });
  const scenario = ScenarioDefinitionSchema.parse(scenarioJson);

  afterAll(async () => { await runner.close(); });

  it("records deterministic DB and shared-resource effects and verifies the fixture", async () => {
    if (!scenario.action) throw new Error("Expected action scenario");

    await resetEnvironment();
    const first = await runner.record(scenario);
    expect(first.layer1_inboundResponse).toBeUndefined();
    expect(first.layer2_dbState?.before.platform_game_type_map[0].active).toBe(1);
    expect(first.layer2_dbState?.after.platform_game_type_map[0].active).toBe(0);
    expect(first.layer2_dbState?.after.platform_game_type_map[1].active).toBe(1);
    expect(first.layer2_dbState?.after.platform_game_type_map[1].cost_percent).toBe(2);
    expect(first.layer2_dbState?.after.platforms[0].active).toBe(1);
    expect(first.layer2_dbState?.after.activity_log).toEqual([]);

    await resetEnvironment();
    const second = await runner.record(scenario);
    expect(second).toEqual(first);

    await resetEnvironment();
    expect((await runner.verify(scenario, first)).differences).toEqual([]);

    const tampered: ActionFixture = structuredClone(first);
    tampered.layer2_dbState!.after.platform_game_type_map[0].active = 1;
    await resetEnvironment();
    const result = await runner.verify(scenario, tampered);
    expect(result.passed).toBe(false);
    expect(result.differences).toContainEqual(expect.objectContaining({
      layer: "db_state", path: "after.platform_game_type_map.0.active", expected: 1, actual: 0,
    }));
  }, 120000);
});
