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
  ttlExpectedSeconds: z.number().int().positive().optional().describe("Stable fixture TTL anchor; verify still compares the observed TTL using ttlToleranceSeconds"),
});

export const RedisProbeSchema = z.object({
  keys: z.array(RedisProbeKeyRuleSchema).default([]),
});

export const MongoCollectionNamePattern = /^httplog_[\w-]+$/;
export const MongoCollectionGlobPattern = /^httplog_[\w*\-]+$/;

export const MongoProbeSchema = z.object({
  collections: z.array(z.string().regex(MongoCollectionNamePattern)).optional(),
  pattern: z.string().regex(MongoCollectionGlobPattern).optional(),
});

export const QueueDrainSchema = z.object({
  queues: z.array(z.string().min(1)).min(1),
  timeoutMs: z.number().int().positive().default(150000),
});

/** Domain preconditions; each target adapter chooses its own storage details. */
export const ScenarioPreconditionsSchema = z.object({
  smsLock: z.object({
    nationalNumber: z.string().regex(/^[0-9]+$/),
  }).optional(),
  mcpMaintenance: z.object({
    platform: z.string().min(1),
    duration: z.string().min(1),
    reason: z.string().min(1),
  }).optional(),
  platformMaintenance: z.strictObject({
    platform: z.string().regex(/^[a-z][a-z0-9_]*$/),
  }).optional(),
  walletLock: z.object({
    account: z.string().min(1),
    stationCode: z.string().min(1),
    currency: z.string().min(1),
  }).optional(),
});

export type ScenarioPreconditions = z.infer<typeof ScenarioPreconditionsSchema>;

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
  rawBody: z.string().optional().describe("Send an HTML or other non-JSON provider response verbatim"),
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
  bodyMd5: z.object({
    outputField: z.string().min(1),
    inputFields: z.array(z.string().min(1)).min(1),
    suffix: z.string(),
    uppercase: z.boolean().default(true),
  }).optional().describe("Validate a dynamic MD5 body field from ordered body fields and a synthetic suffix"),
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
export const ScenarioActionSchema = z.object({
  name: z.literal("platformGameType.setActive"),
  parameters: z.object({
    platformId: z.number(),
    platformActive: z.boolean(),
    gameTypeId: z.number(),
    active: z.boolean(),
  }),
});
export type ScenarioAction = z.infer<typeof ScenarioActionSchema>;

const HttpRouteSchema = z.object({ method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]), path: z.string().startsWith("/") });
const HttpRequestSchema = z.object({
  headers: z.record(z.string(), z.string()).default({}),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  body: z.record(z.string(), z.any()).optional(),
  signWith: z.object({ secretKey: z.string().min(1) }).optional(),
});
export const HttpStepSchema = z.object({
  id: z.string().min(1),
  route: HttpRouteSchema,
  request: HttpRequestSchema.default({ headers: {} }),
  // PG's callback receives the ops issued in GetLaunchURLHTML.extra_args.
  pgOpsFromLaunch: z.boolean().optional(),
  expirePgOpsBeforeRequest: z.boolean().optional(),
  redisCheckpoint: RedisProbeSchema.optional(),
});

const ScenarioDefinitionBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  route: HttpRouteSchema.optional(),
  steps: z.array(HttpStepSchema).min(2).optional(),
  trigger: z.object({ kind: z.literal("schedule"), name: z.string().min(1) }).optional(),
  action: ScenarioActionSchema.optional(),
  // Issue #12: free-form labels for --tag filtering (e.g. "wallet", "pilot",
  // "deposit"). Optional so pre-existing scenario files without tags stay valid.
  tags: z.array(z.string()).default([]),
  request: HttpRequestSchema.optional(),
  setup: z.object({ statements: z.array(DbProbeQuerySchema).min(1) }).optional(),
  dbProbe: DbProbeSchema.optional(),
  redisProbe: RedisProbeSchema.optional(),
  mongoProbe: MongoProbeSchema.optional(),
  queueDrain: QueueDrainSchema.optional(),
  preconditions: ScenarioPreconditionsSchema.optional(),
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
});

export const ScenarioDefinitionSchema = ScenarioDefinitionBaseSchema.refine((value) =>
  [value.route, value.steps, value.trigger, value.action].filter(Boolean).length === 1 &&
  (!value.action || (Boolean(value.dbProbe?.queries.length) && !value.request && !value.setup)) &&
  (!value.steps || (!value.request &&
    new Set(value.steps.map((step) => step.id)).size === value.steps.length &&
    value.steps.every((step, index) => !step.pgOpsFromLaunch || index > 0))), {
  message: "Declare exactly one of route, steps, trigger or action; bound callback steps must follow launch",
});
export const InboundScenarioSchema = ScenarioDefinitionBaseSchema.extend({
  route: HttpRouteSchema,
  steps: z.never().optional(),
  trigger: z.never().optional(),
  action: z.never().optional(),
  request: ScenarioDefinitionBaseSchema.shape.request.unwrap().default({ headers: {} }),
});
export const ActionScenarioSchema = ScenarioDefinitionBaseSchema.extend({
  route: z.never().optional(),
  steps: z.never().optional(),
  trigger: z.never().optional(),
  action: ScenarioActionSchema,
  request: z.never().optional(),
  dbProbe: DbProbeSchema.extend({ queries: z.array(DbProbeQuerySchema).min(1) }),
});
export type InboundScenario = z.infer<typeof InboundScenarioSchema>;
export type ActionScenario = z.infer<typeof ActionScenarioSchema>;

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
  stepResponses: z.array(z.object({ id: z.string(), statusCode: z.number(), statusText: z.string(), headers: z.record(z.string(), z.string()), body: z.any() })).optional(),
  redisCheckpoints: z.record(z.string(), z.record(z.string(), RedisKeyRecordSchema.nullable())).optional(),
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
      mongo: z
        .object({ newDocuments: z.record(z.string(), z.array(z.record(z.string(), z.any()))) })
        .optional(),
    })
    .optional(),
});

export type Fixture = z.infer<typeof FixtureSchema>;

export const InboundFixtureSchema = FixtureSchema.extend({
  layer1_inboundResponse: z.object({
    statusCode: z.number(), statusText: z.string(),
    headers: z.record(z.string(), z.string()), body: z.any(),
  }),
});
export const ActionFixtureSchema = FixtureSchema.extend({
  layer1_inboundResponse: z.never().optional(),
  layer2_dbState: z.object({
    before: z.record(z.string(), z.any()),
    after: z.record(z.string(), z.any()),
  }),
});
export type InboundFixture = z.infer<typeof InboundFixtureSchema>;
export type ActionFixture = z.infer<typeof ActionFixtureSchema>;

export function assertFixtureMatchesScenario(scenario: ScenarioDefinition, fixture: Fixture): void {
  if (fixture.scenarioId !== scenario.id) {
    throw new Error(`Fixture scenarioId ${fixture.scenarioId} does not match ${scenario.id}`);
  }
  if (scenario.route && !fixture.layer1_inboundResponse) {
    throw new Error(`HTTP scenario ${scenario.id} requires layer1_inboundResponse`);
  }
  if (scenario.steps && (!fixture.stepResponses || fixture.stepResponses.length !== scenario.steps.length)) {
    throw new Error(`HTTP steps scenario ${scenario.id} requires one response per step`);
  }
  for (const step of scenario.steps ?? []) {
    if (step.redisCheckpoint && !fixture.redisCheckpoints?.[step.id]) {
      throw new Error(`HTTP step ${step.id} requires a Redis checkpoint`);
    }
  }
  if (scenario.trigger && fixture.layer1_inboundResponse) {
    throw new Error(`Schedule scenario ${scenario.id} must not declare layer1_inboundResponse`);
  }
  if (scenario.trigger && !fixture.layer3_outboundCalls) {
    throw new Error(`Schedule scenario ${scenario.id} requires layer3_outboundCalls`);
  }
  if (scenario.trigger && !fixture.layer2_dbState) {
    throw new Error(`Schedule scenario ${scenario.id} requires layer2_dbState`);
  }
  if (scenario.action && fixture.layer1_inboundResponse) {
    throw new Error(`Action scenario ${scenario.id} must not declare layer1_inboundResponse`);
  }
  if (scenario.action && !fixture.layer2_dbState) {
    throw new Error(`Action scenario ${scenario.id} requires layer2_dbState`);
  }
}
