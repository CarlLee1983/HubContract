import { describe, expect, it } from "bun:test";
import { ContractRunner, type TargetAdapter } from "../src/runner";
import {
  ActionScenarioSchema, FixtureSchema, InboundScenarioSchema, ScenarioDefinitionSchema,
} from "../src/schema/scenario";

const actionScenario = ActionScenarioSchema.parse({
  id: "platform-activate",
  name: "Activate platform",
  action: { name: "platformGameType.setActive", parameters: { platformId: 7, platformActive: true, gameTypeId: 1, active: true } },
  dbProbe: { queries: [{ name: "platform", sql: "SELECT active FROM platforms WHERE id = ?", params: [7] }] },
});

function mockDb(runner: ContractRunner, states: unknown[]) {
  let index = 0;
  (runner as any).dbProbe.capture = async () => states[index++];
}

describe("internal action scenarios", () => {
  it("requires a DB probe and rejects HTTP fields", () => {
    expect(ScenarioDefinitionSchema.parse(actionScenario).action).toEqual(actionScenario.action);
    expect(ActionScenarioSchema.safeParse({ ...actionScenario, dbProbe: undefined }).success).toBe(false);
    expect(ActionScenarioSchema.safeParse({ ...actionScenario, dbProbe: { queries: [] } }).success).toBe(false);
    expect(ActionScenarioSchema.safeParse({ ...actionScenario, route: { method: "POST", path: "/x" } }).success).toBe(false);
  });

  it("captures state around an injected action and omits the inbound response", async () => {
    const calls: string[] = [];
    const adapter: TargetAdapter = {
      executeAction: async (action, baseUrl, _dbBefore, dbConfig) => {
        calls.push(`${action.name}:${action.parameters.platformId}:${baseUrl}:${dbConfig?.database}`);
      },
    };
    const runner = new ContractRunner({ baseUrl: "http://target/", dbConfig: { database: "other_recording" }, targetAdapter: adapter });
    mockDb(runner, [{ platform: [{ active: 0 }] }, { platform: [{ active: 1 }] }]);
    try {
      const fixture = await runner.record(actionScenario);
      expect(calls).toEqual(["platformGameType.setActive:7:http://target:other_recording"]);
      expect(fixture.layer1_inboundResponse).toBeUndefined();
      expect(fixture.layer2_dbState).toEqual({
        before: { platform: [{ active: 0 }] },
        after: { platform: [{ active: 1 }] },
      });
      expect(FixtureSchema.parse(fixture)).toEqual(fixture);
    } finally {
      await runner.close();
    }
  });

  it("captures declared Redis state before and after the action", async () => {
    const calls: string[] = [];
    const scenario = ActionScenarioSchema.parse({
      ...actionScenario,
      redisProbe: { keys: [{ pattern: "platform:7" }] },
    });
    const runner = new ContractRunner({
      baseUrl: "http://target",
      targetAdapter: { executeAction: async () => { calls.push("action"); } },
    });
    (runner as any).dbProbe.capture = async () => { calls.push("db"); return {}; };
    (runner as any).redisProbe.capture = async () => {
      calls.push("redis");
      return { "platform:7": null };
    };
    try {
      const fixture = await runner.record(scenario);
      expect(calls).toEqual(["db", "redis", "action", "db", "redis"]);
      expect(fixture.layer4_sharedResources?.redis).toEqual({
        before: { "platform:7": null }, after: { "platform:7": null },
      });
    } finally {
      await runner.close();
    }
  });

  it("verifies only captured DB layers for actions", async () => {
    const runner = new ContractRunner({
      baseUrl: "http://target",
      targetAdapter: { executeAction: async () => {} },
    });
    mockDb(runner, [{ platform: [{ active: 0 }] }, { platform: [{ active: 1 }] }]);
    try {
      const result = await runner.verify(actionScenario, {
        scenarioId: actionScenario.id,
        layer2_dbState: {
          before: { platform: [{ active: 0 }] },
          after: { platform: [{ active: 0 }] },
        },
      });
      expect(result.passed).toBe(false);
      expect(result.differences.some((difference) => difference.path.includes("platform"))).toBe(true);
    } finally {
      await runner.close();
    }
  });

  it("fails clearly without an adapter or when the action throws", async () => {
    const withoutAdapter = new ContractRunner({ baseUrl: "http://target" });
    mockDb(withoutAdapter, [{}]);
    try {
      await expect(withoutAdapter.record(actionScenario)).rejects.toThrow("requires a target adapter");
    } finally {
      await withoutAdapter.close();
    }

    const failing = new ContractRunner({
      baseUrl: "http://target",
      targetAdapter: { executeAction: async () => { throw new Error("target unavailable"); } },
    });
    mockDb(failing, [{}]);
    try {
      await expect(failing.record(actionScenario)).rejects.toThrow('Action "platformGameType.setActive" failed');
    } finally {
      await failing.close();
    }
  });

  it("preserves inbound response recording", async () => {
    const scenario = InboundScenarioSchema.parse({
      id: "inbound", name: "Inbound", route: { method: "GET", path: "/status" }, request: {},
    });
    const runner = new ContractRunner({ baseUrl: "http://target" });
    const previousFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "content-type": "application/json" },
    }), { preconnect: previousFetch.preconnect });
    try {
      const fixture = await runner.record(scenario);
      expect(fixture.layer1_inboundResponse.statusCode).toBe(200);
      expect(fixture.layer1_inboundResponse.body).toEqual({ ok: true });
    } finally {
      globalThis.fetch = previousFetch;
      await runner.close();
    }
  });
});
