import { describe, expect, it } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { FixtureSchema, ScenarioDefinitionSchema, type Fixture, type ScenarioDefinition } from "../src/schema/scenario";
import { listJsonFilesRecursive } from "../src/report/loadScenarios";
import { canonicalV1Route, validateV1Traceability, V1_CAPABILITIES, type V1Matrix } from "../src/report/validateV1Traceability";

const root = path.join(__dirname, "..");

function syntheticInput() {
  const scenarios: ScenarioDefinition[] = [];
  const fixtures: Fixture[] = [];
  const routes: V1Matrix["routes"] = [];
  for (const [index, [key, capability]] of Object.entries(V1_CAPABILITIES).entries()) {
    const space = key.indexOf(" ");
    const method = key.slice(0, space);
    const path = key.slice(space + 1);
    const id = `v1-synthetic-${index}`;
    const isStatus = path === "/v1/server/status";
    const isSmsSend = path === "/v1/sms/send";
    const isBrokenBalance = path === "/v1/player/balance";
    const cases = [isSmsSend || isBrokenBalance ? "legacy-defect" : "success", ...(!isStatus ? ["signature"] : [])] as V1Matrix["routes"][number]["requiredCases"];
    scenarios.push(ScenarioDefinitionSchema.parse({ id, name: id, route: { method, path }, tags: [capability, ...(!isStatus ? ["BR-01"] : [])], request: { headers: {} } }));
    fixtures.push(FixtureSchema.parse({ scenarioId: id, layer1_inboundResponse: { statusCode: 200, statusText: "OK", headers: {}, body: {} } }));
    routes.push({ method, path, capability, requiredCases: cases, scenarios: [{ id, fixtureId: id, outcome: "synthetic", cases, businessRules: isStatus ? [] : ["BR-01"], noNumberedRule: true, layers: ["http"] }] });
  }
  return { matrix: { routes }, scenarios, fixtures };
}

describe("v1 traceability validator", () => {
  it("normalizes trailing slash and exchange-rate currency values", () => {
    expect(canonicalV1Route("GET", "/v1/player/")).toBe("GET /v1/player");
    expect(canonicalV1Route("GET", "/v1/currencies/exchange-rate/TWD"))
      .toBe("GET /v1/currencies/exchange-rate/{currency}");
  });

  it("accepts a complete synthetic matrix", () => {
    expect(validateV1Traceability(syntheticInput())).toEqual([]);
  });

  it("rejects valid but wrong capability tags on launch", () => {
    const input = syntheticInput();
    const launch = input.scenarios.find((scenario) => scenario.route?.path === "/v1/games/launch")!;
    launch.tags.push("CAP-03");
    expect(validateV1Traceability(input).join("\n")).toContain("wrong capability CAP-03");
  });

  it("rejects missing route-specific BR without an explicit exception", () => {
    const input = syntheticInput();
    input.matrix.routes[0]!.scenarios[0]!.noNumberedRule = false;
    expect(validateV1Traceability(input).join("\n")).toContain("missing route-specific BR");
  });

  it("rejects an unmapped scenario and invalid BR", () => {
    const input = syntheticInput();
    input.matrix.routes[0]!.scenarios[0]!.businessRules = ["BR-99"];
    input.matrix.routes[1]!.scenarios = [];
    const errors = validateV1Traceability(input).join("\n");
    expect(errors).toContain("invalid business rule BR-99");
    expect(errors).toContain("missing matrix mapping");
  });

  it("rejects a valid BR from another route even when tag and matrix agree", () => {
    const input = syntheticInput();
    const deposit = input.matrix.routes.find((route) => route.path === "/v1/wallet/deposit")!;
    const scenario = input.scenarios.find((scenario) => scenario.route?.path === deposit.path)!;
    deposit.scenarios[0]!.businessRules = ["BR-70"];
    deposit.scenarios[0]!.noNumberedRule = false;
    scenario.tags = ["CAP-04", "BR-70"];
    expect(validateV1Traceability(input).join("\n"))
      .toContain("business rule BR-70 does not apply to route");
  });

  it("rejects fictional SMS success and status signature cases", () => {
    const input = syntheticInput();
    const sms = input.matrix.routes.find((route) => route.path === "/v1/sms/send")!;
    sms.scenarios[0]!.cases.push("success");
    const status = input.matrix.routes.find((route) => route.path === "/v1/server/status")!;
    status.requiredCases.push("signature");
    const errors = validateV1Traceability(input).join("\n");
    expect(errors).toContain("fictional SMS success");
    expect(errors).toContain("unsigned route cannot require signature");
  });

  it("rejects success classification for the broken player balance route", () => {
    const input = syntheticInput();
    const balance = input.matrix.routes.find((route) => route.path === "/v1/player/balance")!;
    balance.requiredCases[0] = "success";
    balance.scenarios[0]!.cases[0] = "success";
    const errors = validateV1Traceability(input).join("\n");
    expect(errors).toContain("recorded Legacy success path is broken");
    expect(errors).toContain("broken balance response is not success");
  });

  it("maps the v1 launch step without treating a callback step as another v1 route", () => {
    const input = syntheticInput();
    const index = input.scenarios.findIndex((scenario) => scenario.route?.path === "/v1/games/launch");
    const original = input.scenarios[index]!;
    input.scenarios[index] = ScenarioDefinitionSchema.parse({
      id: original.id, name: original.name, tags: [...original.tags, "CAP-13"],
      steps: [
        { id: "launch", route: { method: "POST", path: "/v1/games/launch" }, request: { headers: {} } },
        { id: "callback", route: { method: "POST", path: "/callback/game/pg/verifySession" }, request: { headers: {} } },
      ],
    });
    input.fixtures[index] = FixtureSchema.parse({ scenarioId: original.id, stepResponses: [{ id: "launch", statusCode: 200, statusText: "OK", headers: {}, body: {} }] });
    expect(validateV1Traceability(input)).toEqual([]);
    input.scenarios[index]!.steps!.pop();
    expect(validateV1Traceability(input).join("\n")).toContain("wrong capability CAP-13");
  });

  it("rejects layer and fixture linkage drift", () => {
    const input = syntheticInput();
    input.matrix.routes[0]!.scenarios[0]!.layers = ["http", "db"];
    input.matrix.routes[0]!.scenarios[0]!.fixtureId = "other";
    const errors = validateV1Traceability(input).join("\n");
    expect(errors).toContain("layers differ from fixture");
    expect(errors).toContain("fixtureId must identify existing fixture");
  });

  it("accepts an explicitly tracked missing case but rejects an untracked one", () => {
    const input = syntheticInput();
    const launch = input.matrix.routes.find((route) => route.path === "/v1/games/launch")!;
    launch.scenarios[0]!.cases = ["success"];
    launch.coverageGaps = [{ case: "signature", issue: "CarlLee1983/HubRefactoring#51" }];
    expect(validateV1Traceability(input)).toEqual([]);
    launch.coverageGaps = [];
    expect(validateV1Traceability(input).join("\n")).toContain("missing required signature case");
  });
});

it("classifies the recorded player balance float-offset response as a Legacy defect", async () => {
  const matrix = JSON.parse(await fs.readFile(path.join(root, "docs/v1-route-scenario-matrix.json"), "utf8")) as V1Matrix;
  const route = matrix.routes.find((route) => route.path === "/v1/player/balance")!;
  const entry = route.scenarios.find((scenario) => scenario.id === "player-balance-outbound-success")!;
  const fixture = FixtureSchema.parse(JSON.parse(await fs.readFile(path.join(root, "fixtures/player-balance-outbound-success.fixture.json"), "utf8")));
  expect(fixture.layer1_inboundResponse?.statusCode).toBe(200);
  expect(fixture.layer1_inboundResponse?.body).toEqual({ message: "Trying to access array offset on float" });
  expect(route.requiredCases).toContain("legacy-defect");
  expect(route.requiredCases).not.toContain("success");
  expect(entry.cases).toEqual(["legacy-defect"]);
});

it("validates the checked-in v1 matrix and all scenarios and fixtures", async () => {
  const matrixPath = path.join(root, "docs/v1-route-scenario-matrix.json");
  const matrix = JSON.parse(await fs.readFile(matrixPath, "utf8")) as V1Matrix;
  const scenarioFiles = await listJsonFilesRecursive(path.join(root, "scenarios"));
  const fixtureFiles = (await listJsonFilesRecursive(path.join(root, "fixtures"))).filter((file) => file.endsWith(".fixture.json"));
  const scenarios = await Promise.all(scenarioFiles.map(async (file) => ScenarioDefinitionSchema.parse(JSON.parse(await fs.readFile(file, "utf8")))));
  const fixtures = await Promise.all(fixtureFiles.map(async (file) => {
    const fixture = FixtureSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
    expect(path.basename(file)).toBe(`${fixture.scenarioId}.fixture.json`);
    return fixture;
  }));
  expect(validateV1Traceability({ matrix, scenarios, fixtures })).toEqual([]);
});
