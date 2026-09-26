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
 * Provider stub schema (Issue #8): describes how the stub (compose service
 * `mock-provider`, src/stub/server.ts) should respond to outbound calls made
 * by the target under test (e.g. Legacy calling out to a game platform).
 * Matching order is method, then path, then the optional body condition
 * (partial match: every key here must equal the corresponding key in the
 * parsed request body) — see the Issue #8 exploration notes.
 */
export const StubResponseSchema = z.object({
  status: z.number().default(200),
  body: z.any().optional(),
  headers: z.record(z.string(), z.string()).default({}),
  delayMs: z
    .number()
    .default(0)
    .describe(
      "Simulated latency before responding. Set higher than the caller's own HTTP timeout to simulate a timeout instead of adding a separate 'hang forever' mode."
    ),
});

export const StubMatcherSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  path: z.string().startsWith("/"),
  body: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      "Partial match against the parsed JSON/form request body — every key here must deep-equal the corresponding key in the request body, nested objects/arrays included."
    ),
  response: StubResponseSchema,
});

export const StubScriptSchema = z.object({
  matchers: z.array(StubMatcherSchema).default([]),
});

export type StubScript = z.infer<typeof StubScriptSchema>;
export type StubMatcher = z.infer<typeof StubMatcherSchema>;
export type StubResponse = z.infer<typeof StubResponseSchema>;

/**
 * A single request the stub received — the one source of truth for this
 * shape (code review Standards #11), used by src/stub/store.ts (in-memory
 * record), src/stub/client.ts (control API response), and
 * FixtureSchema.layer3_outboundCalls (golden/comparison shape) alike.
 */
export const StubRequestRecordSchema = z.object({
  method: z.string(),
  path: z.string(),
  query: z.record(z.string(), z.string()).default({}),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.any().optional(),
});

export type StubRequestRecord = z.infer<typeof StubRequestRecordSchema>;

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
  }).optional(),
  trigger: z.object({ kind: z.literal("schedule"), name: z.string().min(1) }).optional(),
  // Issue #12: free-form labels for --tag filtering (e.g. "wallet", "pilot",
  // "deposit"). Optional so pre-existing scenario files without tags stay valid.
  tags: z.array(z.string()).default([]),
  request: z.object({
    headers: z.record(z.string(), z.string()).default({}),
    query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    body: z.record(z.string(), z.any()).optional(),
    signWith: z
      .object({
        secretKey: z.string().min(1),
      })
      .optional(),
  }).default({ headers: {} }),
  setup: z.object({ statements: z.array(DbProbeQuerySchema).min(1) }).optional(),
  dbProbe: DbProbeSchema.optional(),
  redisProbe: RedisProbeSchema.optional(),
  // Issue #8: captureRun() *always* resets the stub and loads this script (or
  // an empty one, if omitted) before executing the request — every scenario
  // is checked for undefined outbound calls, not just ones that declare a
  // stub. When present, the matched call(s) are read back into
  // layer3_outboundCalls.
  stub: z
    .object({
      script: StubScriptSchema,
      // Code review Standards #3 (Story 26): which recorded headers are
      // meaningful to a contract is scenario-specific (a platform that signs
      // via a header needs it kept; most don't) — declared explicitly per
      // scenario instead of a hardcoded global, same as normalizers/dbProbe.
      outboundHeaderAllowlist: z.array(z.string()).default(["content-type", "authorization"]),
    })
    .optional(),
  normalizers: z.array(NormalizerRuleSchema).default([]),
}).refine((value) => Boolean(value.route) !== Boolean(value.trigger), {
  message: "Declare exactly one of route or trigger",
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
  }).optional(),
  layer2_dbState: z
    .object({
      before: z.record(z.string(), z.any()),
      after: z.record(z.string(), z.any()),
    })
    .optional(),
  layer3_outboundCalls: z
    .object({
      calls: z.array(StubRequestRecordSchema),
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

export function assertFixtureMatchesScenario(scenario: ScenarioDefinition, fixture: Fixture): void {
  if (fixture.scenarioId !== scenario.id) {
    throw new Error(`Fixture scenarioId ${fixture.scenarioId} does not match ${scenario.id}`);
  }
  if (scenario.route && !fixture.layer1_inboundResponse) {
    throw new Error(`HTTP scenario ${scenario.id} requires layer1_inboundResponse`);
  }
  if (scenario.trigger && fixture.layer1_inboundResponse) {
    throw new Error(`Schedule scenario ${scenario.id} must not declare layer1_inboundResponse`);
  }
}
