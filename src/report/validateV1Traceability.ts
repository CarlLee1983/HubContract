import type { Fixture, ScenarioDefinition } from "../schema/scenario";
import { V1_SCENARIO_BUSINESS_RULES } from "./v1ScenarioBusinessRules";

// The route inventory and primary capabilities are independent of the matrix under test.
// Source: HubRefactoring docs/legacy-baseline/evidence/crosscut.md §0.1 and
// docs/renovation/capability-map.md §1.
export const V1_CAPABILITIES = {
  "GET /v1/player": "CAP-03",
  "GET /v1/player/balance": "CAP-03",
  "POST /v1/player": "CAP-02",
  "POST /v1/wallet/deposit": "CAP-04",
  "POST /v1/wallet/withdraw": "CAP-05",
  "POST /v1/wallet/check-transaction": "CAP-06",
  "POST /v1/wallet/check-transaction-for-test": "CAP-07",
  "POST /v1/wallet/balance-difference": "CAP-08",
  "GET /v1/games": "CAP-09",
  "GET /v1/games/types": "CAP-09",
  "GET /v1/games/companies": "CAP-09",
  "POST /v1/games/launch": "CAP-11",
  "GET /v1/currencies": "CAP-14",
  "GET /v1/currencies/exchange-rate": "CAP-14",
  "GET /v1/currencies/exchange-rate/{currency}": "CAP-14",
  "GET /v1/sms": "CAP-15",
  "POST /v1/sms": "CAP-15",
  "POST /v1/sms/send": "CAP-15",
  "POST /v1/sms/amount": "CAP-15",
  "GET /v1/server/status": "CAP-17",
} as const;

type Case = "success" | "legacy-defect" | "validation" | "signature" | "unknown-station" | "business";
type Layer = "http" | "db" | "outbound" | "redis" | "mongo";
const CASES = new Set<Case>(["success", "legacy-defect", "validation", "signature", "unknown-station", "business"]);
const LAYERS = new Set<Layer>(["http", "db", "outbound", "redis", "mongo"]);
// Numbered IDs defined in HubRefactoring docs/legacy-baseline/03-business-rules.md.
const VALID_BR = new Set([
  ...range(1, 5), ...range(10, 14), ...range(20, 26), ...range(30, 35),
  ...range(40, 48), ...range(50, 61), ...range(70, 72), ...range(80, 81), ...range(90, 94),
].map((n) => `BR-${String(n).padStart(2, "0")}`));

// Route applicability is independent of scenario tags and matrix entries.
// Sources: HubRefactoring docs/legacy-baseline/03-business-rules.md and
// docs/renovation/capability-map.md. BR-01 applies to signed v1 routes;
// launch also exercises CAP-10 wallet sync and CAP-13 PG callback rules.
const V1_ROUTE_BR: Record<keyof typeof V1_CAPABILITIES, readonly string[]> = {
  "GET /v1/player": ["BR-04", "BR-13", "BR-42"],
  "GET /v1/player/balance": ["BR-04", "BR-42"],
  "POST /v1/player": ["BR-02", "BR-03"],
  "POST /v1/wallet/deposit": ["BR-02", "BR-04", "BR-10", "BR-11", "BR-12", "BR-20", "BR-21", "BR-22", "BR-23", "BR-30", "BR-31", "BR-32", "BR-40", "BR-41", "BR-42", "BR-43", "BR-44", "BR-46", "BR-47", "BR-48"],
  "POST /v1/wallet/withdraw": ["BR-02", "BR-04", "BR-10", "BR-11", "BR-20", "BR-21", "BR-22", "BR-24", "BR-25", "BR-31", "BR-33", "BR-40", "BR-41", "BR-42", "BR-45", "BR-47", "BR-48"],
  "POST /v1/wallet/check-transaction": ["BR-05", "BR-21", "BR-26"],
  "POST /v1/wallet/check-transaction-for-test": ["BR-04", "BR-21", "BR-47", "BR-48"],
  "POST /v1/wallet/balance-difference": ["BR-04", "BR-35"],
  "GET /v1/games": ["BR-53", "BR-70", "BR-71", "BR-72"],
  "GET /v1/games/types": [],
  "GET /v1/games/companies": [],
  "POST /v1/games/launch": ["BR-02", "BR-04", "BR-32", "BR-33", "BR-34", "BR-40", "BR-41", "BR-42", "BR-43", "BR-44", "BR-47", "BR-48", "BR-50", "BR-51", "BR-52", "BR-53", "BR-54", "BR-55", "BR-56", "BR-57", "BR-58", "BR-59", "BR-60", "BR-61", "BR-80", "BR-81"],
  "GET /v1/currencies": [],
  "GET /v1/currencies/exchange-rate": ["BR-92"],
  "GET /v1/currencies/exchange-rate/{currency}": ["BR-92"],
  "GET /v1/sms": [],
  "POST /v1/sms": [],
  "POST /v1/sms/send": ["BR-90", "BR-91"],
  "POST /v1/sms/amount": [],
  "GET /v1/server/status": [],
};

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export interface MatrixScenario {
  id: string;
  fixtureId: string;
  outcome: string;
  cases: Case[];
  businessRules: string[];
  noNumberedRule: boolean;
  layers: Layer[];
}
export interface MatrixRoute {
  method: string;
  path: string;
  capability: string;
  requiredCases: Case[];
  coverageGaps?: { case: Case; issue: string }[];
  scenarios: MatrixScenario[];
}
export interface V1Matrix { routes: MatrixRoute[] }
export interface TraceabilityInput {
  matrix: V1Matrix;
  scenarios: ScenarioDefinition[];
  fixtures: Fixture[];
}

export function canonicalV1Route(method: string, path: string): string {
  const cleanPath = path.replace(/\/+$/, "") || "/";
  const template = /^\/v1\/currencies\/exchange-rate\/[^/]+$/.test(cleanPath)
    ? "/v1/currencies/exchange-rate/{currency}" : cleanPath;
  return `${method.toUpperCase()} ${template}`;
}

function scenarioV1Routes(scenario: ScenarioDefinition): string[] {
  const routes = scenario.route ? [scenario.route] : scenario.steps?.map((step) => step.route) ?? [];
  return [...new Set(routes.filter((route) => route.path.startsWith("/v1/"))
    .map((route) => canonicalV1Route(route.method, route.path)))];
}

function fixtureLayers(fixture: Fixture): Set<Layer> {
  const layers = new Set<Layer>();
  if (fixture.layer1_inboundResponse || fixture.stepResponses) layers.add("http");
  if (fixture.layer2_dbState) layers.add("db");
  if (fixture.layer3_outboundCalls) layers.add("outbound");
  if (fixture.layer4_sharedResources?.redis || fixture.redisCheckpoints) layers.add("redis");
  if (fixture.layer4_sharedResources?.mongo) layers.add("mongo");
  return layers;
}

export function validateV1Traceability({ matrix, scenarios, fixtures }: TraceabilityInput): string[] {
  const errors: string[] = [];
  const expected = V1_CAPABILITIES as Record<string, string>;
  if (!matrix || !Array.isArray(matrix.routes)) return ["matrix.routes must be an array"];
  const routes = new Map<string, MatrixRoute>();
  for (const route of matrix.routes) {
    const key = canonicalV1Route(route.method, route.path);
    if (!expected[key]) errors.push(`unexpected matrix route ${key}`);
    if (routes.has(key)) errors.push(`duplicate matrix route ${key}`);
    routes.set(key, route);
    if (route.capability !== expected[key]) errors.push(`${key}: expected ${expected[key]}, got ${route.capability}`);
    if (!Array.isArray(route.requiredCases) || !Array.isArray(route.scenarios)) {
      errors.push(`${key}: requiredCases and scenarios must be arrays`);
      continue;
    }
    const required = new Set(route.requiredCases);
    for (const value of required) if (!CASES.has(value)) errors.push(`${key}: invalid required case ${value}`);
    if (!required.has("success") && !required.has("legacy-defect")) errors.push(`${key}: require success or legacy-defect`);
    if (key === "POST /v1/sms/send" && required.has("success")) errors.push(`${key}: recorded Legacy success path is broken`);
    if (key === "GET /v1/player/balance" && required.has("success")) errors.push(`${key}: recorded Legacy success path is broken`);
    if (key === "GET /v1/server/status") {
      if (required.has("signature")) errors.push(`${key}: unsigned route cannot require signature`);
    } else if (!required.has("signature")) errors.push(`${key}: signature case required`);
    const present = new Set(route.scenarios.flatMap((entry) => entry.cases ?? []));
    const gaps = new Set<Case>();
    for (const gap of route.coverageGaps ?? []) {
      if (!CASES.has(gap.case) || !required.has(gap.case) || !/^.+#\d+$/.test(gap.issue)) {
        errors.push(`${key}: invalid coverage gap ${gap.case} / ${gap.issue}`);
      }
      if (gaps.has(gap.case)) errors.push(`${key}: duplicate coverage gap ${gap.case}`);
      if (present.has(gap.case)) errors.push(`${key}: stale coverage gap ${gap.case}`);
      gaps.add(gap.case);
    }
    for (const value of required) if (!present.has(value) && !gaps.has(value)) errors.push(`${key}: missing required ${value} case`);
  }
  for (const key of Object.keys(expected)) if (!routes.has(key)) errors.push(`missing matrix route ${key}`);
  if (matrix.routes.length !== 20) errors.push(`expected 20 matrix routes, got ${matrix.routes.length}`);

  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.scenarioId, fixture]));
  if (scenarioById.size !== scenarios.length) errors.push("duplicate scenario IDs");
  if (fixtureById.size !== fixtures.length) errors.push("duplicate fixture scenario IDs");
  const mapped = new Map<string, string>();
  const expectedScenarioRules = V1_SCENARIO_BUSINESS_RULES as Record<string, readonly string[]>;
  for (const [key, route] of routes) {
    for (const entry of route.scenarios ?? []) {
      const prefix = `${key} / ${entry.id}`;
      if (mapped.has(entry.id)) errors.push(`${prefix}: scenario already mapped to ${mapped.get(entry.id)}`);
      mapped.set(entry.id, key);
      const scenario = scenarioById.get(entry.id);
      if (!scenario) { errors.push(`${prefix}: scenario missing`); continue; }
      if (!scenarioV1Routes(scenario).includes(key)) errors.push(`${prefix}: scenario route mismatch`);
      const fixture = fixtureById.get(entry.id);
      if (entry.fixtureId !== entry.id || !fixture) errors.push(`${prefix}: fixtureId must identify existing fixture ${entry.id}`);
      const tags = scenario.tags ?? [];
      const caps = tags.filter((tag) => tag.startsWith("CAP-"));
      if (!caps.includes(expected[key])) errors.push(`${prefix}: missing route capability ${expected[key]}`);
      const hasPgCallback = scenario.steps?.some((step) =>
        step.route.method === "POST" && step.route.path === "/callback/game/pg/verifySession") ?? false;
      for (const cap of caps) {
        if (cap !== expected[key] && cap !== "CAP-01" && !(cap === "CAP-13" && hasPgCallback)) {
          errors.push(`${prefix}: wrong capability ${cap}`);
        }
      }
      if (!Array.isArray(entry.businessRules) || !Array.isArray(entry.cases) || !Array.isArray(entry.layers)) {
        errors.push(`${prefix}: businessRules, cases and layers must be arrays`);
        continue;
      }
      const tagBR = tags.filter((tag) => tag.startsWith("BR-"));
      if (new Set(tagBR).size !== tagBR.length ||
        tagBR.length !== entry.businessRules.length || tagBR.some((tag) => !entry.businessRules.includes(tag))) {
        errors.push(`${prefix}: BR tags and matrix businessRules differ`);
      }
      const applicableBR = new Set([...(key === "GET /v1/server/status" ? [] : ["BR-01"]), ...(V1_ROUTE_BR[key as keyof typeof V1_CAPABILITIES] ?? [])]);
      for (const br of new Set([...tagBR, ...entry.businessRules])) {
        if (!VALID_BR.has(br)) errors.push(`${prefix}: invalid business rule ${br}`);
        else if (!applicableBR.has(br)) errors.push(`${prefix}: business rule ${br} does not apply to route`);
      }
      const expectedBR = expectedScenarioRules[entry.id];
      if (!expectedBR) errors.push(`${prefix}: missing reviewed scenario business rules`);
      else {
        const expectedSet = new Set(expectedBR);
        for (const br of expectedBR) {
          if (!tagBR.includes(br)) errors.push(`${prefix}: missing expected BR tag ${br}`);
          if (!entry.businessRules.includes(br)) errors.push(`${prefix}: missing expected matrix business rule ${br}`);
        }
        for (const br of tagBR) if (!expectedSet.has(br)) errors.push(`${prefix}: unexpected BR tag ${br}`);
        for (const br of entry.businessRules) if (!expectedSet.has(br)) errors.push(`${prefix}: unexpected matrix business rule ${br}`);
      }
      if (entry.businessRules.every((br) => br === "BR-01") && entry.noNumberedRule !== true) {
        errors.push(`${prefix}: missing route-specific BR or explicit noNumberedRule`);
      }
      if (entry.noNumberedRule === true && entry.businessRules.some((br) => br !== "BR-01")) {
        errors.push(`${prefix}: noNumberedRule contradicts route-specific BR`);
      }
      if (typeof entry.noNumberedRule !== "boolean") errors.push(`${prefix}: noNumberedRule must be boolean`);
      for (const value of entry.cases) if (!CASES.has(value)) errors.push(`${prefix}: invalid case ${value}`);
      if (key === "GET /v1/server/status" && entry.cases.includes("signature")) errors.push(`${prefix}: unsigned status has no signature case`);
      if (key === "POST /v1/sms/send" && entry.cases.includes("success")) errors.push(`${prefix}: fictional SMS success`);
      if (key === "GET /v1/player/balance" && entry.cases.includes("success")) errors.push(`${prefix}: broken balance response is not success`);
      for (const layer of entry.layers) if (!LAYERS.has(layer)) errors.push(`${prefix}: invalid layer ${layer}`);
      if (!entry.layers.includes("outbound")) errors.push(`${prefix}: missing outbound layer`);
      if (fixture) {
        const actual = fixtureLayers(fixture);
        if (actual.size !== new Set(entry.layers).size || [...actual].some((layer) => !entry.layers.includes(layer))) {
          errors.push(`${prefix}: layers differ from fixture (${[...actual].join(", ")})`);
        }
      }
    }
  }
  for (const scenario of scenarios) {
    for (const key of scenarioV1Routes(scenario)) {
      if (!expected[key]) errors.push(`${scenario.id}: unmapped v1 route ${key}`);
      if (mapped.get(scenario.id) !== key) errors.push(`${scenario.id}: missing matrix mapping for ${key}`);
      if (!fixtureById.has(scenario.id)) errors.push(`${scenario.id}: fixture missing`);
    }
  }
  for (const id of Object.keys(expectedScenarioRules)) {
    if (!mapped.has(id)) errors.push(`${id}: reviewed scenario missing matrix mapping`);
  }
  for (const fixture of fixtures) {
    const scenario = scenarioById.get(fixture.scenarioId);
    if (!scenario) errors.push(`${fixture.scenarioId}: orphan fixture`);
    else if (scenarioV1Routes(scenario).length && !mapped.has(fixture.scenarioId)) errors.push(`${fixture.scenarioId}: v1 fixture unmapped`);
  }
  return errors;
}
