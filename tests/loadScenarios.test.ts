import { describe, expect, it } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { loadScenarioFiles } from "../src/report/loadScenarios";

function scenarioJson(id: string, routePath: string) {
  return JSON.stringify({
    id,
    name: id,
    route: { method: "POST", path: routePath },
    request: { headers: {} },
  });
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "hubcontract-load-scenarios-"));
}

describe("Issue #12: loadScenarioFiles", () => {
  it("loads a single scenario file", async () => {
    const dir = await makeTempDir();
    const file = path.join(dir, "one.json");
    await fs.writeFile(file, scenarioJson("one", "/v1/wallet/check-transaction"));

    const result = await loadScenarioFiles(file);

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe(file);
    expect(result[0].scenario?.id).toBe("one");
    expect(result[0].error).toBeUndefined();

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("loads every *.json file under a directory, recursively, in sorted order", async () => {
    const dir = await makeTempDir();
    await fs.mkdir(path.join(dir, "wallet"), { recursive: true });
    await fs.mkdir(path.join(dir, "mcp"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "wallet", "b.json"),
      scenarioJson("b", "/v1/wallet/check-transaction")
    );
    await fs.writeFile(
      path.join(dir, "wallet", "a.json"),
      scenarioJson("a", "/v1/wallet/check-transaction")
    );
    await fs.writeFile(
      path.join(dir, "mcp", "c.json"),
      scenarioJson("c", "/mcp/platform-maintenance/cq9")
    );
    await fs.writeFile(path.join(dir, "not-a-scenario.txt"), "ignore me");

    const result = await loadScenarioFiles(dir);

    // Sorted by full file path ("mcp/..." < "wallet/..."), not by id.
    expect(result.map((r) => r.scenario?.id)).toEqual(["c", "a", "b"]);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns an error entry (does not throw) when a scenario fails schema validation, naming the file", async () => {
    const dir = await makeTempDir();
    const file = path.join(dir, "broken.json");
    await fs.writeFile(file, JSON.stringify({ id: "broken" }));

    const result = await loadScenarioFiles(file);

    expect(result).toHaveLength(1);
    expect(result[0].scenario).toBeUndefined();
    expect(result[0].error).toMatch(/broken\.json/);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("isolates a broken file's schema error from the rest of the directory (code review #2)", async () => {
    const dir = await makeTempDir();
    await fs.writeFile(
      path.join(dir, "a-good.json"),
      scenarioJson("good", "/v1/wallet/check-transaction")
    );
    await fs.writeFile(path.join(dir, "b-broken.json"), JSON.stringify({ id: "broken" }));

    const result = await loadScenarioFiles(dir);

    expect(result).toHaveLength(2);
    expect(result[0].scenario?.id).toBe("good");
    expect(result[0].error).toBeUndefined();
    expect(result[1].scenario).toBeUndefined();
    expect(result[1].error).toMatch(/b-broken\.json/);

    await fs.rm(dir, { recursive: true, force: true });
  });
});
