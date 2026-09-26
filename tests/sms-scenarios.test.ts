import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { ContractRunner } from "../src/runner";
import { LegacyPreconditionAdapter } from "../src/target/legacyPreconditions";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";
import { FixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";

const names = [
  "amount-abo-send-provider-failure",
  "amount-abo-send-success",
  "amount-asmsc-provider-failure",
  "amount-asmsc-success",
  "amount-provider-failure",
  "amount-signature-failed",
  "amount-success",
  "amount-unknown-station",
  "amount-validation",
  "index",
  "index-signature-failed",
  "index-unknown-station",
  "index-validation",
  "send-asmsc-sender-id",
  "send-empty-balance",
  "send-inactive",
  "send-locked",
  "send-signature-failed",
  "send-unknown-station",
  "send-validation",
  "send-without-currency",
  "update-invalid-settings",
  "update-mass-assignment",
  "update-signature-failed",
  "update-unknown-station",
  "update-validation",
];

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("Issue #18: SMS Legacy contract", () => {
  const runner = new ContractRunner({ baseUrl: config.baseUrl, stubUrl: config.stub.baseUrl, preconditionAdapter: new LegacyPreconditionAdapter() });
  beforeEach(resetEnvironment, config.resetTimeoutMs + 10000);
  afterAll(() => runner.close());

  for (const name of names) {
    it(`verifies ${name} against the recorded Legacy fixture`, async () => {
      const scenario = ScenarioDefinitionSchema.parse(JSON.parse(await fs.readFile(path.join(__dirname, "../scenarios/sms", `${name}.json`), "utf8")));
      const fixture = FixtureSchema.parse(JSON.parse(await fs.readFile(path.join(__dirname, "../fixtures", `sms-${name}.fixture.json`), "utf8")));
      const result = await runner.verify(scenario, fixture);
      expect(result.differences).toEqual([]);
      expect(result.passed).toBe(true);

      if (name === "index") {
        expect(fixture.layer1_inboundResponse!.body.data.some((row: { active: number }) => row.active === 0)).toBe(true);
        expect(fixture.layer1_inboundResponse!.body.data[0].settings.appsecret).toBe("synthetic_appsecret");
      }
      if (name === "update-mass-assignment") {
        const updated = fixture.layer2_dbState?.after.sms.find((row: { id: number }) => row.id === 1);
        expect(updated.active).toBe(0);
        expect(updated.amount).toBe(42);
      }
      if (name === "send-inactive" || name === "send-asmsc-sender-id" || name === "send-without-currency") {
        expect(fixture.layer1_inboundResponse!.statusCode).toBe(500);
      }
      if (name === "send-asmsc-sender-id") {
        expect(fixture.layer3_outboundCalls?.calls.map((call) => call.path)).toEqual(["/api/GetSenderIDList"]);
      }
      if (name === "send-locked") {
        expect(fixture.layer1_inboundResponse!.body.message).toContain("Unable to resend SMS");
        expect(fixture.layer3_outboundCalls?.calls ?? []).toEqual([]);
      }
      if (name.endsWith("validation") || name.endsWith("signature-failed")) {
        expect(fixture.layer1_inboundResponse!.statusCode).toBe(422);
      }
      if (name.endsWith("unknown-station")) {
        expect(fixture.layer1_inboundResponse!.statusCode).toBe(500);
      }
      if (name === "amount-provider-failure" || name.endsWith("provider-failure")) {
        expect(fixture.layer1_inboundResponse!.body.data.amount).toBe(0);
      }
      if (name === "amount-asmsc-success" || name === "amount-abo-send-success") {
        expect(fixture.layer1_inboundResponse!.body.data.amount).toBe(9);
      }
      if (name === "amount-success") {
        expect(fixture.layer1_inboundResponse!.body.data.amount).toBe(17);
      }
    }, 30000);
  }
});
