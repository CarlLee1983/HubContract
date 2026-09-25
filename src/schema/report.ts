import { z } from "zod";
import { DifferenceLayerSchema } from "./differenceLayer";

/**
 * Issue #12: machine-readable report contract, meant to double as a
 * StationHubNext CI release gate. `schemaVersion` is bumped whenever this
 * shape changes in a way a consumer needs to branch on.
 */
export const ReportDifferenceSchema = z.object({
  layer: DifferenceLayerSchema,
  path: z.string(),
  expected: z.unknown(),
  actual: z.unknown(),
  message: z.string().optional(),
});

// "recorded" is the record-mode success status (distinct from verify-mode's
// "passed"/"failed" pass/fail verdict — record mode never compares anything).
export const ScenarioReportStatusSchema = z.enum(["passed", "failed", "errored", "recorded"]);

export const ScenarioReportSchema = z.object({
  id: z.string(),
  route: z.object({
    method: z.string(),
    path: z.string(),
  }),
  tags: z.array(z.string()).default([]),
  status: ScenarioReportStatusSchema,
  differences: z.array(ReportDifferenceSchema).default([]),
  // Only present when status is "errored" (the scenario threw before a
  // pass/fail verdict could be reached, e.g. network error or bad fixture).
  error: z.string().optional(),
});

export const ReportSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  errored: z.number().int().nonnegative(),
  recorded: z.number().int().nonnegative(),
});

export const ReportSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["record", "verify"]),
  target: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  summary: ReportSummarySchema,
  scenarios: z.array(ScenarioReportSchema),
});

export type ReportDifference = z.infer<typeof ReportDifferenceSchema>;
export type ScenarioReport = z.infer<typeof ScenarioReportSchema>;
export type ReportSummary = z.infer<typeof ReportSummarySchema>;
export type Report = z.infer<typeof ReportSchema>;
