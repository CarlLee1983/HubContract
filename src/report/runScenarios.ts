import type { ScenarioDefinition } from "../schema/scenario";
import type { ScenarioReport } from "../schema/report";
import { runOne, outcomeContext, erroredScenarioReport, type ScenarioRunner } from "./runOne";

export interface RunScenariosOptions {
  scenarios: ScenarioDefinition[];
  mode: "record" | "verify";
  runner: ScenarioRunner;
  outDir: string;
  /** Mirrors the CLI's --skip-reset flag. */
  skipReset: boolean;
  /** Injected so this is testable without a live recording environment. */
  resetEnvironment: () => Promise<void>;
  onScenarioStart?: (scenario: ScenarioDefinition) => void;
}

/**
 * Runs every scenario in order, resetting the recording environment before
 * each one (parent spec Issue #1/#3: "每個情境執行前都把...重置為基準種子"),
 * unless skipReset is set. A failure in reset or in the scenario run itself
 * becomes that scenario's "errored" outcome rather than aborting the batch.
 * A queue-drain failure is the exception: a worker may still write after a
 * reset, so remaining scenarios are reported as errored without running.
 */
export async function runScenarios(options: RunScenariosOptions): Promise<ScenarioReport[]> {
  const { scenarios, mode, runner, outDir, skipReset, resetEnvironment, onScenarioStart } =
    options;
  const outcomes: ScenarioReport[] = [];

  for (const scenario of scenarios) {
    onScenarioStart?.(scenario);
    if (runner.canResetEnvironment?.() === false) {
      outcomes.push(erroredScenarioReport(
        outcomeContext(scenario),
        "Previous queue drain failed; workers may still write. Stop workers and reset the environment before another scenario."
      ));
      continue;
    }
    try {
      if (!skipReset) {
        await resetEnvironment();
      }
      outcomes.push(await runOne({ scenario, mode, runner, outDir }));
    } catch (err) {
      outcomes.push(
        erroredScenarioReport(outcomeContext(scenario), err instanceof Error ? err.message : String(err))
      );
    }
  }

  return outcomes;
}
