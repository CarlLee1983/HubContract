import { describe, expect, it } from "bun:test";
import { applyNormalizers, getDotPath, setDotPath } from "../src/normalizer/normalizer";
import { compareRedisState } from "../src/comparator/comparator";

describe("Normalizer", () => {
  it("should get and set dot path values correctly", () => {
    const obj = { a: { b: { c: 123 } } };
    expect(getDotPath(obj, "a.b.c")).toBe(123);
    setDotPath(obj, "a.b.c", 456);
    expect(obj.a.b.c).toBe(456);
  });

  it("should apply current_timestamp rule to request body without mutating input", () => {
    const request = {
      body: {
        timestamp: 0,
      },
    };
    const result = applyNormalizers(
      { request },
      [
        {
          target: "request.body.timestamp",
          type: "current_timestamp",
        },
      ],
      { fixedTimestamp: 1727270000 }
    );
    expect(result.request.body.timestamp).toBe(1727270000);
    expect(request.body.timestamp).toBe(0);
  });

  it("should mask or regex replace dynamic fields without mutating input", () => {
    const data = {
      headers: {
        date: "Fri, 25 Sep 2026 14:13:46 GMT",
      },
    };
    const result = applyNormalizers(data, [
      {
        target: "headers.date",
        type: "regex_replace",
        pattern: "^.*$",
        replacement: "<NORMALIZED_DATE>",
      },
    ]);
    expect(result.headers.date).toBe("<NORMALIZED_DATE>");
    expect(data.headers.date).toBe("Fri, 25 Sep 2026 14:13:46 GMT");
  });

  describe("Issue: MCP set_at/until must stay format-sensitive (code review HIGH #1)", () => {
    const iso8601Plus8Rule = {
      target: "redis.platform-maintenance:v1:cq9.value.set_at",
      type: "regex_replace" as const,
      pattern: "^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\+08:00$",
      replacement: "<ISO8601+08:00>",
    };

    it("replaces a well-formed +08:00 timestamp with the placeholder", () => {
      const capture = {
        redis: {
          "platform-maintenance:v1:cq9": { value: { set_at: "2026-09-26T00:04:13+08:00" } },
        },
      };
      const result = applyNormalizers(capture, [iso8601Plus8Rule]);
      expect(result.redis["platform-maintenance:v1:cq9"].value.set_at).toBe("<ISO8601+08:00>");
    });

    it("leaves a non +08:00 timestamp untouched, so a real format regression still shows up as a diff", () => {
      // e.g. Legacy accidentally starts emitting UTC ("Z") instead of +08:00.
      const capture = {
        redis: {
          "platform-maintenance:v1:cq9": { value: { set_at: "2026-09-26T00:04:13Z" } },
        },
      };
      const result = applyNormalizers(capture, [iso8601Plus8Rule]);
      // Unmasked, unlike the old unconditional `mask` rule.
      expect(result.redis["platform-maintenance:v1:cq9"].value.set_at).toBe(
        "2026-09-26T00:04:13Z"
      );

      // And that unmasked drift is exactly what makes verify() fail against a
      // golden fixture recorded with the well-formed placeholder.
      const actual = {
        "platform-maintenance:v1:cq9": {
          key: "platform-maintenance:v1:cq9",
          db: 1,
          type: "string",
          value: result.redis["platform-maintenance:v1:cq9"].value,
          ttl: 3600,
          ttlTolerance: 30,
        },
      };
      const golden = {
        "platform-maintenance:v1:cq9": {
          key: "platform-maintenance:v1:cq9",
          db: 1,
          type: "string",
          value: { set_at: "<ISO8601+08:00>" },
          ttl: 3600,
          ttlTolerance: 30,
        },
      };
      const diffs = compareRedisState(actual, golden);
      expect(diffs.some((d) => d.path === "after.redis.platform-maintenance:v1:cq9.value.set_at")).toBe(
        true
      );
    });
  });
});
