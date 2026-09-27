import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { ContractRunner } from "../src/runner";
import { LegacyTargetAdapter } from "../src/target/legacyAdapter";
import { ActionFixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";
import { resetEnvironment } from "../src/env/reset";
import { config } from "../src/config";
import newVisitor from "../scenarios/internal/service-issue-new-visitor.json";
import existingIssue from "../scenarios/internal/service-issue-existing-issue.json";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";

const scenarios = [newVisitor, existingIssue].map((source) => ScenarioDefinitionSchema.parse(source));

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

it("submits the service issue action without contracting its controller response", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const replies = [
    new Response("history", { status: 200, headers: {
      "Set-Cookie": "XSRF-TOKEN=csrf%3D; Path=/",
    } }),
    new Response("controller error", { status: 500 }),
  ];
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return replies.shift()!;
  }) as typeof fetch;

  await new LegacyTargetAdapter().executeAction(scenarios[0].action!, `http://localhost:${config.legacyPort}`,
    { service_issues: [], user_guests: [] });

  expect(calls.map((call) => new URL(call.url).pathname)).toEqual(["/service/issue/history", "/service/issue/"]);
  expect(new Headers(calls[1].init.headers).get("X-XSRF-TOKEN")).toBe("csrf=");
  expect(calls[1].init.body).toBe("type=1");
});

it("rejects a CSRF response before comparing an unchanged final state", async () => {
  const replies = [
    new Response("history", { status: 200, headers: { "Set-Cookie": "XSRF-TOKEN=csrf; Path=/" } }),
    new Response("expired session", { status: 419 }),
  ];
  globalThis.fetch = (async () => replies.shift()!) as typeof fetch;

  await expect(new LegacyTargetAdapter().executeAction(scenarios[0].action!,
    `http://localhost:${config.legacyPort}`, { service_issues: [], user_guests: [] }))
    .rejects.toThrow("Legacy service issue CSRF precondition failed with HTTP 419");
});

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("Legacy service issue action (#26)", () => {
  const runner = new ContractRunner({
    baseUrl: config.baseUrl,
    stubUrl: config.stub.baseUrl,
    targetAdapter: new LegacyTargetAdapter(),
  });
  afterAll(async () => { await runner.close(); });

  for (const scenario of scenarios) {
    it(`records repeatable final state and reports a missing row for ${scenario.id}`, async () => {
      await resetEnvironment();
      const first = await runner.record(scenario);
      expect(first.layer1_inboundResponse).toBeUndefined();
      expect(first.layer2_dbState?.before).toEqual(first.layer2_dbState?.after);
      expect(first.layer2_dbState?.before.service_issues).toHaveLength(1);
      expect(first.layer2_dbState?.before.user_guests).toHaveLength(1);
      expect(first.layer2_dbState?.before.activity_log).toEqual([]);
      expect(first.layer4_sharedResources?.mongo?.newDocuments).toEqual({});

      await resetEnvironment();
      expect(await runner.record(scenario)).toEqual(first);
      await resetEnvironment();
      expect((await runner.verify(scenario, first)).differences).toEqual([]);

      const tampered = ActionFixtureSchema.parse(structuredClone(first));
      tampered.layer2_dbState.after.service_issues.push({ id: 999, issueable_type: "App\\Models\\UserGuest" });
      await resetEnvironment();
      const result = await runner.verify(scenario, tampered);
      expect(result.passed).toBe(false);
      expect(result.differences).toContainEqual(expect.objectContaining({
        layer: "db_state", path: "after.service_issues.1",
      }));
    }, 120000);
  }
});
