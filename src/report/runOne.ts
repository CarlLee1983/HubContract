import fs from "fs/promises";
import path from "path";
import type { ScenarioDefinition, Fixture } from "../schema/scenario";
import { FixtureSchema, assertFixtureMatchesScenario } from "../schema/scenario";
import type { VerifyResult } from "../runner";
import type { ScenarioReport } from "../schema/report";

/**
 * The subset of ContractRunner that runOne() needs. Kept as a structural
 * interface (rather than importing the class) so tests can inject a fake
 * runner and never touch a live target (Issue #12 code review #3).
 */
export interface ScenarioRunner {
  record(scenario: ScenarioDefinition): Promise<Fixture>;
  verify(scenario: ScenarioDefinition, golden: Fixture): Promise<VerifyResult>;
}

export interface RunOneOptions {
  scenario: ScenarioDefinition;
  mode: "record" | "verify";
  runner: ScenarioRunner;
  outDir: string;
}

export interface OutcomeContext {
  id: string;
  route: { method: string; path: string };
  tags: string[];
}

export function outcomeContext(scenario: ScenarioDefinition): OutcomeContext {
  return {
    id: scenario.id,
    route: scenario.route ?? { method: "SCHEDULE", path: scenario.trigger!.name },
    tags: scenario.tags,
  };
}

/**
 * Issue #12 code review #6: single place that shapes an "errored"
 * ScenarioReport, reused by runOne, runScenarios, and the CLI's handling of
 * scenario files that failed to load in the first place.
 */
export function erroredScenarioReport(context: OutcomeContext, error: string): ScenarioReport {
  return { ...context, status: "errored", differences: [], error };
}

/**
 * Runs a single scenario (record or verify) and turns the result into a
 * ScenarioReport. Never throws: any error (network, missing fixture, bad
 * fixture schema, ...) is caught and returned as an "errored" outcome so the
 * caller can run the rest of the batch regardless (Issue #12).
 */
export async function runOne(options: RunOneOptions): Promise<ScenarioReport> {
  const { scenario, mode, runner, outDir } = options;
  const fixturePath = path.join(outDir, `${scenario.id}.fixture.json`);

  try {
    if (mode === "record") {
      const fixture = await runner.record(scenario);
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2), "utf-8");
      return { ...outcomeContext(scenario), status: "recorded", differences: [] };
    }

    const fixtureContent = JSON.parse(await fs.readFile(fixturePath, "utf-8"));
    const golden = FixtureSchema.parse(fixtureContent);
    assertFixtureMatchesScenario(scenario, golden);
    const result = await runner.verify(scenario, golden);
    return {
      ...outcomeContext(scenario),
      status: result.passed ? "passed" : "failed",
      differences: result.differences,
    };
  } catch (err) {
    return erroredScenarioReport(
      outcomeContext(scenario),
      err instanceof Error ? err.message : String(err)
    );
  }
}
