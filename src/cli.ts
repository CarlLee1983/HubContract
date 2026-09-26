import { parseArgs } from "util";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { ContractRunner, type PreconditionAdapter } from "./runner";
import type { QueueDrain } from "./probe/queueDrain";
import { LegacyPreconditionAdapter } from "./target/legacyPreconditions";
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
      "precondition-adapter": { type: "string" },
      scenario: { type: "string", short: "s" },
      outDir: { type: "string", short: "o", default: "fixtures" },
      "skip-reset": { type: "boolean", default: false },
      "queue-drain-adapter": { type: "string" },
      // Issue #12: repeatable, e.g. `--route /v1/wallet/check-transaction --route
      // /mcp/platform-maintenance/cq9`. Not a comma list (see filterScenarios.ts).
      route: { type: "string", multiple: true },
      tag: { type: "string", multiple: true },
      "report-json": { type: "string" },
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

  const localLegacyUrl = `http://localhost:${process.env.LEGACY_PORT || 8080}`;
  const isLocalLegacy = targetUrl.replace(/\/$/, "") === localLegacyUrl;
  let queueDrain: QueueDrain | undefined;
  if (values["queue-drain-adapter"]) {
    const adapterUrl = pathToFileURL(path.resolve(values["queue-drain-adapter"])).href;
    const adapterModule = await import(adapterUrl);
    if (typeof adapterModule.createQueueDrain !== "function") {
      throw new Error(`Queue drain adapter ${adapterUrl} must export createQueueDrain({ targetUrl })`);
    }
    queueDrain = await adapterModule.createQueueDrain({ targetUrl });
    if (typeof queueDrain?.waitForIdle !== "function" || typeof queueDrain.close !== "function") {
      throw new Error(`Queue drain adapter ${adapterUrl} must provide waitForIdle() and close()`);
    }
  } else if (!isLocalLegacy && scenariosToRun.length > 0) {
    throw new Error(`Target ${targetUrl} needs --queue-drain-adapter; local Legacy Redis cannot prove its jobs are drained`);
  }

  let preconditionAdapter: PreconditionAdapter | undefined;
  if (values["precondition-adapter"]) {
    const modulePath = pathToFileURL(path.resolve(values["precondition-adapter"])).href;
    const module = await import(modulePath);
    if (typeof module.createPreconditionAdapter !== "function") {
      throw new Error(`${modulePath} must export createPreconditionAdapter({ targetUrl })`);
    }
    preconditionAdapter = await module.createPreconditionAdapter({ targetUrl });
  } else if (isLocalLegacy) {
    // The configured local recording target is Legacy, whether selected by
    // default or passed explicitly with --target.
    preconditionAdapter = new LegacyPreconditionAdapter();
  }

  const runner = new ContractRunner({
    baseUrl: targetUrl,
    stubUrl: config.stub.baseUrl,
    queueDrain,
    preconditionAdapter,
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
