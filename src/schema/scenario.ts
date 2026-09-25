import { z } from "zod";

/**
 * Normalizer rule schema
 * Controls dynamic value masking or substitution (e.g. current_timestamp, timestamp_diff, regex)
 */
export const NormalizerRuleSchema = z.object({
  target: z.string().describe("JSON dot path of target field (e.g. response.headers.date, request.body.timestamp)"),
  type: z.enum(["current_timestamp", "mask", "ignore", "regex_replace"]),
  pattern: z.string().optional(),
  replacement: z.string().optional(),
});

/**
 * DB query probe schema
 */
export const DbProbeQuerySchema = z.object({
  name: z.string(),
  sql: z.string(),
  params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).default([]),
});

export const DbProbeSchema = z.object({
  queries: z.array(DbProbeQuerySchema).default([]),
});

/**
 * Redis probe schema
 */
export const RedisProbeKeyRuleSchema = z.object({
  pattern: z
    .string()
    .describe("Key pattern to probe, e.g. platform-maintenance:v1:* or exact key")
    .refine(
      (val) => !val.includes("."),
      // normalizer target paths (e.g. redis.<key>.value.set_at) split on ".", so a
      // key containing a literal "." would be mis-parsed as a path boundary
      // (code review LOW #7). No Redis key in this project uses "." — reject it
      // explicitly rather than silently mis-targeting a normalizer.
      { message: 'Redis key pattern must not contain "." (dot-path normalizer targets split on it)' }
    ),
  db: z.number().default(1).describe("Redis db index (default 1 per ADR-0013)"),
  ttlToleranceSeconds: z.number().default(30).describe("Acceptable difference in TTL seconds"),
});

export const RedisProbeSchema = z.object({
  keys: z.array(RedisProbeKeyRuleSchema).default([]),
});

/**
 * Scenario definition schema (input for record & verify)
 */
export const ScenarioDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  route: z.object({
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
    path: z.string().startsWith("/"),
  }),
  request: z.object({
    headers: z.record(z.string(), z.string()).default({}),
    query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    body: z.record(z.string(), z.any()).optional(),
    signWith: z
      .object({
        secretKey: z.string().min(1),
      })
      .optional(),
  }),
  dbProbe: DbProbeSchema.optional(),
  redisProbe: RedisProbeSchema.optional(),
  normalizers: z.array(NormalizerRuleSchema).default([]),
});

export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;

export const RedisKeyRecordSchema = z.object({
  key: z.string(),
  db: z.number(),
  type: z.string(),
  value: z.any(),
  ttl: z.number(),
  ttlTolerance: z.number().default(30),
});

export type RedisKeyRecord = z.infer<typeof RedisKeyRecordSchema>;

/**
 * Recorded Fixture schema (golden output of record)
 */
export const FixtureSchema = z.object({
  scenarioId: z.string(),
  layer1_inboundResponse: z.object({
    statusCode: z.number(),
    statusText: z.string(),
    headers: z.record(z.string(), z.string()),
    body: z.any(),
  }),
  layer2_dbState: z
    .object({
      before: z.record(z.string(), z.any()),
      after: z.record(z.string(), z.any()),
    })
    .optional(),
  layer4_sharedResources: z
    .object({
      redis: z
        .object({
          before: z.record(z.string(), RedisKeyRecordSchema.nullable()),
          after: z.record(z.string(), RedisKeyRecordSchema.nullable()),
        })
        .optional(),
    })
    .optional(),
});

export type Fixture = z.infer<typeof FixtureSchema>;
