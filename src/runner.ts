import type {
  ScenarioDefinition, InboundScenario, ActionScenario, ScenarioAction, Fixture,
  InboundFixture, ActionFixture,
} from "./schema/scenario";
import { signRequest, normalizeRequestInputs, toPhpString } from "./signer/signature";
import { applyNormalizers } from "./normalizer/normalizer";
import { MariaDbProbe } from "./probe/dbProbe";
import type { DbConfig } from "./probe/dbProbe";
import { RedisProbeService } from "./probe/redisProbe";
import type { RedisKeyRecord } from "./schema/scenario";
import {
  compareInboundResponse,
  compareDbState,
  compareRedisState,
  type Difference,
} from "./comparator/comparator";

export interface RunnerOptions {
  baseUrl: string;
  targetAdapter?: TargetAdapter;
  dbConfig?: DbConfig;
  redisConfig?: {
    host?: string;
    port?: number;
    password?: string;
    prefix?: string;
  };
  fixedTimestamp?: number;
}

export interface TargetAdapter {
  executeAction(action: ScenarioAction, baseUrl: string, dbBefore: Readonly<Record<string, unknown>>, dbConfig?: DbConfig): Promise<void>;
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
  scenario: InboundScenario,
  baseUrl: string,
  normalizerOptions: { fixedTimestamp?: number } = {}
): BuiltHttpRequest {
  // 1. Apply normalizers to request (e.g. current_timestamp)
  let rawReq = applyNormalizers(
    { request: scenario.request },
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
  response?: {
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    body: unknown;
  };
  dbAfter: Record<string, unknown>;
  redisAfter: RedisCapture;
}

export class ContractRunner {
  private baseUrl: string;
  private dbProbe: MariaDbProbe;
  private redisProbe: RedisProbeService;
  private fixedTimestamp?: number;
  private targetAdapter?: TargetAdapter;
  private dbConfig?: DbConfig;

  constructor(options: RunnerOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.dbProbe = new MariaDbProbe(options.dbConfig);
    this.redisProbe = new RedisProbeService(options.redisConfig);
    this.fixedTimestamp = options.fixedTimestamp;
    this.targetAdapter = options.targetAdapter;
    this.dbConfig = options.dbConfig;
  }

  async close(): Promise<void> {
    await this.dbProbe.close();
    await this.redisProbe.close();
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
  private async executeRequest(scenario: InboundScenario): Promise<{
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
    if (scenario.action && !this.targetAdapter) {
      throw new Error(`Scenario "${scenario.id}" requires a target adapter for action "${scenario.action.name}"`);
    }
    // Layer 2: DB Probe before
    const dbBefore = await this.dbProbe.capture(scenario.dbProbe);
    // Layer 4: Redis Probe before
    const redisBeforeRaw = await this.redisProbe.capture(scenario.redisProbe);
    const redisBefore = this.normalizeRedisCapture(redisBeforeRaw, scenario);

    // Execute the declared operation between the same before/after probes.
    let response: CapturedRun["response"];
    if (scenario.action) {
      try {
        await this.targetAdapter!.executeAction(scenario.action, this.baseUrl, dbBefore, this.dbConfig);
      } catch (error) {
        throw new Error(`Action "${scenario.action.name}" failed in scenario "${scenario.id}"`, { cause: error });
      }
    } else {
      ({ response } = await this.executeRequest(scenario));
    }

    // Layer 2: DB Probe after
    const dbAfter = await this.dbProbe.capture(scenario.dbProbe);
    // Layer 4: Redis Probe after
    const redisAfterRaw = await this.redisProbe.capture(scenario.redisProbe);
    const redisAfter = this.normalizeRedisCapture(redisAfterRaw, scenario);

    return { dbBefore, redisBefore, response, dbAfter, redisAfter };
  }

  /**
   * RECORD mode: Runs scenario against target, captures all layers, returns golden Fixture
   */
  async record(scenario: InboundScenario): Promise<InboundFixture>;
  async record(scenario: ActionScenario): Promise<ActionFixture>;
  async record(scenario: ScenarioDefinition): Promise<Fixture>;
  async record(scenario: ScenarioDefinition): Promise<Fixture> {
    const { dbBefore, redisBefore, response, dbAfter, redisAfter } = await this.captureRun(
      scenario
    );

    const hasRedis = scenario.redisProbe && scenario.redisProbe.keys.length > 0;

    const fixtureLayers = {
      scenarioId: scenario.id,
      layer2_dbState: {
        before: dbBefore,
        after: dbAfter,
      },
      layer4_sharedResources: hasRedis
        ? {
            redis: {
              before: redisBefore,
              after: redisAfter,
            },
          }
        : undefined,
    };

    if (scenario.action) return fixtureLayers satisfies ActionFixture;
    if (!response) throw new Error(`Inbound scenario "${scenario.id}" produced no response`);
    return {
      ...fixtureLayers,
      layer1_inboundResponse: {
        statusCode: response.statusCode,
        statusText: response.statusText,
        headers: {
          "content-type": response.headers["content-type"] || "application/json",
        },
        body: response.body,
      },
    } satisfies InboundFixture;
  }

  /**
   * VERIFY mode: Runs scenario against target, compares all layers with golden Fixture.
   * Both before and after snapshots are compared: a pre-condition mismatch (e.g. seed
   * data drift) is a contract failure just as much as a post-condition mismatch.
   */
  async verify(scenario: ScenarioDefinition, golden: Fixture): Promise<VerifyResult> {
    const differences: Difference[] = [];

    const { dbBefore, redisBefore, response, dbAfter, redisAfter } = await this.captureRun(
      scenario
    );

    if (scenario.action) {
      if (golden.layer1_inboundResponse) {
        throw new Error(`Action scenario "${scenario.id}" cannot use an inbound response fixture`);
      }
    } else {
      if (!response || !golden.layer1_inboundResponse) {
        throw new Error(`Inbound scenario "${scenario.id}" requires an inbound response fixture`);
      }
      differences.push(...compareInboundResponse(
        { statusCode: response.statusCode, body: response.body },
        {
          statusCode: golden.layer1_inboundResponse.statusCode,
          body: golden.layer1_inboundResponse.body,
        }
      ));
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

    return {
      scenarioId: scenario.id,
      passed: differences.length === 0,
      differences,
    };
  }
}
