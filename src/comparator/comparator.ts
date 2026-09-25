export interface Difference {
  layer: "inbound_response" | "db_state" | "shared_resources" | "outbound_calls";
  path: string;
  expected: any;
  actual: any;
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
  actual: { statusCode: number; headers?: Record<string, string>; body: any },
  expected: { statusCode: number; headers?: Record<string, string>; body: any }
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

export function compareDbState(
  actual: Record<string, any>,
  expected: Record<string, any>
): Difference[] {
  return compareDiff(actual, expected, "", "db_state");
}

export function compareRedisState(
  actual: Record<string, any>,
  expected: Record<string, any>
): Difference[] {
  const diffs: Difference[] = [];
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);

  for (const key of keys) {
    const act = actual[key];
    const exp = expected[key];

    if (act === null && exp === null) {
      continue;
    }

    if (!act && exp) {
      diffs.push({
        layer: "shared_resources",
        path: `redis.${key}`,
        expected: exp,
        actual: null,
        message: `Expected key "${key}" to exist in Redis, but was missing`,
      });
      continue;
    }

    if (act && !exp) {
      diffs.push({
        layer: "shared_resources",
        path: `redis.${key}`,
        expected: null,
        actual: act,
        message: `Unexpected key "${key}" found in Redis`,
      });
      continue;
    }

    // Both exist, compare value, db, type
    if (act.type !== exp.type) {
      diffs.push({
        layer: "shared_resources",
        path: `redis.${key}.type`,
        expected: exp.type,
        actual: act.type,
      });
    }

    if (act.db !== exp.db) {
      diffs.push({
        layer: "shared_resources",
        path: `redis.${key}.db`,
        expected: exp.db,
        actual: act.db,
      });
    }

    // Value diff (ignore dynamic set_at and until timestamps if inside maintenance payload)
    const valDiffs = compareDiff(act.value, exp.value, `redis.${key}.value`, "shared_resources");
    diffs.push(...valDiffs);

    // TTL tolerance check
    const tolerance = exp.ttlTolerance ?? 30;
    if (exp.ttl > 0) {
      const ttlDiff = Math.abs(act.ttl - exp.ttl);
      if (ttlDiff > tolerance) {
        diffs.push({
          layer: "shared_resources",
          path: `redis.${key}.ttl`,
          expected: exp.ttl,
          actual: act.ttl,
          message: `TTL difference ${ttlDiff} exceeds tolerance of ${tolerance}s`,
        });
      }
    } else if (exp.ttl === -1 || exp.ttl === -2) {
      if (act.ttl !== exp.ttl) {
        diffs.push({
          layer: "shared_resources",
          path: `redis.${key}.ttl`,
          expected: exp.ttl,
          actual: act.ttl,
        });
      }
    }
  }

  return diffs;
}
