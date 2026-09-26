import { describe, expect, it } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { runScenarios } from "../src/report/runScenarios";
import type { ScenarioDefinition, Fixture } from "../src/schema/scenario";
import type { VerifyResult } from "../src/runner";

function scenario(id: string): ScenarioDefinition {
  return {
    id,
    name: id,
    route: { method: "POST", path: "/v1/wallet/check-transaction" },
    request: { headers: {} },
    tags: [],
    normalizers: [],
  } as ScenarioDefinition;
}

const fixture: Fixture = {
  scenarioId: "x",
  layer1_inboundResponse: {
    statusCode: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: {},
  },
};

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "hubcontract-run-scenarios-"));
}

describe("Issue #12: runScenarios", () => {
  it("resets before every scenario when skipReset is false (parent spec: 每個情境執行前都重置)", async () => {
    const outDir = await makeTempDir();
    const resetCalls: string[] = [];
    const runner = {
      record: async () => fixture,
      verify: async (): Promise<VerifyResult> => ({ scenarioId: "x", passed: true, differences: [] }),
    };

    const outcomes = await runScenarios({
      scenarios: [scenario("a"), scenario("b")],
      mode: "record",
      runner,
      outDir,
      skipReset: false,
      resetEnvironment: async () => {
        resetCalls.push("reset");
      },
    });

    expect(resetCalls).toHaveLength(2);
    expect(outcomes.map((o) => o.status)).toEqual(["recorded", "recorded"]);

    await fs.rm(outDir, { recursive: true, force: true });
  });

  it("never resets when skipReset is true", async () => {
    const outDir = await makeTempDir();
    const resetCalls: string[] = [];
    const runner = {
      record: async () => fixture,
      verify: async (): Promise<VerifyResult> => ({ scenarioId: "x", passed: true, differences: [] }),
    };

    await runScenarios({
      scenarios: [scenario("a")],
      mode: "record",
      runner,
      outDir,
      skipReset: true,
      resetEnvironment: async () => {
        resetCalls.push("reset");
      },
    });

    expect(resetCalls).toHaveLength(0);

    await fs.rm(outDir, { recursive: true, force: true });
  });

  it("isolates a reset failure to that scenario and still runs the rest", async () => {
    const outDir = await makeTempDir();
    let calls = 0;
    const runner = {
      record: async () => fixture,
      verify: async (): Promise<VerifyResult> => ({ scenarioId: "x", passed: true, differences: [] }),
    };

    const outcomes = await runScenarios({
      scenarios: [scenario("a"), scenario("b")],
      mode: "record",
      runner,
      outDir,
      skipReset: false,
      resetEnvironment: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("env-reset.sh failed");
        }
      },
    });

    expect(outcomes).toHaveLength(2);
    expect(outcomes[0].status).toBe("errored");
    expect(outcomes[0].error).toBe("env-reset.sh failed");
    expect(outcomes[1].status).toBe("recorded");

    await fs.rm(outDir, { recursive: true, force: true });
  });

  it("isolates a scenario's own run failure without aborting the rest of the batch", async () => {
    const outDir = await makeTempDir();
    let calls = 0;
    const runner = {
      record: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("ECONNREFUSED");
        }
        return fixture;
      },
      verify: async (): Promise<VerifyResult> => ({ scenarioId: "x", passed: true, differences: [] }),
    };

    const outcomes = await runScenarios({
      scenarios: [scenario("a"), scenario("b")],
      mode: "record",
      runner,
      outDir,
      skipReset: true,
      resetEnvironment: async () => {},
    });

    expect(outcomes.map((o) => o.status)).toEqual(["errored", "recorded"]);

    await fs.rm(outDir, { recursive: true, force: true });
  });

  it("does not reset or run another scenario after queue drain fails", async () => {
    const outDir = await makeTempDir();
    let safe = true;
    let resets = 0;
    let runs = 0;
    const runner = {
      canResetEnvironment: () => safe,
      record: async () => {
        runs++;
        safe = false;
        throw new Error("Queue drain timed out after 10ms: HubWalletSync reserved=1");
      },
      verify: async (): Promise<VerifyResult> => ({ scenarioId: "x", passed: true, differences: [] }),
    };

    const outcomes = await runScenarios({
      scenarios: [scenario("a"), scenario("b")],
      mode: "record",
      runner,
      outDir,
      skipReset: false,
      resetEnvironment: async () => { resets++; },
    });

    expect(resets).toBe(1);
    expect(runs).toBe(1);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["errored", "errored"]);
    expect(outcomes[1].error).toContain("workers may still write");
    await fs.rm(outDir, { recursive: true, force: true });
  });
});
