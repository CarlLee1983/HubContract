import { describe, expect, it } from "bun:test";
import { filterScenarios } from "../src/report/filterScenarios";
import type { ScenarioDefinition } from "../src/schema/scenario";

function scenario(overrides: Partial<ScenarioDefinition>): ScenarioDefinition {
  return {
    id: "s",
    name: "s",
    route: { method: "POST", path: "/v1/wallet/check-transaction" },
    request: { headers: {} },
    tags: [],
    normalizers: [],
    ...overrides,
  } as ScenarioDefinition;
}

describe("Issue #12: filterScenarios", () => {
  const scenarios: ScenarioDefinition[] = [
    scenario({ id: "deposit-hit", route: { method: "POST", path: "/v1/wallet/check-transaction" }, tags: ["wallet", "pilot"] }),
    scenario({ id: "withdrawal-hit", route: { method: "POST", path: "/v1/wallet/check-transaction" }, tags: ["wallet", "pilot", "withdrawal"] }),
    scenario({ id: "maintenance-set", route: { method: "POST", path: "/mcp/platform-maintenance/cq9" }, tags: ["mcp"] }),
  ];

  it("returns all scenarios when no filter is given", () => {
    expect(filterScenarios(scenarios, {})).toEqual(scenarios);
  });

  it("filters by a single route path", () => {
    const result = filterScenarios(scenarios, { routes: ["/mcp/platform-maintenance/cq9"] });
    expect(result.map((s) => s.id)).toEqual(["maintenance-set"]);
  });

  it("matches either route in a chained HTTP scenario", () => {
    const chained = scenario({
      route: undefined,
      steps: [
        { id: "launch", route: { method: "POST", path: "/v1/games/launch" }, request: { headers: {} } },
        { id: "callback", route: { method: "POST", path: "/callback/game/pg/verifySession" }, request: { headers: {} } },
      ],
    });
    expect(filterScenarios([chained], { routes: ["/callback/game/pg/verifySession"] })).toEqual([chained]);
  });

  it("matches ANY of multiple route filters (OR within routes)", () => {
    const result = filterScenarios(scenarios, {
      routes: ["/mcp/platform-maintenance/cq9", "/does-not-exist"],
    });
    expect(result.map((s) => s.id)).toEqual(["maintenance-set"]);
  });

  it("filters by a single tag", () => {
    const result = filterScenarios(scenarios, { tags: ["withdrawal"] });
    expect(result.map((s) => s.id)).toEqual(["withdrawal-hit"]);
  });

  it("matches ANY of multiple tag filters (OR within tags)", () => {
    const result = filterScenarios(scenarios, { tags: ["withdrawal", "mcp"] });
    expect(result.map((s) => s.id)).toEqual(["withdrawal-hit", "maintenance-set"]);
  });

  it("combines route and tag filters with AND", () => {
    const result = filterScenarios(scenarios, {
      routes: ["/v1/wallet/check-transaction"],
      tags: ["mcp"],
    });
    expect(result).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    const result = filterScenarios(scenarios, { tags: ["nonexistent"] });
    expect(result).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const copy = [...scenarios];
    filterScenarios(scenarios, { tags: ["mcp"] });
    expect(scenarios).toEqual(copy);
  });
});
