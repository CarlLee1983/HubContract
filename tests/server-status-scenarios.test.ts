import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";
import { ContractRunner } from "../src/runner";
import { FixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";

const names = ["status", "status-unvalidated-params", "status-unknown-station"];

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("Issue #14: server status contract", () => {
  const runner = new ContractRunner({ baseUrl: config.baseUrl, stubUrl: config.stub.baseUrl });
  beforeEach(resetEnvironment, config.resetTimeoutMs + 10_000);
  afterAll(() => runner.close());

  for (const name of names) {
    it(`verifies ${name} against its recorded Legacy fixture`, async () => {
      const scenario = ScenarioDefinitionSchema.parse(JSON.parse(await fs.readFile(path.join(__dirname, "../scenarios/server", `${name}.json`), "utf8")));
      const fixture = FixtureSchema.parse(JSON.parse(await fs.readFile(path.join(__dirname, "../fixtures", `server-${name}.fixture.json`), "utf8")));
      const result = await runner.verify(scenario, fixture);
      expect(result.differences).toEqual([]);
      expect(result.passed).toBe(true);
      if (name === "status-unknown-station") {
        expect(fixture.layer1_inboundResponse?.statusCode).toBe(500);
        expect(fixture.layer1_inboundResponse?.body.message).toBe("Station not found");
      } else {
        expect(fixture.layer1_inboundResponse?.statusCode).toBe(200);
        expect(fixture.layer1_inboundResponse?.body).toEqual({ message: "OK" });
      }
    }, 30_000);
  }
});
