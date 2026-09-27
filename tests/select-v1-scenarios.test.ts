import { afterEach, expect, it } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { selectV1Scenarios } from "../src/report/selectV1Scenarios";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hubcontract-v1-select-"));
  dirs.push(root);
  const scenarios = path.join(root, "scenarios");
  const output = path.join(root, "output");
  const matrix = path.join(root, "matrix.json");
  await fs.mkdir(path.join(scenarios, "nested"), { recursive: true });
  const entries = ["single", "steps", "composite"];
  await fs.writeFile(matrix, JSON.stringify({ routes: [{ method: "POST", path: "/v1/example", scenarios: entries.map((id) => ({ id })) }] }));
  const scenario = (id: string, routes: string[]) => ({
    id, name: id, ...(routes.length === 1
      ? { route: { method: "POST", path: routes[0] }, request: { headers: {} } }
      : { steps: routes.map((route, index) => ({ id: `step-${index}`, route: { method: "POST", path: route }, request: { headers: {} } })) }),
  });
  await fs.writeFile(path.join(scenarios, "single.json"), JSON.stringify(scenario("single", ["/v1/example"])));
  await fs.writeFile(path.join(scenarios, "nested", "steps.json"), JSON.stringify(scenario("steps", ["/v1/example", "/v1/other"])));
  await fs.writeFile(path.join(scenarios, "nested", "composite.json"), JSON.stringify(scenario("composite", ["/v1/example", "/callback/example"])));
  await fs.writeFile(path.join(scenarios, "unlisted.json"), JSON.stringify(scenario("unlisted", ["/v1/example"])));
  return { root, scenarios, output, matrix };
}

it("copies only listed v1-only scenarios from nested directories", async () => {
  const { matrix, scenarios, output } = await setup();
  expect(await selectV1Scenarios(matrix, scenarios, output)).toEqual({ count: 2, excludedIds: ["composite"] });
  expect((await fs.readdir(output)).sort()).toEqual(["single.json", "steps.json"]);
  expect(JSON.parse(await fs.readFile(path.join(output, "steps.json"), "utf8")).id).toBe("steps");
});

it("rejects missing, duplicate and malformed listed scenarios before copying", async () => {
  const { matrix, scenarios, output } = await setup();
  const original = await fs.readFile(matrix, "utf8");
  await fs.writeFile(matrix, original.replace('"composite"', '"missing"'));
  await expect(selectV1Scenarios(matrix, scenarios, output)).rejects.toThrow("Missing scenario JSON: missing");
  await fs.writeFile(matrix, original);
  await fs.writeFile(path.join(scenarios, "nested", "single.json"), await fs.readFile(path.join(scenarios, "single.json")));
  await expect(selectV1Scenarios(matrix, scenarios, output)).rejects.toThrow("Duplicate scenario JSON: single");
  await fs.rm(path.join(scenarios, "nested", "single.json"));
  await fs.writeFile(path.join(scenarios, "single.json"), "{");
  await expect(selectV1Scenarios(matrix, scenarios, output)).rejects.toThrow("Malformed scenario JSON: single");
  await expect(fs.readdir(output)).rejects.toThrow();
});

it("rejects repeated matrix IDs and route mismatches", async () => {
  const { matrix, scenarios, output } = await setup();
  const data = JSON.parse(await fs.readFile(matrix, "utf8"));
  data.routes[0].scenarios.push({ id: "single" });
  await fs.writeFile(matrix, JSON.stringify(data));
  await expect(selectV1Scenarios(matrix, scenarios, output)).rejects.toThrow("Duplicate matrix scenario ID: single");
  data.routes[0].scenarios.pop();
  data.routes[0].path = "/v1/different";
  await fs.writeFile(matrix, JSON.stringify(data));
  await expect(selectV1Scenarios(matrix, scenarios, output)).rejects.toThrow("Scenario route does not match matrix: single");
});

it("selects the checked-in matrix without modifying source scenarios", async () => {
  const { output } = await setup();
  const root = path.join(import.meta.dir, "..");
  const matrixPath = path.join(root, "docs/v1-route-scenario-matrix.json");
  const result = await selectV1Scenarios(matrixPath, path.join(root, "scenarios"), output);
  const matrix = JSON.parse(await fs.readFile(matrixPath, "utf8"));
  expect(result.count).toBe(matrix.routes.flatMap((route: { scenarios: unknown[] }) => route.scenarios).length - result.excludedIds.length);
  expect(result.excludedIds).toEqual([
    "pg-callback-auth-rejected", "pg-callback-expired", "pg-callback-wrong-ops", "pg-launch-callback",
    "pg-launch-recall-failure", "pg-launch-recall",
  ]);
  expect((await fs.readdir(output)).length).toBe(result.count);
});
