import { z } from "zod";

/**
 * Single source of truth for the four-layer contract's "which layer did this
 * difference come from" tag. Shared by comparator.ts's Difference interface
 * and report.ts's ReportDifferenceSchema so the two can never drift apart
 * (code review #7 on Issue #12).
 */
export const DifferenceLayerSchema = z.enum(["inbound_response", "db_state", "shared_resources"]);

export type DifferenceLayer = z.infer<typeof DifferenceLayerSchema>;
