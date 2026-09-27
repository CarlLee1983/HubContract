import fs from "fs/promises";
import path from "path";
import { ScenarioDefinitionSchema } from "../schema/scenario";
import { listJsonFilesRecursive } from "./loadScenarios";
import { canonicalV1Route } from "./validateV1Traceability";

type Selection = { count: number; excludedIds: string[] };

export async function selectV1Scenarios(matrixPath: string, scenariosDir: string, outputDir: string): Promise<Selection> {
  const matrix: unknown = JSON.parse(await fs.readFile(matrixPath, "utf8"));
  if (!matrix || typeof matrix !== "object" || !Array.isArray((matrix as { routes?: unknown }).routes)) {
    throw new Error("Matrix must have a routes array");
  }

  const files = await listJsonFilesRecursive(scenariosDir);
  const byId = new Map<string, { file: string; raw: unknown }[]>();
  const malformedNames = new Set<string>();
  for (const file of files) {
    try {
      const raw: unknown = JSON.parse(await fs.readFile(file, "utf8"));
      if (raw && typeof raw === "object" && typeof (raw as { id?: unknown }).id === "string") {
        const id = (raw as { id: string }).id;
        byId.set(id, [...(byId.get(id) ?? []), { file, raw }]);
      }
    } catch {
      malformedNames.add(path.basename(file, ".json"));
    }
  }

  const seen = new Set<string>();
  const selected: { id: string; file: string }[] = [];
  const excludedIds: string[] = [];
  for (const route of (matrix as { routes: unknown[] }).routes) {
    if (!route || typeof route !== "object" || typeof (route as { method?: unknown }).method !== "string" ||
      typeof (route as { path?: unknown }).path !== "string" ||
      !(route as { path: string }).path.startsWith("/v1/") ||
      !Array.isArray((route as { scenarios?: unknown }).scenarios)) {
      throw new Error("Malformed matrix route");
    }
    const matrixRoute = route as { method: string; path: string; scenarios: unknown[] };
    for (const entry of matrixRoute.scenarios) {
      const id = entry && typeof entry === "object" && (entry as { id?: unknown }).id;
      if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
        throw new Error("Malformed matrix scenario ID");
      }
      if (seen.has(id)) throw new Error(`Duplicate matrix scenario ID: ${id}`);
      seen.add(id);

      if (malformedNames.has(id)) throw new Error(`Malformed scenario JSON: ${id}`);
      const matches = byId.get(id) ?? [];
      if (matches.length === 0) throw new Error(`Missing scenario JSON: ${id}`);
      if (matches.length !== 1) throw new Error(`Duplicate scenario JSON: ${id}`);
      const parsed = ScenarioDefinitionSchema.safeParse(matches[0]!.raw);
      if (!parsed.success) throw new Error(`Malformed scenario: ${id}`);
      const scenario = parsed.data;
      const routes = scenario.route ? [scenario.route] : scenario.steps?.map((step) => step.route) ?? [];
      if (routes.length === 0) throw new Error(`Scenario has no route: ${id}`);
      if (!routes.every((stepRoute) => stepRoute.path.startsWith("/v1/"))) {
        excludedIds.push(id);
        continue;
      }
      const expected = canonicalV1Route(matrixRoute.method, matrixRoute.path);
      if (!routes.some((stepRoute) => canonicalV1Route(stepRoute.method, stepRoute.path) === expected)) {
        throw new Error(`Scenario route does not match matrix: ${id}`);
      }
      selected.push({ id, file: matches[0]!.file });
    }
  }

  await fs.mkdir(outputDir, { recursive: true });
  if ((await fs.readdir(outputDir)).length) throw new Error(`Output directory must be empty: ${outputDir}`);
  for (const { id, file } of selected) await fs.copyFile(file, path.join(outputDir, `${id}.json`));
  return { count: selected.length, excludedIds };
}
