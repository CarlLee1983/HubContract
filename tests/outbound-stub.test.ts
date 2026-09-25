import { describe, expect, it, afterAll, beforeEach } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { ContractRunner } from "../src/runner";
import { ScenarioDefinitionSchema, FixtureSchema, type ScenarioDefinition } from "../src/schema/scenario";
import { config } from "../src/config";
import { resetEnvironment } from "../src/env/reset";

describe("Issue #8: Provider stub & outbound calls (GET /v1/player/balance)", () => {
  const runner = new ContractRunner({
    baseUrl: config.baseUrl,
    stubUrl: config.stub.baseUrl,
  });

  beforeEach(async () => {
    // Issue #1/#3: reset to fixed synthetic seed data (and, per Issue #8, the
    // stub) before every scenario.
    await resetEnvironment();
  }, 30000);

  afterAll(async () => {
    await runner.close();
  });

  const scenarioFiles = [
    "player-balance-outbound-success.json",
    "player-balance-outbound-error.json",
    "player-balance-outbound-timeout.json",
  ];

  for (const filename of scenarioFiles) {
    it(`should record and verify ${filename} successfully`, async () => {
      const scenarioPath = path.join(__dirname, "../scenarios/player", filename);
      const rawScenario = JSON.parse(await fs.readFile(scenarioPath, "utf-8"));
      const scenario = ScenarioDefinitionSchema.parse(rawScenario);

      const fixturePath = path.join(__dirname, "../fixtures", `${scenario.id}.fixture.json`);
      const rawFixture = JSON.parse(await fs.readFile(fixturePath, "utf-8"));
      const golden = FixtureSchema.parse(rawFixture);

      const result = await runner.verify(scenario, golden);
      if (!result.passed) {
        console.error(`Verify failed for ${filename}:`, JSON.stringify(result.differences, null, 2));
      }
      expect(result.passed).toBe(true);
      expect(result.differences).toEqual([]);
    });
  }

  it("records the outbound call sbo actually sent, not just the inbound response", async () => {
    const scenarioPath = path.join(
      __dirname,
      "../scenarios/player/player-balance-outbound-success.json"
    );
    const scenario = ScenarioDefinitionSchema.parse(
      JSON.parse(await fs.readFile(scenarioPath, "utf-8"))
    );

    const fixture = await runner.record(scenario);

    expect(fixture.layer3_outboundCalls?.calls).toEqual([
      {
        method: "POST",
        path: "/web-root/restricted/player/get-player-balance.aspx",
        query: {},
        headers: { "content-type": "application/json" },
        body: {
          Username: "synthetic_user_01DEMO_STATIONp3",
          CompanyKey: "synthetic_company_key",
          ServerId: "synthetic-server-01",
        },
      },
    ]);
  });

  it("Standards #1/#2: an outbound call fails the scenario even when it declares no `stub` at all", async () => {
    const base: ScenarioDefinition = ScenarioDefinitionSchema.parse(
      JSON.parse(
        await fs.readFile(
          path.join(__dirname, "../scenarios/player/player-balance-outbound-success.json"),
          "utf-8"
        )
      )
    );

    // No `stub` field whatsoever — captureRun() must still load an empty
    // script and still check unmatchedCount, not skip the check because
    // `scenario.stub` is undefined.
    const { stub: _stub, ...scenarioWithoutStub } = base;
    void _stub;

    await expect(runner.record(scenarioWithoutStub as ScenarioDefinition)).rejects.toThrow(
      /no stub script matcher/
    );
  });

  it("Story 17: an outbound call the stub script doesn't define fails verify(), regardless of the golden fixture", async () => {
    const base: ScenarioDefinition = ScenarioDefinitionSchema.parse(
      JSON.parse(
        await fs.readFile(
          path.join(__dirname, "../scenarios/player/player-balance-outbound-success.json"),
          "utf-8"
        )
      )
    );

    // Deliberately narrow the script so the request Legacy actually sends
    // (POST .../get-player-balance.aspx) matches no matcher.
    const scenarioWithEmptyScript: ScenarioDefinition = {
      ...base,
      id: "player-balance-outbound-undefined",
      stub: { ...base.stub!, script: { matchers: [] } },
    };

    const golden = FixtureSchema.parse(
      JSON.parse(
        await fs.readFile(
          path.join(__dirname, "../fixtures/player-balance-outbound-success.fixture.json"),
          "utf-8"
        )
      )
    );

    const result = await runner.verify(scenarioWithEmptyScript, golden);

    expect(result.passed).toBe(false);
    const unmatchedDiff = result.differences.find((d) => d.path === "unmatched");
    expect(unmatchedDiff).toBeDefined();
    expect(unmatchedDiff?.layer).toBe("outbound_calls");
    expect(unmatchedDiff?.actual).toBe(1);
  });

  it("Story 17: record() refuses to produce a golden fixture for an undefined outbound call", async () => {
    const base: ScenarioDefinition = ScenarioDefinitionSchema.parse(
      JSON.parse(
        await fs.readFile(
          path.join(__dirname, "../scenarios/player/player-balance-outbound-success.json"),
          "utf-8"
        )
      )
    );

    const scenarioWithEmptyScript: ScenarioDefinition = {
      ...base,
      id: "player-balance-outbound-undefined",
      stub: { ...base.stub!, script: { matchers: [] } },
    };

    await expect(runner.record(scenarioWithEmptyScript)).rejects.toThrow(/no stub script matcher/);
  });

  it("Standards #10: the timeout scenario's delayMs actually exceeds the sbo timeout override it depends on", async () => {
    const scenario = ScenarioDefinitionSchema.parse(
      JSON.parse(
        await fs.readFile(
          path.join(__dirname, "../scenarios/player/player-balance-outbound-timeout.json"),
          "utf-8"
        )
      )
    );

    const delayMs = scenario.stub?.script.matchers[0]?.response.delayMs;
    // Shared source: docker-compose.yml's legacy-app.environment sets
    // GAMELOBBY_HTTP_PLATFORM_OVERRIDES from the same GAMELOBBY_SBO_TIMEOUT_SECONDS
    // env var config.gamelobby.sboTimeoutSeconds reads — if either drifts out
    // of sync with this scenario's delayMs, this assertion (not just a slow
    // CI run) is what catches it.
    expect(delayMs).toBeGreaterThan(config.gamelobby.sboTimeoutSeconds * 1000);
  });
});
