import { parseArgs } from "util";
import fs from "fs/promises";
import { ContractRunner } from "./runner";
import { LegacyTargetAdapter } from "./target/legacyAdapter";
import { ReportSchema } from "./schema/report";
import { config } from "./config";
import { resetEnvironment } from "./env/reset";
import { loadScenarioFiles } from "./report/loadScenarios";
import { filterScenarios } from "./report/filterScenarios";
import { runScenarios } from "./report/runScenarios";
import { erroredScenarioReport } from "./report/runOne";
import { buildReport } from "./report/buildReport";
import { formatHumanReport } from "./report/formatHumanReport";
import { computeExitCode } from "./report/exitCode";

function parseCliArgs() {
  return parseArgs({
    args: Bun.argv.slice(2),
    options: {
      mode: { type: "string", short: "m", default: "verify" },
      target: { type: "string", short: "t" },
      scenario: { type: "string", short: "s" },
      outDir: { type: "string", short: "o", default: "fixtures" },
      "skip-reset": { type: "boolean", default: false },
      // Issue #12: repeatable, e.g. `--route /v1/wallet/check-transaction --route
      // /mcp/platform-maintenance/cq9`. Not a comma list (see filterScenarios.ts).
      route: { type: "string", multiple: true },
      tag: { type: "string", multiple: true },
      "report-json": { type: "string" },
      adapter: { type: "string" },
    },
    strict: true,
    allowPositionals: true,
  });
}

async function main() {
  const { values, positionals } = parseCliArgs();

  const mode = values.mode;
  if (mode !== "record" && mode !== "verify") {
    console.error(`Unknown mode: ${mode}. Use "record" or "verify".`);
    process.exit(1);
  }

  const targetUrl = values.target ?? config.baseUrl;
  if (values.adapter && values.adapter !== "legacy") {
    throw new Error(`Unknown target adapter: ${values.adapter}`);
  }
  const outDir = values.outDir!;
  // Issue #12: scenario path is a file OR a directory of scenarios; defaults
  // to scenarios/ so a bare `bun run verify` runs the whole suite.
  const scenarioPath = values.scenario || positionals[0] || "scenarios";

  // Issue #12 code review #1: loading/filtering happens *before* any reset, so
  // a bad path or a zero-match filter never resets the recording environment
  // for nothing. Reset itself happens per-scenario, inside runScenarios().
  const loaded = await loadScenarioFiles(scenarioPath);

  // A scenario file that failed to parse/validate becomes an "errored" report
  // entry keyed by its file path (code review #2), never an aborted run.
  const loadFailures = loaded
    .filter((entry) => entry.error !== undefined)
    .map((entry) =>
      erroredScenarioReport(
        { id: entry.filePath, route: { method: "UNKNOWN", path: entry.filePath }, tags: [] },
        entry.error!
      )
    );

  const validScenarios = loaded
    .filter((entry) => entry.scenario !== undefined)
    .map((entry) => entry.scenario!);

  const scenariosToRun = filterScenarios(validScenarios, {
    routes: values.route,
    tags: values.tag,
  });

  if (scenariosToRun.length === 0) {
    console.error(
      `[HubContract] No scenarios matched --route=${JSON.stringify(values.route ?? [])} --tag=${JSON.stringify(values.tag ?? [])} under "${scenarioPath}".`
    );
  }

  const runner = new ContractRunner({
    baseUrl: targetUrl,
    stubUrl: config.stub.baseUrl,
    targetAdapter: values.adapter === "legacy" || !values.target ? new LegacyTargetAdapter() : undefined,
  });
  const startedAt = new Date();
  let runOutcomes: Awaited<ReturnType<typeof runScenarios>> = [];

  try {
    runOutcomes = await runScenarios({
      scenarios: scenariosToRun,
      mode,
      runner,
      outDir,
      skipReset: values["skip-reset"]!,
      resetEnvironment,
      onScenarioStart: (scenario) =>
        console.log(`[HubContract] ${mode.toUpperCase()} scenario "${scenario.id}" against ${targetUrl}...`),
    });
  } finally {
    await runner.close();
  }

  const finishedAt = new Date();
  const report = buildReport({
    mode,
    target: targetUrl,
    startedAt,
    finishedAt,
    outcomes: [...loadFailures, ...runOutcomes],
  });

  // Issue #12 code review #2: the report is always built and written, even
  // when nothing ran (zero-match filter, all files failed to load, ...) — a
  // CI gate must never be left looking for a report file that was never
  // written.
  console.log("");
  console.log(formatHumanReport(report));

  if (values["report-json"]) {
    const validated = ReportSchema.parse(report);
    await fs.writeFile(values["report-json"], JSON.stringify(validated, null, 2), "utf-8");
    console.log(`[HubContract] JSON report written to ${values["report-json"]}`);
  }

  process.exit(computeExitCode(report));
}

main().catch((err) => {
  console.error("[HubContract] Unexpected error:", err);
  process.exit(1);
});
