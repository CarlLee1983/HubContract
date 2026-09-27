import { describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { compareMongoDocuments } from "../src/comparator/comparator";
import { FixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";

const root = path.join(import.meta.dir, "..");
const pgCollections: Record<string, string> = {
  "/pg/v3/Player/Create": "httplog_create_account",
  "/pg/Cash/v3/GetPlayerWallet": "httplog_find_account",
  "/pg/Cash/v3/TransferIn": "httplog_deposit",
  "/pg/Cash/v3/TransferOut": "httplog_withdraw",
  "/external-game-launcher/api/v1/GetLaunchURLHTML": "httplog_launch_game",
};

describe("v1 provider HTTP log contracts", () => {
  for (const family of ["game", "player", "sms"]) {
    it(`${family} records exactly the selected collections and early rejection absences`, async () => {
      for (const filename of await fs.readdir(path.join(root, "scenarios", family))) {
        const scenario = ScenarioDefinitionSchema.parse(JSON.parse(
          await fs.readFile(path.join(root, "scenarios", family, filename), "utf8")
        ));
        if (!scenario.mongoProbe) continue;

        const outboundPaths = scenario.stub?.script.matchers.map((matcher) => matcher.path) ?? [];
        const expectedCollections = family === "game"
          ? outboundPaths.length > 0
            ? [...new Set(outboundPaths.map((outboundPath) => pgCollections[outboundPath]))].sort()
            : ["httplog_create_account", "httplog_deposit", "httplog_launch_game"]
          : family === "player"
            ? [filename.includes("create-") ? "httplog_create_account" : "httplog_find_account"]
            : [filename.startsWith("amount-") ? "httplog_sms_amount" : "httplog_sms_send"];
        expect([...scenario.mongoProbe.collections!].sort()).toEqual(expectedCollections);

        const fixture = FixtureSchema.parse(JSON.parse(
          await fs.readFile(path.join(root, "fixtures", `${scenario.id}.fixture.json`), "utf8")
        ));
        const documents = fixture.layer4_sharedResources?.mongo?.newDocuments;
        expect(documents).toBeDefined();
        expect(Object.keys(documents!).sort()).toEqual([...scenario.mongoProbe.collections!].sort());

        const calls = scenario.stub?.script.matchers.length ?? 0;
        const documentCount = Object.values(documents!).reduce((sum, rows) => sum + rows.length, 0);
        if (calls === 0) expect(documentCount).toBe(0);
        else expect(documentCount).toBeGreaterThan(0);

        for (const rows of Object.values(documents!)) {
          for (const row of rows) {
            expect(row.datetime).toBe("<DATETIME>");
            expect(row.context?.datetime).toBe("<DATETIME>");
            expect(row.context?.method).toBeDefined();
            expect(row.context?.request).toBeDefined();
            expect(row.context?.response).toBeDefined();
            expect(row.context?.alert_fingerprint).toBeDefined();
          }
        }
      }
    });
  }

  it("reports a changed provider balance at its exact Mongo document path", async () => {
    const fixture = FixtureSchema.parse(JSON.parse(await fs.readFile(
      path.join(root, "fixtures/player-query-outbound-success.fixture.json"), "utf8"
    )));
    const expected = fixture.layer4_sharedResources!.mongo!.newDocuments;
    const actual = structuredClone(expected);
    actual.httplog_find_account[0].context.response.balance = 601;

    expect(compareMongoDocuments(actual, expected)).toEqual([{
      layer: "shared_resources",
      path: "after.mongo.newDocuments.httplog_find_account.0.context.response.balance",
      expected: 600,
      actual: 601,
    }]);
  });
});
