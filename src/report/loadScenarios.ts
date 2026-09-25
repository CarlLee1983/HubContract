import fs from "fs/promises";
import path from "path";
import { ScenarioDefinitionSchema, type ScenarioDefinition } from "../schema/scenario";

/**
 * Issue #12 code review #2: a scenario file that fails to parse/validate is
 * never thrown from here — it comes back as an entry with `error` set (and no
 * `scenario`), so one broken file can't abort loading the rest of the batch.
 * The CLI turns these into "errored" report entries, keyed by `filePath`.
 */
export type ScenarioLoadResult =
  | { filePath: string; scenario: ScenarioDefinition; error?: undefined }
  | { filePath: string; scenario?: undefined; error: string };

/**
 * Recursively lists every *.json file under `dir`, sorted for deterministic
 * run order (report diffs stay stable across runs). Exported so the offline
 * scenarios/fixtures schema-validation test can reuse it (code review #5)
 * instead of keeping its own copy.
 */
export async function listJsonFilesRecursive(dir: string): Promise<string[]> {
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

async function loadOne(filePath: string): Promise<ScenarioLoadResult> {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, "utf-8"));
    const result = ScenarioDefinitionSchema.safeParse(raw);
    if (!result.success) {
      return {
        filePath,
        error: `Invalid scenario file "${filePath}": ${result.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")}`,
      };
    }
    return { filePath, scenario: result.data };
  } catch (err) {
    return {
      filePath,
      error: `Failed to read/parse scenario file "${filePath}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

/**
 * Issue #12: loads scenario(s) for the CLI. `targetPath` may be a single
 * scenario file (existing single-file behaviour, kept working) or a directory
 * (loads every *.json file under it, recursively). --route/--tag filtering
 * happens afterwards via filterScenarios(), not here.
 */
export async function loadScenarioFiles(targetPath: string): Promise<ScenarioLoadResult[]> {
  const stat = await fs.stat(targetPath);

  if (stat.isDirectory()) {
    const files = await listJsonFilesRecursive(targetPath);
    return Promise.all(files.map(loadOne));
  }

  return [await loadOne(targetPath)];
}
