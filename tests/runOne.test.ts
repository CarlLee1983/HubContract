import { describe, expect, it } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { runOne } from "../src/report/runOne";
import type { ScenarioDefinition, Fixture } from "../src/schema/scenario";
import type { VerifyResult } from "../src/runner";

function scenario(overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
  return {
    id: "deposit-hit",
    name: "deposit-hit",
    route: { method: "POST", path: "/v1/wallet/check-transaction" },
    request: { headers: {} },
    tags: ["wallet"],
    normalizers: [],
    ...overrides,
  } as ScenarioDefinition;
}

const goldenFixture: Fixture = {
  scenarioId: "deposit-hit",
  layer1_inboundResponse: {
    statusCode: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: { message: "OK" },
  },
};

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "hubcontract-run-one-"));
}

describe("Issue #12: runOne", () => {
  it("returns status 'recorded' (not 'passed') on a successful record run, and writes the fixture", async () => {
    const outDir = await makeTempDir();
    const runner = {
      record: async () => goldenFixture,
      verify: async (): Promise<VerifyResult> => {
        throw new Error("should not be called in record mode");
      },
    };

    const result = await runOne({ scenario: scenario(), mode: "record", runner, outDir });

    expect(result.status).toBe("recorded");
    expect(result.id).toBe("deposit-hit");
    expect(result.route).toEqual({ method: "POST", path: "/v1/wallet/check-transaction" });
    expect(result.tags).toEqual(["wallet"]);
    expect(result.differences).toEqual([]);

    const written = JSON.parse(
      await fs.readFile(path.join(outDir, "deposit-hit.fixture.json"), "utf-8")
    );
    expect(written).toEqual(goldenFixture);

    await fs.rm(outDir, { recursive: true, force: true });
  });

  it("returns status 'errored' (not throwing) when record() throws, isolating the failure", async () => {
    const outDir = await makeTempDir();
    const runner = {
      record: async () => {
        throw new Error("ECONNREFUSED");
      },
      verify: async (): Promise<VerifyResult> => {
        throw new Error("should not be called");
      },
    };

    const result = await runOne({ scenario: scenario(), mode: "record", runner, outDir });

    expect(result.status).toBe("errored");
    expect(result.error).toBe("ECONNREFUSED");
    expect(result.differences).toEqual([]);

    await fs.rm(outDir, { recursive: true, force: true });
  });

  it("returns status 'passed' when verify() reports no differences", async () => {
    const outDir = await makeTempDir();
    await fs.writeFile(
      path.join(outDir, "deposit-hit.fixture.json"),
      JSON.stringify(goldenFixture)
    );
    const runner = {
      record: async () => goldenFixture,
      verify: async (): Promise<VerifyResult> => ({
        scenarioId: "deposit-hit",
        passed: true,
        differences: [],
      }),
    };

    const result = await runOne({ scenario: scenario(), mode: "verify", runner, outDir });

    expect(result.status).toBe("passed");
    expect(result.differences).toEqual([]);

    await fs.rm(outDir, { recursive: true, force: true });
  });

  it("returns status 'failed' with differences when verify() reports a mismatch", async () => {
    const outDir = await makeTempDir();
    await fs.writeFile(
      path.join(outDir, "deposit-hit.fixture.json"),
      JSON.stringify(goldenFixture)
    );
    const runner = {
      record: async () => goldenFixture,
      verify: async (): Promise<VerifyResult> => ({
        scenarioId: "deposit-hit",
        passed: false,
        differences: [
          { layer: "inbound_response", path: "body.message", expected: "OK", actual: "FAIL" },
        ],
      }),
    };

    const result = await runOne({ scenario: scenario(), mode: "verify", runner, outDir });

    expect(result.status).toBe("failed");
    expect(result.differences).toHaveLength(1);

    await fs.rm(outDir, { recursive: true, force: true });
  });

  it("returns status 'errored' when the golden fixture file is missing", async () => {
    const outDir = await makeTempDir();
    const runner = {
      record: async () => goldenFixture,
      verify: async (): Promise<VerifyResult> => ({
        scenarioId: "deposit-hit",
        passed: true,
        differences: [],
      }),
    };

    const result = await runOne({ scenario: scenario(), mode: "verify", runner, outDir });

    expect(result.status).toBe("errored");
    expect(result.error).toBeDefined();

    await fs.rm(outDir, { recursive: true, force: true });
  });
});
