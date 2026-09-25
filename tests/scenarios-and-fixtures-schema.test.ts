import { describe, expect, it } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { ScenarioDefinitionSchema } from "../src/schema/scenario";
import { FixtureSchema } from "../src/schema/scenario";

async function listJsonFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFilesRecursive(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }
  return files;
}

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
});
