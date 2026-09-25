import type { Report } from "../schema/report";

/**
 * Pure formatter: turns a Report into the human-readable text printed to
 * stdout by the CLI. Kept separate from the CLI entry so it's unit-testable.
 */
export function formatHumanReport(report: Report): string {
  const lines: string[] = [];

  for (const scenario of report.scenarios) {
    if (scenario.status === "passed") {
      lines.push(`PASS ${scenario.id} (${scenario.route.method} ${scenario.route.path})`);
      continue;
    }

    if (scenario.status === "errored") {
      lines.push(`ERROR ${scenario.id} (${scenario.route.method} ${scenario.route.path})`);
      lines.push(`  ${scenario.error ?? "unknown error"}`);
      continue;
    }

    lines.push(`FAIL ${scenario.id} (${scenario.route.method} ${scenario.route.path})`);
    for (const diff of scenario.differences) {
      lines.push(`  - [${diff.layer}] ${diff.path}`);
      lines.push(`      expected: ${JSON.stringify(diff.expected)}`);
      lines.push(`      actual: ${JSON.stringify(diff.actual)}`);
      if (diff.message) {
        lines.push(`      ${diff.message}`);
      }
    }
  }

  const { total, passed, failed, errored } = report.summary;
  lines.push("");
  lines.push(`${total} total, ${passed} passed, ${failed} failed, ${errored} errored`);

  return lines.join("\n");
}
