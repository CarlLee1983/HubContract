import type { Report } from "../schema/report";

/**
 * Issue #12: any failed or errored scenario, or a batch that ran zero
 * scenarios at all (filters matched nothing, or nothing was loaded), is a
 * non-zero exit — a CI gate must never silently pass on an empty run.
 */
export function computeExitCode(report: Report): number {
  const { failed, errored } = report.summary;
  const ranNothing = report.scenarios.length === 0;
  return failed > 0 || errored > 0 || ranNothing ? 1 : 0;
}
