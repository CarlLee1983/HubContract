import { parseArgs } from "util";
import fs from "fs/promises";
import path from "path";
import { ContractRunner } from "./runner";
import { FixtureSchema } from "./schema/scenario";
import { ReportSchema } from "./schema/report";
import { config } from "./config";
import { resetEnvironment } from "./env/reset";
import { loadScenarioFiles } from "./report/loadScenarios";
import { filterScenarios } from "./report/filterScenarios";
import { buildReport, type ScenarioOutcome } from "./report/buildReport";
import { formatHumanReport } from "./report/formatHumanReport";

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
      // Issue #12: repeatable, e.g. `--route /v1/wallet/check-transaction --route
      // /mcp/platform-maintenance/cq9`. Not a comma list (see filterScenarios.ts).
      route: {
        type: "string",
        multiple: true,
      },
      tag: {
        type: "string",
        multiple: true,
      },
      "report-json": {
        type: "string",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  const mode = values.mode;
  if (mode !== "record" && mode !== "verify") {
    console.error(`Unknown mode: ${mode}. Use "record" or "verify".`);
    process.exit(1);
  }

  const targetUrl = values.target!;
  // Issue #12: scenario path is now a file OR a directory of scenarios;
  // defaults to scenarios/ so a bare `bun run verify` runs the whole suite.
  const scenarioPath = values.scenario || positionals[0] || "scenarios";

  if (!values["skip-reset"]) {
    // Issue #1/#3: reset to fixed synthetic seed data before record/verify by default.
    // Pass --skip-reset when validating against a target that resets itself
    // differently (e.g. StationHubNext).
    console.log("[HubContract] Resetting recording environment to synthetic seed state...");
    await resetEnvironment();
  }

  const loaded = await loadScenarioFiles(scenarioPath);
  const scenarios = filterScenarios(
    loaded.map((l) => l.scenario),
    { routes: values.route, tags: values.tag }
  );

  if (scenarios.length === 0) {
    console.error(
      `[HubContract] No scenarios matched --route=${JSON.stringify(values.route ?? [])} --tag=${JSON.stringify(values.tag ?? [])} under "${scenarioPath}".`
    );
    process.exit(1);
  }

  const runner = new ContractRunner({
    baseUrl: targetUrl,
  });

  const startedAt = new Date();
  const outcomes: ScenarioOutcome[] = [];

  try {
    for (const scenario of scenarios) {
      const fixtureRelativePath = path.join(values.outDir!, `${scenario.id}.fixture.json`);

      try {
        if (mode === "record") {
          console.log(`[HubContract] RECORDING scenario "${scenario.id}" against ${targetUrl}...`);
          const fixture = await runner.record(scenario);
          await fs.mkdir(values.outDir!, { recursive: true });
          await fs.writeFile(fixtureRelativePath, JSON.stringify(fixture, null, 2), "utf-8");
          console.log(`[HubContract] Golden fixture recorded to ${fixtureRelativePath}`);
          outcomes.push({
            id: scenario.id,
            route: scenario.route,
            tags: scenario.tags,
            status: "passed",
            differences: [],
          });
        } else {
          console.log(`[HubContract] VERIFYING scenario "${scenario.id}" against ${targetUrl}...`);
          const fixtureContent = JSON.parse(await fs.readFile(fixtureRelativePath, "utf-8"));
          const golden = FixtureSchema.parse(fixtureContent);
          const result = await runner.verify(scenario, golden);
          outcomes.push({
            id: scenario.id,
            route: scenario.route,
            tags: scenario.tags,
            status: result.passed ? "passed" : "failed",
            differences: result.differences,
          });
        }
      } catch (err) {
        // One scenario's error (network failure, missing fixture, ...) must not
        // abort the rest of the run (Issue #12 acceptance criterion).
        outcomes.push({
          id: scenario.id,
          route: scenario.route,
          tags: scenario.tags,
          status: "errored",
          differences: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    await runner.close();
  }

  const finishedAt = new Date();
  const report = buildReport({ mode, target: targetUrl, startedAt, finishedAt, outcomes });

  console.log("");
  console.log(formatHumanReport(report));

  if (values["report-json"]) {
    // Re-validate against ReportSchema before writing: the JSON report is a
    // StationHubNext CI release-gate contract, so it must never be written in a
    // shape that doesn't match the schema this module exports.
    const validated = ReportSchema.parse(report);
    await fs.writeFile(values["report-json"], JSON.stringify(validated, null, 2), "utf-8");
    console.log(`[HubContract] JSON report written to ${values["report-json"]}`);
  }

  const hasFailures = report.summary.failed > 0 || report.summary.errored > 0;
  process.exit(hasFailures ? 1 : 0);
}

main().catch((err) => {
  console.error("[HubContract] Unexpected error:", err);
  process.exit(1);
});
