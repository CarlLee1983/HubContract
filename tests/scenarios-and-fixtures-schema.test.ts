import { describe, expect, it } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { ScenarioDefinitionSchema, FixtureSchema } from "../src/schema/scenario";
import { listJsonFilesRecursive } from "../src/report/loadScenarios";

const repoRoot = path.join(__dirname, "..");

// Issue #12: offline CI check (no Docker, no recording environment) that every
// checked-in scenario and fixture still parses against its zod schema. Guards
// against schema drift silently breaking committed files.
describe("Offline: scenarios/ and fixtures/ schema validation", () => {
  it("validates every file under scenarios/ against ScenarioDefinitionSchema", async () => {
    const files = await listJsonFilesRecursive(path.join(repoRoot, "scenarios"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const raw = JSON.parse(await fs.readFile(file, "utf-8"));
      const result = ScenarioDefinitionSchema.safeParse(raw);
      if (!result.success) {
        throw new Error(`${path.relative(repoRoot, file)} failed schema validation: ${result.error.message}`);
      }
    }
  });

  it("validates every *.fixture.json file under fixtures/ against FixtureSchema", async () => {
    const allFiles = await listJsonFilesRecursive(path.join(repoRoot, "fixtures"));
    const fixtureFiles = allFiles.filter((f) => f.endsWith(".fixture.json"));
    expect(fixtureFiles.length).toBeGreaterThan(0);

    for (const file of fixtureFiles) {
      const raw = JSON.parse(await fs.readFile(file, "utf-8"));
      const result = FixtureSchema.safeParse(raw);
      if (!result.success) {
        throw new Error(`${path.relative(repoRoot, file)} failed schema validation: ${result.error.message}`);
      }
    }
  });

  it("records all four layers for funds writing scenarios", async () => {
    const files = await listJsonFilesRecursive(path.join(repoRoot, "scenarios/wallet"));
    const writing = [];
    for (const file of files) {
      const scenario = ScenarioDefinitionSchema.parse(JSON.parse(await fs.readFile(file, "utf-8")));
      if (!scenario.tags.includes("funds-write")) continue;
      writing.push(scenario.id);
      expect(scenario.dbProbe?.queries.length).toBeGreaterThan(0);
      expect(scenario.redisProbe?.keys.length).toBeGreaterThan(0);
      expect(scenario.mongoProbe).toBeDefined();
      const fixture = FixtureSchema.parse(JSON.parse(await fs.readFile(path.join(repoRoot, "fixtures", `${scenario.id}.fixture.json`), "utf-8")));
      expect(fixture.layer1_inboundResponse).toBeDefined();
      expect(fixture.layer2_dbState).toBeDefined();
      expect(fixture.layer3_outboundCalls).toBeDefined();
      expect(fixture.layer4_sharedResources?.redis).toBeDefined();
      expect(fixture.layer4_sharedResources?.mongo).toBeDefined();
    }
    expect(writing.length).toBeGreaterThan(0);
  });
});
