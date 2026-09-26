import { describe, expect, it } from "bun:test";
import { ContractRunner } from "../src/runner";
import { ScenarioDefinitionSchema } from "../src/schema/scenario";

describe("ContractRunner batch safety", () => {
  it("runs inbound setup before the baseline probe and fails closed", async () => {
    const events: string[] = [];
    const runner = new ContractRunner({
      baseUrl: "http://127.0.0.1:1",
      stubUrl: "http://127.0.0.1:2",
    });
    const internal = runner as any;
    internal.dbProbe.setup = async () => { events.push("setup"); };
    internal.dbProbe.capture = async () => { events.push("probe"); throw new Error("stop after probe"); };
    const scenario = ScenarioDefinitionSchema.parse({
      id: "deposit-setup", name: "Deposit setup",
      route: { method: "POST", path: "/v1/wallet/deposit" }, request: {},
      setup: { statements: [{ name: "second-wallet", sql: "SELECT 1", params: [] }] },
    });
    try {
      await expect(runner.record(scenario)).rejects.toThrow("stop after probe");
      expect(events).toEqual(["setup", "probe"]);
    } finally {
      await runner.close();
    }
  });

  it("passes the probe DB configuration to schedule setup", async () => {
    const dbConfig = { host: "127.0.0.1", port: 33067, database: "isolated" };
    let received: unknown;
    const runner = new ContractRunner({
      baseUrl: "http://127.0.0.1:1",
      stubUrl: "http://127.0.0.1:2",
      dbConfig,
      targetAdapter: {
        triggerSchedule: async () => {},
        setupSchedule: async (_statements, config) => {
          received = config;
          throw new Error("stop after setup");
        },
      },
    });
    const scenario = ScenarioDefinitionSchema.parse({
      id: "schedule-setup", name: "Schedule setup",
      trigger: { kind: "schedule", name: "remittance.retry" },
      setup: { statements: [{ name: "seed", sql: "SELECT 1", params: [] }] },
    });
    try {
      await expect(runner.record(scenario)).rejects.toThrow("stop after setup");
      expect(received).toEqual(dbConfig);
    } finally {
      await runner.close();
    }
  });

  it("blocks later resets when schedule dispatch fails after starting", async () => {
    const runner = new ContractRunner({
      baseUrl: "http://127.0.0.1:1",
      stubUrl: "http://127.0.0.1:2",
      targetAdapter: { triggerSchedule: async () => { throw new Error("dispatch lost"); } },
    });
    const internal = runner as any;
    internal.dbProbe.capture = async () => ({});
    internal.redisProbe.capture = async () => ({});
    internal.mongoProbe.snapshot = async () => ({});
    internal.stubClient.reset = async () => {};
    internal.stubClient.loadScript = async () => {};
    const scenario = ScenarioDefinitionSchema.parse({
      id: "schedule-failure", name: "Schedule failure",
      trigger: { kind: "schedule", name: "remittance.retry" },
    });

    try {
      await expect(runner.record(scenario)).rejects.toThrow("dispatch lost");
      expect(runner.canResetEnvironment()).toBe(false);
    } finally {
      await runner.close();
    }
  });

  it("blocks later resets when an HTTP request fails after dispatch", async () => {
    const runner = new ContractRunner({ baseUrl: "http://127.0.0.1:1", stubUrl: "http://127.0.0.1:2" });
    const internal = runner as any;
    internal.dbProbe.capture = async () => ({});
    internal.redisProbe.capture = async () => ({});
    internal.mongoProbe.snapshot = async () => ({});
    internal.stubClient.reset = async () => {};
    internal.stubClient.loadScript = async () => {};
    internal.executeRequest = async () => { throw new Error("connection lost"); };
    const scenario = ScenarioDefinitionSchema.parse({
      id: "request-failure", name: "Request failure",
      route: { method: "POST", path: "/v1/wallet/deposit" }, request: {},
    });

    try {
      await expect(runner.record(scenario)).rejects.toThrow("connection lost");
      expect(runner.canResetEnvironment()).toBe(false);
    } finally {
      await runner.close();
    }
  });
});
