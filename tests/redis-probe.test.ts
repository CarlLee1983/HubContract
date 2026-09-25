import { describe, expect, it, afterAll } from "bun:test";
import { RedisProbeService } from "../src/probe/redisProbe";
import { compareRedisState } from "../src/comparator/comparator";
import { config } from "../src/config";
import Redis from "ioredis";

describe("RedisProbeService & Redis State Comparator (Issue #7)", () => {
  const redisProbe = new RedisProbeService({
    host: config.redis.host,
    port: config.redis.port,
    prefix: config.redis.prefix,
  });

  const rawRedis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    db: 1,
  });

  afterAll(async () => {
    await redisProbe.close();
    rawRedis.disconnect();
  });

  it("Criterion 1: Scenarios can declare key patterns to probe (exact key & wildcard pattern)", async () => {
    // Setup test keys in db 1 with hub_recording: prefix
    await rawRedis.set("hub_recording:test:exact:key", JSON.stringify({ hello: "world" }), "EX", 120);
    await rawRedis.set("hub_recording:test:pattern:1", "item1", "EX", 120);
    await rawRedis.set("hub_recording:test:pattern:2", "item2", "EX", 120);

    const state = await redisProbe.capture({
      keys: [
        {
          pattern: "test:exact:key",
          db: 1,
          ttlToleranceSeconds: 15,
        },
        {
          pattern: "test:pattern:*",
          db: 1,
          ttlToleranceSeconds: 30,
        },
      ],
    });

    expect(state["test:exact:key"]).toBeDefined();
    expect(state["test:exact:key"]?.value).toEqual({ hello: "world" });
    expect(state["test:exact:key"]?.db).toBe(1);
    expect(state["test:exact:key"]?.ttl).toBeGreaterThan(0);

    expect(state["test:pattern:1"]).toBeDefined();
    expect(state["test:pattern:1"]?.value).toBe("item1");
    expect(state["test:pattern:2"]).toBeDefined();
    expect(state["test:pattern:2"]?.value).toBe("item2");

    // Clean up
    await rawRedis.del(
      "hub_recording:test:exact:key",
      "hub_recording:test:pattern:1",
      "hub_recording:test:pattern:2"
    );
  });

  it("Criterion 1b: Exact key not found returns null value record", async () => {
    const state = await redisProbe.capture({
      keys: [
        {
          pattern: "non:existent:key",
          db: 1,
          ttlToleranceSeconds: 30,
        },
      ],
    });

    expect(state["non:existent:key"]).toBeNull();
  });

  it("Criterion 2: Value exact match passes; value mismatch produces diff with path", () => {
    const actual = {
      "platform-maintenance:v1:cq9": {
        key: "platform-maintenance:v1:cq9",
        db: 1,
        type: "string",
        value: {
          reason: "Scheduled maintenance",
          source: "manual",
          set_by: "mcp",
          estimated: true,
        },
        ttl: 3600,
        ttlTolerance: 30,
      },
    };

    const expectedMatching = JSON.parse(JSON.stringify(actual));
    expect(compareRedisState(actual, expectedMatching)).toEqual([]);

    const expectedMismatch = JSON.parse(JSON.stringify(actual));
    expectedMismatch["platform-maintenance:v1:cq9"].value.reason = "Different reason";

    const diffs = compareRedisState(actual, expectedMismatch);
    expect(diffs.length).toBe(1);
    expect(diffs[0].layer).toBe("shared_resources");
    expect(diffs[0].path).toBe("after.redis.platform-maintenance:v1:cq9.value.reason");
    expect(diffs[0].expected).toBe("Different reason");
    expect(diffs[0].actual).toBe("Scheduled maintenance");
  });

  it("Criterion 2b: TTL tolerance comparison - within tolerance passes, exceeding tolerance reports diff", () => {
    const base = {
      "platform-maintenance:v1:cq9": {
        key: "platform-maintenance:v1:cq9",
        db: 1,
        type: "string",
        value: { flag: 1 },
        ttl: 3600,
        ttlTolerance: 30,
      },
    };

    // Actual TTL is 3585 (diff = 15s <= 30s tolerance) -> passes
    const actualWithinTolerance = {
      "platform-maintenance:v1:cq9": {
        ...base["platform-maintenance:v1:cq9"],
        ttl: 3585,
      },
    };
    expect(compareRedisState(actualWithinTolerance, base)).toEqual([]);

    // Actual TTL is 3500 (diff = 100s > 30s tolerance) -> fails
    const actualExceedingTolerance = {
      "platform-maintenance:v1:cq9": {
        ...base["platform-maintenance:v1:cq9"],
        ttl: 3500,
      },
    };
    const diffs = compareRedisState(actualExceedingTolerance, base);
    expect(diffs.length).toBe(1);
    expect(diffs[0].layer).toBe("shared_resources");
    expect(diffs[0].path).toBe("after.redis.platform-maintenance:v1:cq9.ttl");
    expect(diffs[0].message).toContain("exceeds tolerance");
  });

  it("Criterion 2c: Comparing null records (e.g. key cleared or absent in both) passes without error", () => {
    const actual = {
      "platform-maintenance:v1:cq9": null,
    };
    const expected = {
      "platform-maintenance:v1:cq9": null,
    };
    expect(compareRedisState(actual, expected)).toEqual([]);
  });
});
