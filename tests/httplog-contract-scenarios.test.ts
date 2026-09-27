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
      const filenames = (await fs.readdir(path.join(root, "scenarios", family)))
        .filter((filename) => family !== "sms" || /^(amount|send)-/.test(filename));
      expect(filenames).toHaveLength({ game: 15, player: 20, sms: 17 }[family]!);
      for (const filename of filenames) {
        const scenario = ScenarioDefinitionSchema.parse(JSON.parse(
          await fs.readFile(path.join(root, "scenarios", family, filename), "utf8")
        ));
        expect(scenario.mongoProbe).toBeDefined();
        const mongoProbe = scenario.mongoProbe!;

        const outboundPaths = scenario.stub?.script.matchers.map((matcher) => matcher.path) ?? [];
        const expectedCollections = family === "game"
          ? mongoProbe.pattern
            ? [...new Set(outboundPaths.map((outboundPath) => pgCollections[outboundPath]))].sort()
            : outboundPaths.length > 0
              ? [...new Set(outboundPaths.map((outboundPath) => pgCollections[outboundPath]))].sort()
              : ["httplog_create_account", "httplog_deposit", "httplog_launch_game"]
          : family === "player"
            ? [filename.includes("create-") ? "httplog_create_account" : "httplog_find_account"]
            : [filename.startsWith("amount-") ? "httplog_sms_amount" : "httplog_sms_send"];
        if (mongoProbe.pattern) expect(mongoProbe.pattern).toBe("httplog_*");
        else expect([...mongoProbe.collections!].sort()).toEqual(expectedCollections);

        const fixture = FixtureSchema.parse(JSON.parse(
          await fs.readFile(path.join(root, "fixtures", `${scenario.id}.fixture.json`), "utf8")
        ));
        const documents = fixture.layer4_sharedResources?.mongo?.newDocuments;
        expect(documents).toBeDefined();
        expect(Object.keys(documents!).sort()).toEqual(expectedCollections);

        const expectedCounts = Object.fromEntries(expectedCollections.map((collection) => [collection, 0]));
        for (const outboundPath of outboundPaths) {
          const collection = family === "game" ? pgCollections[outboundPath] : expectedCollections[0];
          expectedCounts[collection]++;
        }

        for (const [collection, rows] of Object.entries(documents!)) {
          expect(rows).toHaveLength(expectedCounts[collection]);
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

  it("retains distinct PG transfer identities and ties each Mongo log to its outbound call", async () => {
    const fixture = FixtureSchema.parse(JSON.parse(await fs.readFile(
      path.join(root, "fixtures/pg-launch-recall.fixture.json"), "utf8"
    )));
    const calls = fixture.layer3_outboundCalls!.calls;
    const mongo = fixture.layer4_sharedResources!.mongo!.newDocuments;
    expect(calls[1].body.transfer_reference).toBe("<TRANSFER_REFERENCE_1>");
    expect(calls[2].body.transfer_reference).toBe("<TRANSFER_REFERENCE_2>");
    expect(mongo.httplog_withdraw[0].context.request.transfer_reference).toBe(calls[1].body.transfer_reference);
    expect(mongo.httplog_deposit[0].context.request.transfer_reference).toBe(calls[2].body.transfer_reference);
    for (const call of calls) {
      const collection = pgCollections[call.path];
      const logged = mongo[collection][0].context;
      expect(logged.uri).toEndWith(`trace_id=${call.query.trace_id}`);
      for (const field of ["operator_token", "secret_key", "extra_args", "client_ip"]) {
        if (call.body?.[field] !== undefined) expect(logged.request[field]).toBe(call.body[field]);
      }
    }
  });

  it("ties AboSend rand and sign to the logged request", async () => {
    const fixture = FixtureSchema.parse(JSON.parse(await fs.readFile(
      path.join(root, "fixtures/sms-amount-abo-send-success.fixture.json"), "utf8"
    )));
    const outbound = fixture.layer3_outboundCalls!.calls[0].body;
    const logged = fixture.layer4_sharedResources!.mongo!.newDocuments.httplog_sms_amount[0].context.request;
    expect(logged.rand).toBe(outbound.rand);
    expect(logged.sign).toBe(outbound.sign);
  });

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
