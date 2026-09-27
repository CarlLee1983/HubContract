import type { RedisKeyRecord, StubRequestRecord } from "../schema/scenario";
import type { DifferenceLayer } from "../schema/differenceLayer";

export interface Difference {
  layer: DifferenceLayer;
  path: string;
  expected: unknown;
  actual: unknown;
  message?: string;
}

/**
 * Recursive structural diff between actual and expected objects
 */
export function compareDiff(
  actual: any,
  expected: any,
  basePath: string,
  layer: Difference["layer"]
): Difference[] {
  const diffs: Difference[] = [];

  if (actual === expected) {
    return diffs;
  }

  // Handle Date vs string / Date vs Date
  const actualDate = actual instanceof Date ? actual.toISOString() : (typeof actual === "string" && !isNaN(Date.parse(actual)) ? actual : null);
  const expectedDate = expected instanceof Date ? expected.toISOString() : (typeof expected === "string" && !isNaN(Date.parse(expected)) ? expected : null);
  if (actual instanceof Date || expected instanceof Date) {
    if (actualDate === expectedDate) {
      return diffs;
    }
  }

  // Handle null / undefined / type mismatch
  if (
    actual === null ||
    expected === null ||
    actual === undefined ||
    expected === undefined ||
    typeof actual !== typeof expected
  ) {
    diffs.push({
      layer,
      path: basePath,
      expected,
      actual,
    });
    return diffs;
  }

  // Handle arrays
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      diffs.push({
        layer,
        path: `${basePath}.length`,
        expected: expected.length,
        actual: actual.length,
      });
    }
    const maxLen = Math.max(actual.length, expected.length);
    for (let i = 0; i < maxLen; i++) {
      const p = basePath ? `${basePath}.${i}` : `${i}`;
      diffs.push(...compareDiff(actual[i], expected[i], p, layer));
    }
    return diffs;
  }

  // Handle objects
  if (typeof actual === "object" && typeof expected === "object") {
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    for (const key of keys) {
      const p = basePath ? `${basePath}.${key}` : key;
      diffs.push(...compareDiff(actual[key], expected[key], p, layer));
    }
    return diffs;
  }

  // Primitives
  diffs.push({
    layer,
    path: basePath,
    expected,
    actual,
  });

  return diffs;
}

export function compareInboundResponse(
  actual: { statusCode: number; headers?: Record<string, string>; body: unknown },
  expected: { statusCode: number; headers?: Record<string, string>; body: unknown }
): Difference[] {
  const diffs: Difference[] = [];

  if (actual.statusCode !== expected.statusCode) {
    diffs.push({
      layer: "inbound_response",
      path: "statusCode",
      expected: expected.statusCode,
      actual: actual.statusCode,
    });
  }

  diffs.push(...compareDiff(actual.body, expected.body, "body", "inbound_response"));

  return diffs;
}

// Unified before/after path convention (code review LOW #9): every diff path
// starts with the stage ("before."/"after."), followed by the domain-specific
// path — "db_state" paths have no further domain prefix, "shared_resources"
// (Redis) paths continue with "redis.<key>...".
export function compareDbState(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  stage: "before" | "after" = "after"
): Difference[] {
  return compareDiff(actual, expected, stage, "db_state");
}

/**
 * Layer 3: outbound calls the target under test made to the provider stub
 * (Issue #8). Reuses the generic structural diff — order matters (calls are
 * recorded in the order the stub received them), same as any other array.
 */
export function compareOutboundCalls(
  actual: StubRequestRecord[],
  expected: StubRequestRecord[]
): Difference[] {
  return compareDiff(actual, expected, "calls", "outbound_calls");
}

export function compareRedisState(
  actual: Record<string, RedisKeyRecord | null>,
  expected: Record<string, RedisKeyRecord | null>,
  stage: string = "after"
): Difference[] {
  const diffs: Difference[] = [];
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  const pathPrefix = `${stage}.redis`;

  for (const key of keys) {
    const act = actual[key];
    const exp = expected[key];

    if (act === null && exp === null) {
      continue;
    }

    if (!act && exp) {
      diffs.push({
        layer: "shared_resources",
        path: `${pathPrefix}.${key}`,
        expected: exp,
        actual: null,
        message: `Expected key "${key}" to exist in Redis, but was missing`,
      });
      continue;
    }

    if (act && !exp) {
      diffs.push({
        layer: "shared_resources",
        path: `${pathPrefix}.${key}`,
        expected: null,
        actual: act,
        message: `Unexpected key "${key}" found in Redis`,
      });
      continue;
    }

    if (!act || !exp) {
      // Unreachable: the null/undefined cases were already handled above.
      continue;
    }

    // Both exist, compare value, db, type
    if (act.type !== exp.type) {
      diffs.push({
        layer: "shared_resources",
        path: `${pathPrefix}.${key}.type`,
        expected: exp.type,
        actual: act.type,
      });
    }

    if (act.db !== exp.db) {
      diffs.push({
        layer: "shared_resources",
        path: `${pathPrefix}.${key}.db`,
        expected: exp.db,
        actual: act.db,
      });
    }

    // Value diff (dynamic fields such as set_at/until must already be normalized
    // by the caller before this comparison runs; see runner.ts)
    const valDiffs = compareDiff(act.value, exp.value, `${pathPrefix}.${key}.value`, "shared_resources");
    diffs.push(...valDiffs);

    // TTL tolerance check
    const tolerance = exp.ttlTolerance;
    if (exp.ttl > 0) {
      const ttlDiff = Math.abs(act.ttl - exp.ttl);
      if (ttlDiff > tolerance) {
        diffs.push({
          layer: "shared_resources",
          path: `${pathPrefix}.${key}.ttl`,
          expected: exp.ttl,
          actual: act.ttl,
          message: `TTL difference ${ttlDiff} exceeds tolerance of ${tolerance}s`,
        });
      }
    } else if (exp.ttl === -1 || exp.ttl === -2) {
      if (act.ttl !== exp.ttl) {
        diffs.push({
          layer: "shared_resources",
          path: `${pathPrefix}.${key}.ttl`,
          expected: exp.ttl,
          actual: act.ttl,
        });
      }
    }
  }

  return diffs;
}

export function compareMongoDocuments(
  actual: Record<string, Record<string, unknown>[]>,
  expected: Record<string, Record<string, unknown>[]>
): Difference[] {
  return compareDiff(actual, expected, "after.mongo.newDocuments", "shared_resources");
}
