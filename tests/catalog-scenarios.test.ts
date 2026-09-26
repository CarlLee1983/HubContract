import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";
import { ContractRunner } from "../src/runner";
import { LegacyPreconditionAdapter } from "../src/target/legacyPreconditions";
import { FixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";
import { expectRecordedFixture } from "./helpers/recordedFixture";

const cases = {
  games: ["success", "validation", "signature-failed", "unknown-station", "no-active-companies", "orphan-company", "maintenance", "redis-maintenance"],
  types: ["success", "validation", "signature-failed", "unknown-station", "inactive"],
  companies: ["success", "validation", "signature-failed", "unknown-station", "game-type-populated", "orphan-company", "maintenance", "redis-maintenance"],
} as const;

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV || process.env.HUB_SEED === "snapshot")(
  "Issue #14: game catalog Legacy contract",
  () => {
    const runner = new ContractRunner({ baseUrl: config.baseUrl, stubUrl: config.stub.baseUrl, preconditionAdapter: new LegacyPreconditionAdapter() });
    beforeEach(resetEnvironment, config.resetTimeoutMs + 10_000);
    afterAll(() => runner.close());

    for (const [route, variants] of Object.entries(cases)) {
      for (const variant of variants) {
        const id = `catalog-${route}-${variant}`;
        it(`verifies ${id} against its recorded Legacy fixture`, async () => {
          const scenario = ScenarioDefinitionSchema.parse(JSON.parse(await fs.readFile(path.join(__dirname, "../scenarios/catalog", `${id}.json`), "utf8")));
          const fixture = FixtureSchema.parse(JSON.parse(await fs.readFile(path.join(__dirname, "../fixtures", `${id}.fixture.json`), "utf8")));
          const recorded = await runner.record(scenario);
          expectRecordedFixture(recorded, fixture);
          await resetEnvironment();
          const result = await runner.verify(scenario, fixture);

          expect(result.differences).toEqual([]);
          expect(result.passed).toBe(true);

          const response = fixture.layer1_inboundResponse!;
          if (variant === "validation" || variant === "signature-failed") {
            expect(response.statusCode).toBe(422);
          }
          if (variant === "unknown-station") {
            expect(response.statusCode).toBe(500);
            expect(response.body.message).toBe("Station not found");
          }
          if (route === "games" && variant === "no-active-companies") {
            expect(response.body.message).toBe("No active game companies found for the station");
          }
          if (route === "games" && variant === "success") {
            expect(response.body.data.games.some((game: { code: string }) => game.code === "SBO_SYNTHETIC")).toBe(true);
          }
          if (route === "games" && variant === "orphan-company") {
            expect(response.statusCode).toBe(200);
            expect(response.body.message).toBe('Attempt to read property "name" on null');
          }
          if (route === "games" && (variant === "maintenance" || variant === "redis-maintenance")) {
            expect(response.body.data.games.some((game: { maintain: boolean; status: boolean }) => game.maintain && !game.status)).toBe(true);
          }
          if (variant === "maintenance") {
            expect(fixture.layer2_dbState?.before.platforms.find((platform: { name: string }) => platform.name === "jdb").maintain).toBe(1);
            expect(fixture.layer4_sharedResources?.redis?.before["platform-maintenance:v1:jdb"]).toBeNull();
            expect(fixture.layer4_sharedResources?.redis?.after["platform-maintenance:v1:jdb"]).toBeNull();
          }
          if (variant === "redis-maintenance") {
            expect(fixture.layer2_dbState?.before.platforms.find((platform: { name: string }) => platform.name === "cq9").maintain).toBe(0);
            expect(fixture.layer4_sharedResources?.redis?.before["platform-maintenance:v1:cq9"]).not.toBeNull();
            expect(fixture.layer4_sharedResources?.redis?.after["platform-maintenance:v1:cq9"]).not.toBeNull();
          }
          if (route === "types" && variant === "inactive") {
            expect(response.body.data.some((type: { active: number }) => type.active === 0)).toBe(true);
          }
          if (route === "types" && variant === "success") {
            expect(response.body.data.some((type: { name: string }) => type.name === "slots")).toBe(true);
          }
          if (route === "companies" && variant === "success") {
            expect(response.body.data[0].name).toBe("sbo");
            expect(Array.isArray(response.body.data[0].game_type)).toBe(true);
          }
          if (route === "companies" && variant === "game-type-populated") {
            expect(Array.isArray(response.body.data[0].game_type)).toBe(false);
            expect(Object.keys(response.body.data[0].game_type).length).toBeGreaterThan(0);
          }
          if (route === "companies" && variant === "orphan-company") {
            expect(response.body.message).toBe("OK");
            expect(response.body.data).toEqual([]);
          }
          if (route === "companies" && (variant === "maintenance" || variant === "redis-maintenance")) {
            expect(response.body.data.some((company: { maintain: boolean }) => company.maintain)).toBe(true);
          }
        }, config.resetTimeoutMs * 2 + 30_000);
      }
    }

    it("records the baseline games catalog identically after a reset", async () => {
      const scenario = ScenarioDefinitionSchema.parse(JSON.parse(await fs.readFile(path.join(__dirname, "../scenarios/catalog/catalog-games-success.json"), "utf8")));
      const first = await runner.record(scenario);
      await resetEnvironment();
      expect(await runner.record(scenario)).toEqual(first);
    }, config.resetTimeoutMs * 2 + 30_000);
  }
);
