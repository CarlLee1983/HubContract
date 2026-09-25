import type { Report, ScenarioReport } from "../schema/report";

export interface ScenarioOutcome {
  id: string;
  route: { method: string; path: string };
  tags: string[];
  status: "passed" | "failed" | "errored";
  differences: ScenarioReport["differences"];
  error?: string;
}

export interface BuildReportInput {
  mode: "record" | "verify";
  target: string;
  startedAt: Date;
  finishedAt: Date;
  outcomes: ScenarioOutcome[];
}

/**
 * Pure aggregation step: turns per-scenario outcomes (already computed by the
 * CLI, one per scenario, errors already caught there) into the report shape
 * defined by ReportSchema. No I/O, so it's unit-testable without a live target.
 */
export function buildReport(input: BuildReportInput): Report {
  const { mode, target, startedAt, finishedAt, outcomes } = input;

  const summary = outcomes.reduce(
    (acc, outcome) => {
      acc.total += 1;
      acc[outcome.status] += 1;
      return acc;
    },
    { total: 0, passed: 0, failed: 0, errored: 0 }
  );

  return {
    schemaVersion: 1,
    mode,
    target,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    summary,
    scenarios: outcomes.map(
      (outcome): ScenarioReport => ({
        id: outcome.id,
        route: outcome.route,
        tags: outcome.tags,
        status: outcome.status,
        differences: outcome.differences,
        error: outcome.error,
      })
    ),
  };
}
