import type { ScenarioDefinition } from "../schema/scenario";

/**
 * Issue #12: CLI --route/--tag filter criteria.
 *
 * Both flags are repeatable (`--route a --route b`), never a comma list (picked
 * to keep parseArgs simple and match Bun's native `multiple: true`). Within a
 * single flag the values are OR'd together; when both --route and --tag are
 * given, the two are AND'd (a scenario must match at least one route AND at
 * least one tag).
 */
export interface ScenarioFilterCriteria {
  routes?: string[];
  tags?: string[];
}

/**
 * Pure filter over already-parsed scenarios. No I/O: the CLI is responsible for
 * loading scenario files and handing the parsed list in here.
 */
export function filterScenarios(
  scenarios: ScenarioDefinition[],
  criteria: ScenarioFilterCriteria
): ScenarioDefinition[] {
  const { routes, tags } = criteria;

  return scenarios.filter((scenario) => {
    const matchesRoute = !routes || routes.length === 0 ||
      (scenario.route ? routes.includes(scenario.route.path) : false) ||
      (scenario.steps?.some((step) => routes.includes(step.route.path)) ?? false);
    const matchesTag = !tags || tags.length === 0 || scenario.tags.some((tag) => tags.includes(tag));
    return matchesRoute && matchesTag;
  });
}
