import { parseArgs } from "util";
import fs from "fs/promises";
import path from "path";
import { ContractRunner } from "./runner";
import { ScenarioDefinitionSchema, FixtureSchema } from "./schema/scenario";
import { config } from "./config";
import { resetEnvironment } from "./env/reset";
import { LegacyTargetAdapter } from "./target/legacyAdapter";

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      mode: {
        type: "string",
        short: "m",
        default: "verify",
      },
      target: {
        type: "string",
        short: "t",
        default: config.baseUrl,
      },
      adapter: {
        type: "string",
      },
      scenario: {
        type: "string",
        short: "s",
      },
      outDir: {
        type: "string",
        short: "o",
        default: "fixtures",
      },
      "skip-reset": {
        type: "boolean",
        default: false,
      },
    },
    strict: true,
    allowPositionals: true,
  });

  const mode = values.mode;
  const targetUrl = values.target!;
  const scenarioPath = values.scenario || positionals[0];

  if (!scenarioPath) {
    console.error("Error: Please specify a scenario file path (e.g. scenarios/wallet/check-transaction-deposit-hit.json)");
    process.exit(1);
  }

  const scenarioRaw = JSON.parse(await fs.readFile(scenarioPath, "utf-8"));
  const scenario = ScenarioDefinitionSchema.parse(scenarioRaw);

  if (scenario.action && values.adapter !== "legacy") {
    throw new Error('Internal action scenarios require --adapter legacy for the Legacy target');
  }
  if (values.adapter && values.adapter !== "legacy") {
    throw new Error(`Unknown target adapter: ${values.adapter}`);
  }

  if (!values["skip-reset"]) {
    // Issue #1/#3: reset to fixed synthetic seed data before record/verify by default.
    // Pass --skip-reset when validating against a target that resets itself
    // differently (e.g. StationHubNext).
    console.log("[HubContract] Resetting recording environment to synthetic seed state...");
    await resetEnvironment();
  }

  const runner = new ContractRunner({
    baseUrl: targetUrl,
    targetAdapter: scenario.action ? new LegacyTargetAdapter() : undefined,
  });

  try {
    const fixtureRelativePath = path.join(
      values.outDir!,
      `${scenario.id}.fixture.json`
    );

    if (mode === "record") {
      console.log(`[HubContract] RECORDING scenario "${scenario.id}" against ${targetUrl}...`);
      const fixture = await runner.record(scenario);
      await fs.mkdir(values.outDir!, { recursive: true });
      await fs.writeFile(fixtureRelativePath, JSON.stringify(fixture, null, 2), "utf-8");
      console.log(`[HubContract] Golden fixture recorded to ${fixtureRelativePath}`);
    } else if (mode === "verify") {
      console.log(`[HubContract] VERIFYING scenario "${scenario.id}" against ${targetUrl}...`);
      const fixtureContent = JSON.parse(await fs.readFile(fixtureRelativePath, "utf-8"));
      const golden = FixtureSchema.parse(fixtureContent);
      const result = await runner.verify(scenario, golden);

      if (result.passed) {
        console.log(`[HubContract] PASS: Scenario "${scenario.id}" matches golden contract!`);
      } else {
        console.error(`[HubContract] FAIL: Scenario "${scenario.id}" failed contract verification:`);
        for (const diff of result.differences) {
          console.error(`  - [${diff.layer}] at "${diff.path}": expected ${JSON.stringify(diff.expected)}, got ${JSON.stringify(diff.actual)}`);
        }
        process.exit(1);
      }
    } else {
      console.error(`Unknown mode: ${mode}. Use "record" or "verify".`);
      process.exit(1);
    }
  } finally {
    await runner.close();
  }
}

main().catch((err) => {
  console.error("[HubContract] Unexpected error:", err);
  process.exit(1);
});
