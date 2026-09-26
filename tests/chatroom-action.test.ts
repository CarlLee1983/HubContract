import { afterAll, describe, expect, it } from "bun:test";
import { ContractRunner } from "../src/runner";
import { LegacyTargetAdapter } from "../src/target/legacyAdapter";
import { ScenarioDefinitionSchema, ActionFixtureSchema } from "../src/schema/scenario";
import { resetEnvironment } from "../src/env/reset";
import { config } from "../src/config";
import { RUNS_AGAINST_RECORDING_ENV } from "./helpers/integrationGate";
import join from "../scenarios/internal/chatroom-admin-join.json";
import close from "../scenarios/internal/chatroom-admin-close.json";
import adminMessage from "../scenarios/internal/chatroom-admin-message.json";
import serviceMessage from "../scenarios/internal/chatroom-service-message.json";
import joinFixture from "../fixtures/chatroom-admin-join.fixture.json";
import closeFixture from "../fixtures/chatroom-admin-close.fixture.json";
import adminMessageFixture from "../fixtures/chatroom-admin-message.fixture.json";
import serviceMessageFixture from "../fixtures/chatroom-service-message.fixture.json";

const cases = [
  { json: join, fixture: joinFixture, table: "service_issues_administer_map", field: "administer_id", value: 1 },
  { json: close, fixture: closeFixture, table: "service_issues", field: "closed_by_administer_id", value: 1 },
  { json: adminMessage, fixture: adminMessageFixture, table: "service_issues", field: "last_message_id", value: 1 },
  { json: serviceMessage, fixture: serviceMessageFixture, table: "service_issues", field: "last_message_id", value: 1 },
] as const;

describe("Chatroom action scenario declarations (#24)", () => {
  for (const testCase of cases) {
    it(`${testCase.json.id} scopes activity and declares only relevant shared probes`, () => {
      const scenario = ScenarioDefinitionSchema.parse(testCase.json);
      const activity = scenario.dbProbe?.queries.find((query) => query.name === "activity_log");
      expect(activity?.sql).toContain("WHERE subject_type IN (?, ?)");
      expect(activity?.params).toEqual(["App\\Models\\ServiceIssue", "App\\Models\\ChatRoomMessage"]);
      expect(scenario.redisProbe?.keys).toEqual([]);
      expect(scenario.mongoProbe?.pattern).toBe("httplog_*");
      expect(scenario.dbProbe?.queries.find((query) => query.name === "service_issues")?.sql)
        .toContain("last_message_id, closed_at FROM service_issues");
    });
  }
});

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("Legacy chatroom action contract (#24)", () => {
  const runner = new ContractRunner({ baseUrl: config.baseUrl, stubUrl: config.stub.baseUrl, targetAdapter: new LegacyTargetAdapter() });
  afterAll(async () => { await runner.close(); });

  for (const testCase of cases) {
    it(`${testCase.json.id} records twice, verifies, and reports a field diff`, async () => {
      const scenario = ScenarioDefinitionSchema.parse(testCase.json);
      await resetEnvironment();
      const first = await runner.record(scenario);
      expect(first).toEqual(ActionFixtureSchema.parse(testCase.fixture));
      expect(first.layer1_inboundResponse).toBeUndefined();
      expect(first.layer3_outboundCalls).toBeUndefined();
      expect(first.layer2_dbState?.before.activity_log).toEqual([]);
      expect(first.layer2_dbState?.after.activity_log).toEqual([]);
      expect(first.layer2_dbState?.after[testCase.table][0][testCase.field]).toBe(testCase.value);
      expect(first.layer4_sharedResources?.redis).toBeUndefined();
      expect(first.layer4_sharedResources?.mongo).toBeDefined();
      if (scenario.action?.name === "chatroom.close") {
        expect(first.layer2_dbState?.after.service_issues[0].closed_at).toBe("<RECENT_SQL_DATETIME>");
      }

      await resetEnvironment();
      expect(await runner.record(scenario)).toEqual(first);

      await resetEnvironment();
      expect((await runner.verify(scenario, first)).differences).toEqual([]);

      const tampered = ActionFixtureSchema.parse(structuredClone(first));
      tampered.layer2_dbState!.after[testCase.table][0][testCase.field] = 999;
      await resetEnvironment();
      const result = await runner.verify(scenario, tampered);
      expect(result.passed).toBe(false);
      expect(result.differences).toContainEqual(expect.objectContaining({
        layer: "db_state", path: `after.${testCase.table}.0.${testCase.field}`, expected: 999, actual: testCase.value,
      }));
    }, 180000);
  }
});
