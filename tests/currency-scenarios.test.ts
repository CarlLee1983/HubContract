import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { ContractRunner } from "../src/runner";
import { LegacyPreconditionAdapter } from "../src/target/legacyPreconditions";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";
import { FixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";
import { expectRecordedFixture } from "./helpers/recordedFixture";

const names = [
  "index",
  "index-inactive-station-currency",
  "index-validation",
  "index-signature-failed",
  "index-unknown-station",
  "exchange-rate-list",
  "exchange-rate-list-validation",
  "exchange-rate-list-signature-failed",
  "exchange-rate-list-unknown-station",
  "exchange-rate-show",
  "exchange-rate-show-validation",
  "exchange-rate-show-signature-failed",
  "exchange-rate-show-unknown-station",
  "exchange-rate-show-unknown-currency",
  "exchange-rate-show-inactive-currency",
] as const;

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV || process.env.HUB_SEED === "snapshot")("Issue #14: currency Legacy contract", () => {
  const runner = new ContractRunner({ baseUrl: config.baseUrl, stubUrl: config.stub.baseUrl, preconditionAdapter: new LegacyPreconditionAdapter() });
  beforeEach(resetEnvironment, config.resetTimeoutMs + 10000);
  afterAll(() => runner.close());

  for (const name of names) {
    it(`verifies ${name} against the recorded Legacy fixture`, async () => {
      const scenario = ScenarioDefinitionSchema.parse(JSON.parse(await fs.readFile(path.join(__dirname, "../scenarios/currency", `${name}.json`), "utf8")));
      const fixture = FixtureSchema.parse(JSON.parse(await fs.readFile(path.join(__dirname, "../fixtures", `currency-${name}.fixture.json`), "utf8")));
      const recorded = await runner.record(scenario);
      expectRecordedFixture(recorded, fixture);
      await resetEnvironment();
      const result = await runner.verify(scenario, fixture);
      expect(result.differences).toEqual([]);
      expect(result.passed).toBe(true);

      const response = fixture.layer1_inboundResponse!;
      if (name.endsWith("validation") || name.endsWith("signature-failed")) {
        expect(response.statusCode).toBe(422);
      }
      if (name.endsWith("unknown-station")) {
        expect(response.statusCode).toBe(500);
      }
      if (name === "index") {
        expect(response.statusCode).toBe(200);
        expect(response.body.data.map((row: { currency: string }) => row.currency)).toEqual(["TWD", "USD", "PHP"]);
      }
      if (name === "index-inactive-station-currency") {
        expect(response.statusCode).toBe(200);
        expect(response.body.data.map((row: { currency: string }) => row.currency)).toEqual(["TWD"]);
        expect(fixture.layer2_dbState?.before.station_currencies.map((row: { currency: string; status: number }) => ({ currency: row.currency, status: row.status }))).toEqual([{ currency: "TWD", status: 0 }]);
      }
      if (name === "exchange-rate-list") {
        expect(response.statusCode).toBe(200);
        expect(response.body.data.map((row: { name: string }) => row.name)).toEqual(["TWD", "PHP"]);
      }
      if (name === "exchange-rate-show") {
        expect(response.body.data.name).toBe("TWD");
        expect(response.body.data.rate).toBe("32.500000");
      }
      if (name === "exchange-rate-show-inactive-currency") {
        expect(response.body.data.name).toBe("USD");
      }
      if (name === "exchange-rate-show-unknown-currency") {
        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe("Currency not found");
      }
    }, config.resetTimeoutMs * 2 + 30_000);
  }

  it("records exchange rate list identically after a reset", async () => {
    const scenario = ScenarioDefinitionSchema.parse(JSON.parse(await fs.readFile(path.join(__dirname, "../scenarios/currency/exchange-rate-list.json"), "utf8")));
    const first = await runner.record(scenario);
    await resetEnvironment();
    expect(await runner.record(scenario)).toEqual(first);
  }, config.resetTimeoutMs * 2 + 30_000);
});
