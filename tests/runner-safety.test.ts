import { describe, expect, it } from "bun:test";
import { ContractRunner } from "../src/runner";
import { ScenarioDefinitionSchema } from "../src/schema/scenario";

describe("ContractRunner batch safety", () => {
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
