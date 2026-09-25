import { describe, expect, it } from "bun:test";
import { buildReport } from "../src/report/buildReport";
import { formatHumanReport } from "../src/report/formatHumanReport";
import { ReportSchema } from "../src/schema/report";

describe("Issue #12: buildReport", () => {
  const startedAt = new Date("2026-09-26T00:00:00.000Z");
  const finishedAt = new Date("2026-09-26T00:00:05.000Z");

  it("builds a report matching ReportSchema with correct summary counts", () => {
    const report = buildReport({
      mode: "verify",
      target: "http://localhost:8080",
      startedAt,
      finishedAt,
      outcomes: [
        {
          id: "deposit-hit",
          route: { method: "POST", path: "/v1/wallet/check-transaction" },
          tags: ["wallet"],
          status: "passed",
          differences: [],
        },
        {
          id: "withdrawal-hit",
          route: { method: "POST", path: "/v1/wallet/check-transaction" },
          tags: ["wallet"],
          status: "failed",
          differences: [
            {
              layer: "inbound_response",
              path: "body.data.amount",
              expected: 100,
              actual: 999,
            },
          ],
        },
        {
          id: "broken-scenario",
          route: { method: "POST", path: "/v1/wallet/check-transaction" },
          tags: [],
          status: "errored",
          differences: [],
          error: "ECONNREFUSED",
        },
      ],
    });

    const parsed = ReportSchema.parse(report);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.mode).toBe("verify");
    expect(parsed.target).toBe("http://localhost:8080");
    expect(parsed.startedAt).toBe(startedAt.toISOString());
    expect(parsed.finishedAt).toBe(finishedAt.toISOString());
    expect(parsed.summary).toEqual({ total: 3, passed: 1, failed: 1, errored: 1 });
    expect(parsed.scenarios.map((s) => s.id)).toEqual([
      "deposit-hit",
      "withdrawal-hit",
      "broken-scenario",
    ]);
    expect(parsed.scenarios[2].error).toBe("ECONNREFUSED");
  });

  it("produces a zero-diff, all-passed report for an empty outcome list only if never called with zero scenarios (guarded by CLI, not here)", () => {
    const report = buildReport({
      mode: "verify",
      target: "http://localhost:8080",
      startedAt,
      finishedAt,
      outcomes: [],
    });
    expect(report.summary).toEqual({ total: 0, passed: 0, failed: 0, errored: 0 });
  });
});

describe("Issue #12: formatHumanReport", () => {
  it("prints PASS/FAIL per scenario and layer/path/expected/actual per difference", () => {
    const report = buildReport({
      mode: "verify",
      target: "http://localhost:8080",
      startedAt: new Date("2026-09-26T00:00:00.000Z"),
      finishedAt: new Date("2026-09-26T00:00:05.000Z"),
      outcomes: [
        {
          id: "deposit-hit",
          route: { method: "POST", path: "/v1/wallet/check-transaction" },
          tags: ["wallet"],
          status: "passed",
          differences: [],
        },
        {
          id: "withdrawal-hit",
          route: { method: "POST", path: "/v1/wallet/check-transaction" },
          tags: ["wallet"],
          status: "failed",
          differences: [
            {
              layer: "inbound_response",
              path: "body.data.amount",
              expected: 100,
              actual: 999,
            },
          ],
        },
        {
          id: "broken-scenario",
          route: { method: "POST", path: "/v1/wallet/check-transaction" },
          tags: [],
          status: "errored",
          differences: [],
          error: "ECONNREFUSED",
        },
      ],
    });

    const text = formatHumanReport(report);

    expect(text).toContain("PASS deposit-hit");
    expect(text).toContain("FAIL withdrawal-hit");
    expect(text).toContain("[inbound_response] body.data.amount");
    expect(text).toContain("expected: 100");
    expect(text).toContain("actual: 999");
    expect(text).toContain("ERROR broken-scenario");
    expect(text).toContain("ECONNREFUSED");
    expect(text).toContain("3 total");
    expect(text).toContain("1 passed");
    expect(text).toContain("1 failed");
    expect(text).toContain("1 errored");
  });
});
