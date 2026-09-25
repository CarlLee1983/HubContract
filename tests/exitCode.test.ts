import { describe, expect, it } from "bun:test";
import { computeExitCode } from "../src/report/exitCode";
import { buildReport } from "../src/report/buildReport";

function reportWith(outcomes: Parameters<typeof buildReport>[0]["outcomes"]) {
  return buildReport({
    mode: "verify",
    target: "http://localhost:8080",
    startedAt: new Date(),
    finishedAt: new Date(),
    outcomes,
  });
}

describe("Issue #12: computeExitCode", () => {
  it("is 0 when every scenario passed", () => {
    const report = reportWith([
      { id: "a", route: { method: "GET", path: "/x" }, tags: [], status: "passed", differences: [] },
    ]);
    expect(computeExitCode(report)).toBe(0);
  });

  it("is non-zero when any scenario failed", () => {
    const report = reportWith([
      { id: "a", route: { method: "GET", path: "/x" }, tags: [], status: "passed", differences: [] },
      { id: "b", route: { method: "GET", path: "/y" }, tags: [], status: "failed", differences: [] },
    ]);
    expect(computeExitCode(report)).not.toBe(0);
  });

  it("is non-zero when any scenario errored", () => {
    const report = reportWith([
      {
        id: "a",
        route: { method: "GET", path: "/x" },
        tags: [],
        status: "errored",
        differences: [],
        error: "boom",
      },
    ]);
    expect(computeExitCode(report)).not.toBe(0);
  });

  it("is non-zero when there are zero scenarios (filters matched nothing, or nothing was loaded)", () => {
    const report = reportWith([]);
    expect(computeExitCode(report)).not.toBe(0);
  });

  it("is 0 for a record-mode report where everything was recorded", () => {
    const report = buildReport({
      mode: "record",
      target: "http://localhost:8080",
      startedAt: new Date(),
      finishedAt: new Date(),
      outcomes: [
        { id: "a", route: { method: "GET", path: "/x" }, tags: [], status: "recorded", differences: [] },
      ],
    });
    expect(computeExitCode(report)).toBe(0);
  });
});
