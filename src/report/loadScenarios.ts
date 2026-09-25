import fs from "fs/promises";
import path from "path";
import { ScenarioDefinitionSchema, type ScenarioDefinition } from "../schema/scenario";

export interface LoadedScenario {
  filePath: string;
  scenario: ScenarioDefinition;
}

/**
 * Recursively lists every *.json file under `dir`, sorted for deterministic
 * run order (report diffs stay stable across runs).
 */
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

  return files.sort();
}

async function loadOne(filePath: string): Promise<LoadedScenario> {
  const raw = JSON.parse(await fs.readFile(filePath, "utf-8"));
  const result = ScenarioDefinitionSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid scenario file "${filePath}": ${result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`
    );
  }
  return { filePath, scenario: result.data };
}

/**
 * Issue #12: loads scenario(s) for the CLI. `targetPath` may be a single
 * scenario file (existing single-file behaviour, kept working) or a directory
 * (loads every *.json file under it, recursively). --route/--tag filtering
 * happens afterwards via filterScenarios(), not here.
 */
export async function loadScenarioFiles(targetPath: string): Promise<LoadedScenario[]> {
  const stat = await fs.stat(targetPath);

  if (stat.isDirectory()) {
    const files = await listJsonFilesRecursive(targetPath);
    return Promise.all(files.map(loadOne));
  }

  return [await loadOne(targetPath)];
}
