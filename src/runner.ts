import { assertFixtureMatchesScenario, type ScenarioDefinition, type ScenarioPreconditions, type Fixture } from "./schema/scenario";
import { signRequest, normalizeRequestInputs, toPhpString } from "./signer/signature";
import { applyNormalizers } from "./normalizer/normalizer";
import { MariaDbProbe, type DbConfig } from "./probe/dbProbe";
import { RedisProbeService } from "./probe/redisProbe";
import { MongoProbeService } from "./probe/mongoProbe";
import { RedisQueueDrain, type QueueDrain } from "./probe/queueDrain";
import type { RedisKeyRecord, StubRequestRecord } from "./schema/scenario";
import { StubClient } from "./stub/client";
import type { TargetAdapter } from "./target/legacyAdapter";
export type { TargetAdapter } from "./target/legacyAdapter";
import {
  compareInboundResponse,
  compareDbState,
  compareOutboundCalls,
  compareRedisState,
  compareMongoDocuments,
  type Difference,
} from "./comparator/comparator";

export interface RunnerOptions {
  baseUrl: string;
  dbConfig?: DbConfig;
  redisConfig?: {
    host?: string;
    port?: number;
    password?: string;
    prefix?: string;
  };
  mongoConfig?: { host?: string; port?: number; database?: string };
  queueDrain?: QueueDrain;
  /**
   * Base URL of the provider stub's control API (Issue #8). Required, not
   * optional — every scenario (not just ones with a `stub`) is checked for
   * undefined outbound calls (code review Standards #1/#2 on PR #1), so the
   * stub is a load-bearing dependency of the recording environment, not an
   * opt-in one.
   */
  stubUrl: string;
  preconditionAdapter?: PreconditionAdapter;
  fixedTimestamp?: number;
  targetAdapter?: TargetAdapter;
}

export interface PreconditionAdapter {
  apply(preconditions: ScenarioPreconditions): Promise<void>;
  close?(): Promise<void>;
}

export interface VerifyResult {
  scenarioId: string;
  passed: boolean;
  differences: Difference[];
}

type RedisCapture = Record<string, RedisKeyRecord | null>;

export interface BuiltHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  requestData: unknown;
}

/**
 * Pure request-assembly step: applies normalizers, signs the (normalized-input)
 * payload, and encodes the body per Content-Type. No I/O, so it's unit-testable
 * without a live HTTP target.
 */
export function buildHttpRequest(
  scenario: ScenarioDefinition,
  baseUrl: string,
  normalizerOptions: { fixedTimestamp?: number } = {}
): BuiltHttpRequest {
  if (!scenario.route) throw new Error("HTTP request requires a route");
  // 1. Apply normalizers to request (e.g. current_timestamp)
  let rawReq = applyNormalizers(
    { request: scenario.request ?? { headers: {} } },
    scenario.normalizers,
    normalizerOptions
  ).request;

  // 2. Sign request if signWith is specified. Legacy runs TrimStrings /
  // ConvertEmptyStringsToNull middleware before signature verification, so the
  // signature must be computed over the normalized inputs even though the
  // raw (un-normalized) body is what actually gets sent over the wire.
  // Merge priority matches Laravel's Request::all() (getInputSource()->all() +
  // query->all(), and PHP's `+` keeps the LEFT array's value on key conflicts):
  // body wins over query.
  if (rawReq.signWith?.secretKey) {
    const payloadToSign = normalizeRequestInputs({
      ...(rawReq.query || {}),
      ...(rawReq.body || {}),
    });
    const sign = signRequest(payloadToSign, rawReq.signWith.secretKey);
    if (rawReq.body) {
      rawReq = { ...rawReq, body: { ...rawReq.body, sign } };
    } else if (rawReq.query) {
      rawReq = { ...rawReq, query: { ...rawReq.query, sign } };
    }
  }

  // 3. Assemble URL
  const url = new URL(baseUrl.replace(/\/$/, "") + scenario.route.path);
  if (rawReq.query) {
    for (const [k, v] of Object.entries(rawReq.query)) {
      url.searchParams.append(k, String(v));
    }
  }

  // 4. Assemble headers & body
  const headers: Record<string, string> = {
    ...(rawReq.headers || {}),
  };
  if (rawReq.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const isFormEncoded = (headers["Content-Type"] || "").includes(
    "application/x-www-form-urlencoded"
  );

  let body: string | undefined;
  if (rawReq.body && scenario.route.method !== "GET") {
    if (isFormEncoded) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(rawReq.body)) {
        // Same PHP string-cast semantics as signing (toPhpString): true->"1",
        // false/null->"", nested objects/arrays throw rather than serializing
        // to "[object Object]". If a scenario genuinely needs nested form
        // fields, this should be revisited to follow PHP's http_build_query
        // bracket-notation encoding instead of throwing.
        params.append(k, toPhpString(v));
      }
      body = params.toString();
    } else {
      body = JSON.stringify(rawReq.body);
    }
  }

  return {
    url: url.toString(),
    method: scenario.route.method,
    headers,
    body,
    requestData: rawReq,
  };
}

interface CapturedRun {
  dbBefore: Record<string, unknown>;
  redisBefore: RedisCapture;
  mongoNewDocuments: Record<string, Record<string, unknown>[]>;
  response?: {
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    body: unknown;
  };
  dbAfter: Record<string, unknown>;
  redisAfter: RedisCapture;
  outboundCalls: StubRequestRecord[];
  unmatchedOutboundCount: number;
}

// Fallback only — a scenario that declares `stub` states its own
// outboundHeaderAllowlist explicitly (schema default: content-type,
// authorization; code review Standards #3/Story 26). This constant only
// applies to a scenario with no `stub` at all, which can still end up with
// captured outbound calls (an undeclared call the stub had no script for).
const DEFAULT_OUTBOUND_HEADER_ALLOWLIST = ["content-type", "authorization"];
const DEFAULT_QUEUE_DRAIN = { queues: ["HubWalletSync", "HttpLogging"], timeoutMs: 150000 };

function filterOutboundHeaders(
  headers: Record<string, string>,
  allowlist: string[]
): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const key of allowlist) {
    if (headers[key] !== undefined) filtered[key] = headers[key];
  }
  return filtered;
}

export class ContractRunner {
  private baseUrl: string;
  private dbProbe: MariaDbProbe;
  private dbConfig?: DbConfig;
  private redisProbe: RedisProbeService;
  private mongoProbe: MongoProbeService;
  private queueDrain: QueueDrain;
  private stubClient: StubClient;
  private preconditionAdapter?: PreconditionAdapter;
  private fixedTimestamp?: number;
  private targetAdapter?: TargetAdapter;
  private environmentSafe = true;

  constructor(options: RunnerOptions) {
    if (!options.stubUrl) {
      // Code review Standards #1/#2 on PR #1: the stub is a required
      // dependency of every scenario now (undefined-outbound-call detection
      // isn't opt-in), so a missing stubUrl must fail the runner outright
      // instead of silently skipping that check.
      throw new Error(
        "ContractRunner requires options.stubUrl — the provider stub is a required dependency of the recording environment (Issue #8), not optional."
      );
    }
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.dbConfig = options.dbConfig;
    this.dbProbe = new MariaDbProbe(options.dbConfig);
    this.redisProbe = new RedisProbeService(options.redisConfig);
    this.mongoProbe = new MongoProbeService(options.mongoConfig);
    this.queueDrain = options.queueDrain ?? new RedisQueueDrain(options.redisConfig);
    this.stubClient = new StubClient(options.stubUrl);
    this.preconditionAdapter = options.preconditionAdapter;
    this.fixedTimestamp = options.fixedTimestamp;
    this.targetAdapter = options.targetAdapter;
  }

  async close(): Promise<void> {
    await this.dbProbe.close();
    await this.redisProbe.close();
    await this.mongoProbe.close();
    await this.queueDrain.close();
    await this.preconditionAdapter?.close?.();
  }

  canResetEnvironment(): boolean {
    return this.environmentSafe;
  }

  /**
   * Applies normalizer rules scoped to Redis captures (e.g. redis.<key>.value.set_at)
   * so dynamic fields don't break golden comparisons. Never mutates the input capture.
   */
  private normalizeRedisCapture(
    capture: RedisCapture,
    scenario: ScenarioDefinition
  ): RedisCapture {
    return applyNormalizers({ redis: capture }, scenario.normalizers, {
      fixedTimestamp: this.fixedTimestamp,
    }).redis;
  }

  /**
   * Prepares and executes HTTP request according to scenario definition
   */
  private async executeRequest(scenario: ScenarioDefinition): Promise<{
    requestData: unknown;
    response: {
      statusCode: number;
      statusText: string;
      headers: Record<string, string>;
      body: unknown;
    };
  }> {
    const built = buildHttpRequest(scenario, this.baseUrl, {
      fixedTimestamp: this.fixedTimestamp,
    });

    const fetchOptions: RequestInit = {
      method: built.method,
      headers: built.headers,
      body: built.body,
    };

    const res = await fetch(built.url, fetchOptions);
    const contentType = res.headers.get("content-type") || "";
    let body: unknown;
    if (contentType.includes("application/json")) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });

    let response = {
      statusCode: res.status,
      statusText: res.statusText,
      headers: resHeaders,
      body,
    };

    // 5. Apply normalizers to response
    response = applyNormalizers({ response }, scenario.normalizers, {
      fixedTimestamp: this.fixedTimestamp,
    }).response;

    return { requestData: built.requestData, response };
  }

  /**
   * Captures the full before -> request -> after cycle for a scenario. Shared by
   * record() and verify() so both run the exact same layer-capture sequence.
   */
  private async captureRun(scenario: ScenarioDefinition): Promise<CapturedRun> {
    if (scenario.action && !this.targetAdapter?.executeAction) {
      throw new Error(`Scenario "${scenario.id}" requires a target adapter for action "${scenario.action.name}"`);
    }
    if (scenario.trigger && !this.targetAdapter?.triggerSchedule) {
      throw new Error("Schedule trigger requires a target adapter");
    }
    if (scenario.setup) {
      if (!scenario.trigger || !this.targetAdapter?.setupSchedule) {
        throw new Error("Schedule setup requires a target adapter with setupSchedule()");
      }
      await this.targetAdapter.setupSchedule(scenario.setup.statements, this.dbConfig);
    }
    // The target owns how a domain precondition is created. Apply it before
    // probes so both record and verify see the same initial state.
    if (scenario.preconditions?.smsLock) {
      if (!this.preconditionAdapter) {
        throw new Error(`Scenario "${scenario.id}" requires a precondition adapter`);
      }
      await this.preconditionAdapter.apply(scenario.preconditions);
    }
    // Layer 2: DB Probe before
    const dbBefore = await this.dbProbe.capture(scenario.dbProbe);
    // Layer 4: Redis Probe before
    const redisBeforeRaw = await this.redisProbe.capture(scenario.redisProbe);
    const redisBefore = this.normalizeRedisCapture(redisBeforeRaw, scenario);
    const mongoBefore = await this.mongoProbe.snapshot(scenario.mongoProbe);

    // Issue #8 / code review Standards #1: reset the stub and load this
    // scenario's script (or an empty one) fresh before every run (record and
    // verify alike, whether or not the scenario declares a `stub`) — every
    // scenario is checked for undefined outbound calls, and a leftover
    // recorded call or matcher from a previous scenario/run must never leak
    // into this one.
    await this.stubClient.reset();
    await this.stubClient.loadScript(scenario.stub?.script ?? { matchers: [] });

    // The trigger is target-neutral; the adapter owns the concrete dispatch.
    let response: CapturedRun["response"];
    try {
      if (scenario.action) {
        await this.targetAdapter!.executeAction!(scenario.action, this.baseUrl, dbBefore, this.dbConfig);
      } else if (scenario.trigger) {
        await this.targetAdapter!.triggerSchedule!(scenario.trigger.name);
      } else {
        response = (await this.executeRequest(scenario)).response;
      }
    } catch (error) {
      // The target may have queued work before the connection failed. Do not
      // reset this environment for another scenario until workers are stopped.
      this.environmentSafe = false;
      if (scenario.action) {
        throw new Error(`Action "${scenario.action.name}" failed in scenario "${scenario.id}"`, { cause: error });
      }
      throw error;
    }

    const drain = scenario.queueDrain ?? DEFAULT_QUEUE_DRAIN;
    try {
      await this.queueDrain.waitForIdle(drain.queues, drain.timeoutMs);
    } catch (error) {
      // A timed-out worker may still write after reset; no later scenario may
      // use this recording environment until the workers are stopped.
      this.environmentSafe = false;
      throw error;
    }

    // Layer 3: read back what the target under test actually sent to the stub
    const { requests, unmatchedCount } = await this.stubClient.getRequests();
    const unmatchedOutboundCount = unmatchedCount;
    const allowlist = scenario.stub?.outboundHeaderAllowlist ?? DEFAULT_OUTBOUND_HEADER_ALLOWLIST;
    const normalized = applyNormalizers({ outbound: requests }, scenario.normalizers, {
      fixedTimestamp: this.fixedTimestamp,
    }).outbound as StubRequestRecord[];
    const outboundCalls: StubRequestRecord[] = normalized.map((call) => ({
      ...call,
      headers: filterOutboundHeaders(call.headers, allowlist),
    }));

    // Layer 2: DB Probe after
    const dbAfter = await this.dbProbe.capture(scenario.dbProbe);
    // Layer 4: Redis Probe after
    const redisAfterRaw = await this.redisProbe.capture(scenario.redisProbe);
    const redisAfter = this.normalizeRedisCapture(redisAfterRaw, scenario);
    const mongoRaw = await this.mongoProbe.captureNew(scenario.mongoProbe, mongoBefore);
    const mongoNewDocuments = applyNormalizers({ mongo: mongoRaw }, scenario.normalizers, {
      fixedTimestamp: this.fixedTimestamp,
    }).mongo as Record<string, Record<string, unknown>[]>;

    return { dbBefore, redisBefore, mongoNewDocuments, response, dbAfter, redisAfter, outboundCalls, unmatchedOutboundCount };
  }

  /**
   * RECORD mode: Runs scenario against target, captures all layers, returns golden Fixture
   */
  async record(scenario: ScenarioDefinition): Promise<Fixture> {
    const { dbBefore, redisBefore, mongoNewDocuments, response, dbAfter, redisAfter, outboundCalls, unmatchedOutboundCount } =
      await this.captureRun(scenario);

    // Issue #8/Story 17: a golden fixture must never encode "Legacy hit an
    // outbound call this scenario's stub script never defined a matcher
    // for" as if it were the intended contract — fail loudly instead so the
    // scenario author completes the script.
    if (unmatchedOutboundCount) {
      throw new Error(
        `Scenario "${scenario.id}": ${unmatchedOutboundCount} outbound call(s) matched no stub script matcher. Add a matcher before recording.`
      );
    }

    const hasRedis = scenario.redisProbe && scenario.redisProbe.keys.length > 0;
    const hasMongo = !!scenario.mongoProbe;

    const fixture: Fixture = {
      scenarioId: scenario.id,
      layer1_inboundResponse: response ? {
        statusCode: response.statusCode,
        statusText: response.statusText,
        headers: {
          "content-type": response.headers["content-type"] || "application/json",
        },
        body: response.body,
      } : undefined,
      layer2_dbState: {
        before: dbBefore,
        after: dbAfter,
      },
      // Schedules declare the outbound layer even when it is empty, so a
      // later provider call is a contract difference rather than omitted.
      layer3_outboundCalls: scenario.trigger || outboundCalls.length > 0 ? { calls: outboundCalls } : undefined,
      layer4_sharedResources: hasRedis || hasMongo
        ? {
            redis: hasRedis ? {
              before: redisBefore,
              after: redisAfter,
            } : undefined,
            mongo: hasMongo ? { newDocuments: mongoNewDocuments } : undefined,
          }
        : undefined,
    };

    return fixture;
  }

  /**
   * VERIFY mode: Runs scenario against target, compares all layers with golden Fixture.
   * Both before and after snapshots are compared: a pre-condition mismatch (e.g. seed
   * data drift) is a contract failure just as much as a post-condition mismatch.
   */
  async verify(scenario: ScenarioDefinition, golden: Fixture): Promise<VerifyResult> {
    assertFixtureMatchesScenario(scenario, golden);
    const differences: Difference[] = [];

    const { dbBefore, redisBefore, mongoNewDocuments, response, dbAfter, redisAfter, outboundCalls, unmatchedOutboundCount } =
      await this.captureRun(scenario);

    // Issue #8/Story 17: an outbound call the stub script doesn't define a
    // matcher for fails the scenario outright, regardless of what the golden
    // fixture says — this is a harness/script gap, not something a diff
    // against a (necessarily incomplete) golden could ever catch.
    if (unmatchedOutboundCount) {
      differences.push({
        layer: "outbound_calls",
        path: "unmatched",
        expected: 0,
        actual: unmatchedOutboundCount,
        message: `${unmatchedOutboundCount} outbound call(s) matched no stub script matcher`,
      });
    }

    // Compare Layer 3: Outbound Calls
    if (golden.layer3_outboundCalls) {
      differences.push(...compareOutboundCalls(outboundCalls, golden.layer3_outboundCalls.calls));
    }

    // Compare Layer 1: Inbound Response
    if (response && golden.layer1_inboundResponse) {
      differences.push(...compareInboundResponse(
        { statusCode: response.statusCode, body: response.body },
        {
          statusCode: golden.layer1_inboundResponse.statusCode,
          body: golden.layer1_inboundResponse.body,
        }
      ));
    } else if (Boolean(response) !== Boolean(golden.layer1_inboundResponse)) {
      differences.push({ layer: "inbound_response", path: "presence", expected: Boolean(golden.layer1_inboundResponse), actual: Boolean(response) });
    }

    // Compare Layer 2: DB State (before & after)
    if (golden.layer2_dbState) {
      differences.push(...compareDbState(dbBefore, golden.layer2_dbState.before, "before"));
      differences.push(...compareDbState(dbAfter, golden.layer2_dbState.after, "after"));
    }

    // Compare Layer 4: Shared Resources (Redis) (before & after)
    if (golden.layer4_sharedResources?.redis) {
      differences.push(
        ...compareRedisState(redisBefore, golden.layer4_sharedResources.redis.before, "before")
      );
      differences.push(
        ...compareRedisState(redisAfter, golden.layer4_sharedResources.redis.after, "after")
      );
    }
    if (golden.layer4_sharedResources?.mongo) {
      differences.push(...compareMongoDocuments(mongoNewDocuments, golden.layer4_sharedResources.mongo.newDocuments));
    }

    return {
      scenarioId: scenario.id,
      passed: differences.length === 0,
      differences,
    };
  }
}
