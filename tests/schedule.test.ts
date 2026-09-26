import { describe, expect, it } from "bun:test";
import fs from "fs/promises";
import { LegacyTargetAdapter, runCommand } from "../src/target/legacyAdapter";
import { ScenarioDefinitionSchema, FixtureSchema, assertFixtureMatchesScenario } from "../src/schema/scenario";
import { ContractRunner } from "../src/runner";
import { resetEnvironment } from "../src/env/reset";
import { config } from "../src/config";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";

const rawScenario = JSON.parse(await fs.readFile("scenarios/schedule/remittance-retry.json", "utf8"));

it("keeps the scenario schedule name independent of Artisan and rejects ambiguous triggers", () => {
  const scenario = ScenarioDefinitionSchema.parse(rawScenario);
  expect(scenario.trigger).toEqual({ kind: "schedule", name: "remittance.retry" });
  expect(scenario.route).toBeUndefined();
  expect(ScenarioDefinitionSchema.safeParse({ ...rawScenario, route: { method: "GET", path: "/" } }).success).toBe(false);
  expect(ScenarioDefinitionSchema.safeParse({ ...rawScenario, trigger: undefined }).success).toBe(false);
});

it("maps exactly one neutral schedule to one Legacy argv invocation", async () => {
  const calls: string[][] = [];
  const adapter = new LegacyTargetAdapter(async (argv) => { calls.push(argv); });
  await adapter.triggerSchedule("remittance.retry");
  expect(calls).toEqual([["docker", "compose", "exec", "-T", "legacy-app", "php", "artisan", "remittance:retry"]]);
  await expect(adapter.triggerSchedule("schedule:run")).rejects.toThrow("Unsupported Legacy schedule");
});

it("bounds failed and stuck target commands", async () => {
  await expect(runCommand([process.execPath, "-e", "process.exit(7)"])).rejects.toThrow("exit 7");
  await expect(runCommand([process.execPath, "-e", "await new Promise(() => {})"], 100)).rejects.toThrow("timed out");
});

it("requires HTTP response fixtures and forbids them for schedules", () => {
  const schedule = ScenarioDefinitionSchema.parse(rawScenario);
  const http = ScenarioDefinitionSchema.parse({
    id: "http", name: "HTTP", route: { method: "GET", path: "/status" }, request: { headers: {} },
  });
  expect(() => assertFixtureMatchesScenario(http, { scenarioId: "http" })).toThrow("requires layer1");
  expect(() => assertFixtureMatchesScenario(schedule, {
    scenarioId: schedule.id,
    layer1_inboundResponse: { statusCode: 200, statusText: "OK", headers: {}, body: {} },
  })).toThrow("must not declare layer1");
  expect(() => assertFixtureMatchesScenario(schedule, { scenarioId: schedule.id }))
    .toThrow("requires layer3_outboundCalls");
  expect(() => assertFixtureMatchesScenario(schedule, {
    scenarioId: schedule.id,
    layer3_outboundCalls: { calls: [] },
  })).not.toThrow();
});

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("Legacy scheduled remittance", () => {
  it("records deterministically and verifies DB and outbound differences", async () => {
    const scenario = ScenarioDefinitionSchema.parse(rawScenario);
    const golden = FixtureSchema.parse(JSON.parse(await fs.readFile("fixtures/remittance-retry.fixture.json", "utf8")));
    const runner = new ContractRunner({ baseUrl: config.baseUrl, stubUrl: config.stub.baseUrl, targetAdapter: new LegacyTargetAdapter() });
    try {
      await resetEnvironment({ timeoutMs: 60000 });
      const first = await runner.record(scenario);
      expect(first).toEqual(golden);
      expect(first.layer2_dbState?.after.activity_log).toHaveLength(4);
      await resetEnvironment({ timeoutMs: 60000 });
      expect(await runner.record(scenario)).toEqual(first);
      await resetEnvironment({ timeoutMs: 60000 });
      expect((await runner.verify(scenario, golden)).passed).toBe(true);

      const changedDb = structuredClone(golden);
      changedDb.layer2_dbState!.after.activity_log[3].new_status = "wrong";
      await resetEnvironment({ timeoutMs: 60000 });
      const dbResult = await runner.verify(scenario, changedDb);
      expect(dbResult.passed).toBe(false);
      expect(dbResult.differences.some((difference) => difference.layer === "db_state" && difference.path.includes("activity_log"))).toBe(true);

      const changedOutbound = structuredClone(golden);
      changedOutbound.layer3_outboundCalls!.calls = [];
      await resetEnvironment({ timeoutMs: 60000 });
      const outboundResult = await runner.verify(scenario, changedOutbound);
      expect(outboundResult.passed).toBe(false);
      expect(outboundResult.differences.some((difference) => difference.layer === "outbound_calls" && difference.path.includes("calls"))).toBe(true);
    } finally {
      await runner.close();
    }
  }, 240000);
});
