import type { Report, ReportSummary, ScenarioReport } from "../schema/report";

// Issue #12 code review #6: ScenarioOutcome IS a ScenarioReport (no separate
// shape to keep in sync) — runOne()/loadScenarios failures build ScenarioReport
// values directly, and buildReport() only aggregates them.
export type ScenarioOutcome = ScenarioReport;

export interface BuildReportInput {
  mode: "record" | "verify";
  target: string;
  startedAt: Date;
  finishedAt: Date;
  outcomes: ScenarioOutcome[];
}

const EMPTY_SUMMARY: ReportSummary = { total: 0, passed: 0, failed: 0, errored: 0, recorded: 0 };

/**
 * Pure aggregation step: turns per-scenario outcomes (already computed by the
 * CLI, one per scenario, errors already caught there) into the report shape
 * defined by ReportSchema. No I/O, so it's unit-testable without a live target.
 */
export function buildReport(input: BuildReportInput): Report {
  const { mode, target, startedAt, finishedAt, outcomes } = input;

  // Immutable reduce (code review #4): each step returns a new summary object
  // instead of mutating an accumulator in place.
  const summary = outcomes.reduce<ReportSummary>(
    (acc, outcome) => ({
      total: acc.total + 1,
      passed: acc.passed + (outcome.status === "passed" ? 1 : 0),
      failed: acc.failed + (outcome.status === "failed" ? 1 : 0),
      errored: acc.errored + (outcome.status === "errored" ? 1 : 0),
      recorded: acc.recorded + (outcome.status === "recorded" ? 1 : 0),
    }),
    EMPTY_SUMMARY
  );

  return {
    schemaVersion: 1,
    mode,
    target,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    summary,
    scenarios: outcomes,
  };
}
