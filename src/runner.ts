import type { ScenarioDefinition, Fixture } from "./schema/scenario";
import { signRequest } from "./signer/signature";
import { applyNormalizers } from "./normalizer/normalizer";
import { MariaDbProbe } from "./probe/dbProbe";
import { compareInboundResponse, compareDbState, type Difference } from "./comparator/comparator";

export interface RunnerOptions {
  baseUrl: string;
  dbConfig?: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
  };
  fixedTimestamp?: number;
}

export interface VerifyResult {
  scenarioId: string;
  passed: boolean;
  differences: Difference[];
}

export class ContractRunner {
  private baseUrl: string;
  private dbProbe: MariaDbProbe;
  private fixedTimestamp?: number;

  constructor(options: RunnerOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.dbProbe = new MariaDbProbe(options.dbConfig);
    this.fixedTimestamp = options.fixedTimestamp;
  }

  async close(): Promise<void> {
    await this.dbProbe.close();
  }

  /**
   * Prepares and executes HTTP request according to scenario definition
   */
  private async executeRequest(scenario: ScenarioDefinition): Promise<{
    requestData: any;
    response: {
      statusCode: number;
      statusText: string;
      headers: Record<string, string>;
      body: any;
    };
  }> {
    const rawReq = JSON.parse(JSON.stringify(scenario.request));

    // 1. Apply normalizers to request (e.g. current_timestamp)
    applyNormalizers({ request: rawReq }, scenario.normalizers, {
      fixedTimestamp: this.fixedTimestamp,
    });

    // 2. Sign request if signWith is specified
    if (rawReq.signWith?.secretKey) {
      const payloadToSign = { ...(rawReq.body || {}), ...(rawReq.query || {}) };
      const sign = signRequest(payloadToSign, rawReq.signWith.secretKey);
      if (rawReq.body) {
        rawReq.body.sign = sign;
      } else if (rawReq.query) {
        rawReq.query.sign = sign;
      }
    }

    // 3. Assemble URL
    const url = new URL(this.baseUrl + scenario.route.path);
    if (rawReq.query) {
      for (const [k, v] of Object.entries(rawReq.query)) {
        url.searchParams.append(k, String(v));
      }
    }

    // 4. Send HTTP request
    const headers: Record<string, string> = {
      ...(rawReq.headers || {}),
    };
    if (rawReq.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const fetchOptions: RequestInit = {
      method: scenario.route.method,
      headers,
    };
    if (rawReq.body && scenario.route.method !== "GET") {
      fetchOptions.body = JSON.stringify(rawReq.body);
    }

    const res = await fetch(url.toString(), fetchOptions);
    const contentType = res.headers.get("content-type") || "";
    let body: any;
    if (contentType.includes("application/json")) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });

    const response = {
      statusCode: res.status,
      statusText: res.statusText,
      headers: resHeaders,
      body,
    };

    // 5. Apply normalizers to response
    applyNormalizers({ response }, scenario.normalizers, {
      fixedTimestamp: this.fixedTimestamp,
    });

    return { requestData: rawReq, response };
  }

  /**
   * RECORD mode: Runs scenario against target, captures all layers, returns golden Fixture
   */
  async record(scenario: ScenarioDefinition): Promise<Fixture> {
    // Layer 2: DB Probe before
    const dbBefore = await this.dbProbe.capture(scenario.dbProbe);

    // Layer 1: Execute inbound request
    const { response } = await this.executeRequest(scenario);

    // Layer 2: DB Probe after
    const dbAfter = await this.dbProbe.capture(scenario.dbProbe);

    const fixture: Fixture = {
      scenarioId: scenario.id,
      recordedAt: this.fixedTimestamp
        ? new Date(this.fixedTimestamp * 1000).toISOString()
        : "1970-01-01T00:00:00.000Z",
      layer1_inboundResponse: {
        statusCode: response.statusCode,
        statusText: response.statusText,
        headers: {
          "content-type": response.headers["content-type"] || "application/json",
        },
        body: response.body,
      },
      layer2_dbState: {
        before: dbBefore,
        after: dbAfter,
      },
    };

    return fixture;
  }

  /**
   * VERIFY mode: Runs scenario against target, compares all layers with golden Fixture
   */
  async verify(scenario: ScenarioDefinition, golden: Fixture): Promise<VerifyResult> {
    const differences: Difference[] = [];

    // Layer 2: DB Probe before
    const dbBefore = await this.dbProbe.capture(scenario.dbProbe);

    // Layer 1: Inbound request
    const { response } = await this.executeRequest(scenario);

    // Layer 2: DB Probe after
    const dbAfter = await this.dbProbe.capture(scenario.dbProbe);

    // Compare Layer 1: Inbound Response
    const responseDiffs = compareInboundResponse(
      { statusCode: response.statusCode, body: response.body },
      {
        statusCode: golden.layer1_inboundResponse.statusCode,
        body: golden.layer1_inboundResponse.body,
      }
    );
    differences.push(...responseDiffs);

    // Compare Layer 2: DB State (after)
    if (golden.layer2_dbState) {
      const dbDiffs = compareDbState(dbAfter, golden.layer2_dbState.after);
      differences.push(...dbDiffs);
    }

    return {
      scenarioId: scenario.id,
      passed: differences.length === 0,
      differences,
    };
  }
}
