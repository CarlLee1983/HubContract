import { describe, expect, it } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { FixtureSchema, ScenarioDefinitionSchema } from "../src/schema/scenario";
import { listJsonFilesRecursive } from "../src/report/loadScenarios";
import { canonicalV1Route, validateV1Traceability, type V1Matrix } from "../src/report/validateV1Traceability";

const root = path.join(__dirname, "..");

async function checkedInInput() {
  const matrix = JSON.parse(await fs.readFile(path.join(root, "docs/v1-route-scenario-matrix.json"), "utf8")) as V1Matrix;
  const scenarioFiles = await listJsonFilesRecursive(path.join(root, "scenarios"));
  const fixtureFiles = (await listJsonFilesRecursive(path.join(root, "fixtures")))
    .filter((file) => file.endsWith(".fixture.json"));
  const scenarios = await Promise.all(scenarioFiles.map(async (file) =>
    ScenarioDefinitionSchema.parse(JSON.parse(await fs.readFile(file, "utf8")))));
  const fixtures = await Promise.all(fixtureFiles.map(async (file) =>
    FixtureSchema.parse(JSON.parse(await fs.readFile(file, "utf8")))));
  return { matrix, scenarios, fixtures };
}

describe("v1 traceability validator", () => {
  it("normalizes trailing slash and exchange-rate currency values", () => {
    expect(canonicalV1Route("GET", "/v1/player/")).toBe("GET /v1/player");
    expect(canonicalV1Route("GET", "/v1/currencies/exchange-rate/TWD"))
      .toBe("GET /v1/currencies/exchange-rate/{currency}");
  });

  it("accepts the checked-in matrix", async () => {
    expect(validateV1Traceability(await checkedInInput())).toEqual([]);
  });

  it("rejects valid but wrong capability tags on launch", async () => {
    const input = await checkedInInput();
    const launch = input.scenarios.find((scenario) => scenario.id === "pg-launch-callback")!;
    launch.tags.push("CAP-03");
    expect(validateV1Traceability(input).join("\n")).toContain("wrong capability CAP-03");
  });

  it("rejects missing route-specific BR without an explicit exception", async () => {
    const input = await checkedInInput();
    input.matrix.routes[0]!.scenarios.find((entry) => entry.id === "player-query-signature-failed")!.noNumberedRule = false;
    expect(validateV1Traceability(input).join("\n")).toContain("missing route-specific BR");
  });

  it("rejects an unmapped scenario and invalid BR", async () => {
    const input = await checkedInInput();
    input.matrix.routes[0]!.scenarios[0]!.businessRules = ["BR-99"];
    input.matrix.routes[1]!.scenarios = [];
    const errors = validateV1Traceability(input).join("\n");
    expect(errors).toContain("invalid business rule BR-99");
    expect(errors).toContain("missing matrix mapping");
  });

  it("rejects a valid BR from another route even when tag and matrix agree", async () => {
    const input = await checkedInInput();
    const deposit = input.matrix.routes.find((route) => route.path === "/v1/wallet/deposit")!;
    const scenario = input.scenarios.find((scenario) => scenario.route?.path === deposit.path)!;
    deposit.scenarios[0]!.businessRules = ["BR-70"];
    deposit.scenarios[0]!.noNumberedRule = false;
    scenario.tags = ["CAP-04", "BR-70"];
    expect(validateV1Traceability(input).join("\n"))
      .toContain("business rule BR-70 does not apply to route");
  });

  it("rejects an inapplicable BR added to both tag and matrix for a signature failure", async () => {
    const input = await checkedInInput();
    const entry = input.matrix.routes.find((route) => route.path === "/v1/wallet/deposit")!
      .scenarios.find((scenario) => scenario.id === "deposit-signature-failed")!;
    const scenario = input.scenarios.find((scenario) => scenario.id === entry.id)!;
    entry.businessRules.push("BR-46");
    entry.noNumberedRule = false;
    scenario.tags.push("BR-46");
    const errors = validateV1Traceability(input).join("\n");
    expect(errors).toContain("unexpected BR tag BR-46");
    expect(errors).toContain("unexpected matrix business rule BR-46");
  });

  it("rejects a required BR removed from both tag and matrix for deposit success", async () => {
    const input = await checkedInInput();
    const entry = input.matrix.routes.find((route) => route.path === "/v1/wallet/deposit")!
      .scenarios.find((scenario) => scenario.id === "deposit-success")!;
    const scenario = input.scenarios.find((scenario) => scenario.id === entry.id)!;
    entry.businessRules = entry.businessRules.filter((br) => br !== "BR-11");
    scenario.tags = scenario.tags.filter((tag) => tag !== "BR-11");
    const errors = validateV1Traceability(input).join("\n");
    expect(errors).toContain("missing expected BR tag BR-11");
    expect(errors).toContain("missing expected matrix business rule BR-11");
  });

  it("requires a reviewed BR set before adding a v1 scenario", async () => {
    const input = await checkedInInput();
    const route = input.matrix.routes.find((route) => route.path === "/v1/wallet/deposit")!;
    const original = route.scenarios.find((scenario) => scenario.id === "deposit-signature-failed")!;
    const id = "deposit-new-signature-case";
    route.scenarios.push({ ...original, id, fixtureId: id });
    const scenario = input.scenarios.find((scenario) => scenario.id === original.id)!;
    input.scenarios.push({ ...scenario, id });
    const fixture = input.fixtures.find((fixture) => fixture.scenarioId === original.id)!;
    input.fixtures.push({ ...fixture, scenarioId: id });
    expect(validateV1Traceability(input).join("\n"))
      .toContain("missing reviewed scenario business rules");
  });

  it("rejects fictional SMS success and status signature cases", async () => {
    const input = await checkedInInput();
    const sms = input.matrix.routes.find((route) => route.path === "/v1/sms/send")!;
    sms.scenarios[0]!.cases.push("success");
    const status = input.matrix.routes.find((route) => route.path === "/v1/server/status")!;
    status.requiredCases.push("signature");
    const errors = validateV1Traceability(input).join("\n");
    expect(errors).toContain("fictional SMS success");
    expect(errors).toContain("unsigned route cannot require signature");
  });

  it("rejects success classification for the broken player balance route", async () => {
    const input = await checkedInInput();
    const balance = input.matrix.routes.find((route) => route.path === "/v1/player/balance")!;
    balance.requiredCases[0] = "success";
    balance.scenarios[0]!.cases[0] = "success";
    const errors = validateV1Traceability(input).join("\n");
    expect(errors).toContain("recorded Legacy success path is broken");
    expect(errors).toContain("broken balance response is not success");
  });

  it("maps the v1 launch step without treating a callback step as another v1 route", async () => {
    const input = await checkedInInput();
    const scenario = input.scenarios.find((scenario) => scenario.id === "pg-launch-callback")!;
    expect(validateV1Traceability(input)).toEqual([]);
    scenario.steps!.pop();
    expect(validateV1Traceability(input).join("\n")).toContain("wrong capability CAP-13");
  });

  it("rejects layer and fixture linkage drift", async () => {
    const input = await checkedInInput();
    input.matrix.routes[0]!.scenarios[0]!.layers = ["http", "db"];
    input.matrix.routes[0]!.scenarios[0]!.fixtureId = "other";
    const errors = validateV1Traceability(input).join("\n");
    expect(errors).toContain("layers differ from fixture");
    expect(errors).toContain("fixtureId must identify existing fixture");
  });

  it("accepts an explicitly tracked missing case but rejects an untracked one", async () => {
    const input = await checkedInInput();
    const launch = input.matrix.routes.find((route) => route.path === "/v1/games/launch")!;
    expect(validateV1Traceability(input)).toEqual([]);
    launch.coverageGaps = launch.coverageGaps?.filter((gap) => gap.case !== "signature");
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
