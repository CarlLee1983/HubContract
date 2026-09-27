import { describe, expect, it } from "bun:test";
import { applyNormalizers, getDotPath, setDotPath } from "../src/normalizer/normalizer";
import { compareRedisState } from "../src/comparator/comparator";
import { compareDbState } from "../src/comparator/comparator";
import { compareMongoDocuments } from "../src/comparator/comparator";
import { compareDiff } from "../src/comparator/comparator";
import { NormalizerRuleSchema } from "../src/schema/scenario";

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

  describe("capture-local symbols", () => {
    const referencePattern = "^RE[0-9]{18}$";
    const referenceRules = [
      { target: "outbound.0.body.transfer_reference", type: "symbolize" as const, pattern: referencePattern, replacement: "TRANSFER_REFERENCE" },
      { target: "outbound.1.body.transfer_reference", type: "symbolize" as const, pattern: referencePattern, replacement: "TRANSFER_REFERENCE" },
      { target: "mongo.httplog_withdraw.0.context.request.transfer_reference", type: "symbolize" as const, pattern: referencePattern, replacement: "TRANSFER_REFERENCE" },
      { target: "mongo.httplog_deposit.0.context.request.transfer_reference", type: "symbolize" as const, pattern: referencePattern, replacement: "TRANSFER_REFERENCE" },
    ];
    const first = "RE123456789012345678";
    const second = "RE876543210987654321";

    it("validates, distinguishes and correlates references across separate layer captures", () => {
      const symbols = new Map<string, Map<string, string>>();
      const outbound = applyNormalizers({ outbound: [
        { body: { transfer_reference: first } }, { body: { transfer_reference: second } },
      ] }, referenceRules, { symbols }).outbound;
      const mongo = applyNormalizers({ mongo: {
        httplog_deposit: [{ context: { request: { transfer_reference: second } } }],
        httplog_withdraw: [{ context: { request: { transfer_reference: first } } }],
      } }, referenceRules, { symbols }).mongo;
      expect(outbound.map((call: { body: { transfer_reference: string } }) => call.body.transfer_reference))
        .toEqual(["<TRANSFER_REFERENCE_1>", "<TRANSFER_REFERENCE_2>"]);
      expect(mongo.httplog_withdraw[0].context.request.transfer_reference).toBe("<TRANSFER_REFERENCE_1>");
      expect(mongo.httplog_deposit[0].context.request.transfer_reference).toBe("<TRANSFER_REFERENCE_2>");

      const mismatched = applyNormalizers({ mongo: {
        httplog_withdraw: [{ context: { request: { transfer_reference: "RE000000000000000000" } } }],
      } }, referenceRules, { symbols }).mongo;
      expect(compareMongoDocuments(mismatched, { httplog_withdraw: [mongo.httplog_withdraw[0]] }))
        .toContainEqual(expect.objectContaining({
          path: "after.mongo.newDocuments.httplog_withdraw.0.context.request.transfer_reference",
          expected: "<TRANSFER_REFERENCE_1>",
          actual: "<TRANSFER_REFERENCE_3>",
        }));
    });

    it("exposes duplicate references and rejects empty or malformed ones", () => {
      const duplicated = applyNormalizers({ outbound: [
        { body: { transfer_reference: first } }, { body: { transfer_reference: first } },
      ] }, referenceRules).outbound;
      expect(duplicated[1].body.transfer_reference).toBe("<TRANSFER_REFERENCE_1>");
      expect(compareDiff(duplicated, [
        { body: { transfer_reference: "<TRANSFER_REFERENCE_1>" } },
        { body: { transfer_reference: "<TRANSFER_REFERENCE_2>" } },
      ], "outbound", "outbound_calls")).toContainEqual(expect.objectContaining({
        path: "outbound.1.body.transfer_reference",
      }));
      for (const invalid of ["", "RE123", "RE123456789012345678X", 123]) {
        expect(() => applyNormalizers({ outbound: [{ body: { transfer_reference: invalid } }] }, referenceRules))
          .toThrow("outbound.0.body.transfer_reference");
      }
    });

    it("correlates a captured UUID inside a URI with its direct outbound value", () => {
      const uuid = "12345678-abcd-1234-abcd-123456789012";
      const symbols = new Map<string, Map<string, string>>();
      const direct = applyNormalizers({ outbound: [{ query: { trace_id: uuid } }] }, [
        { target: "outbound.0.query.trace_id", type: "symbolize", pattern: "^[0-9a-f-]{36}$", replacement: "PG_TRACE_ID" },
      ], { symbols }).outbound[0].query.trace_id;
      const uri = applyNormalizers({ mongo: { httplog_deposit: [{ context: {
        uri: `http://mock-provider:8081/pg/Cash/v3/TransferIn?trace_id=${uuid}`,
      } }] } }, [
        { target: "mongo.httplog_deposit.0.context.uri", type: "symbolize_capture", pattern: "trace_id=([0-9a-f-]{36})", replacement: "PG_TRACE_ID" },
      ], { symbols }).mongo.httplog_deposit[0].context.uri;
      expect(uri).toEndWith(`trace_id=${direct}`);
      expect(() => applyNormalizers({ mongo: { httplog_deposit: [{ context: { uri: "missing-trace-id" } }] } }, [
        { target: "mongo.httplog_deposit.0.context.uri", type: "symbolize_capture", pattern: "trace_id=([0-9a-f-]{36})", replacement: "PG_TRACE_ID" },
      ])).toThrow("mongo.httplog_deposit.0.context.uri");
    });
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

  describe("recent SQL DATETIME", () => {
    const rule = NormalizerRuleSchema.parse({
      target: "db.after.service_issues.0.closed_at",
      type: "recent_sql_datetime",
      timezoneOffsetMinutes: 480,
      maxSkewSeconds: 30,
      replacement: "<RECENT_SQL_DATETIME>",
    });
    const window = {
      startMs: Date.parse("2026-09-27T04:00:00Z"),
      endMs: Date.parse("2026-09-27T04:00:05Z"),
    };
    const capture = (closedAt: unknown) => ({ db: { after: { service_issues: [{ closed_at: closedAt }] } } });

    it("requires a declared offset and skew, then normalizes only a recent valid SQL datetime", () => {
      expect(NormalizerRuleSchema.safeParse({ target: rule.target, type: rule.type }).success).toBe(false);
      const input = capture("2026-09-27 12:00:02");
      expect(applyNormalizers(input, [rule], { executionWindow: window }).db.after.service_issues[0].closed_at)
        .toBe("<RECENT_SQL_DATETIME>");
      expect(input.db.after.service_issues[0].closed_at).toBe("2026-09-27 12:00:02");
      expect(applyNormalizers(capture(null), [rule], { executionWindow: window }).db.after.service_issues[0].closed_at)
        .toBeNull();
    });

    it("leaves stale, malformed, and non-SQL values at the field path for diff reporting", () => {
      const expected = { service_issues: [{ closed_at: "<RECENT_SQL_DATETIME>" }] };
      for (const invalid of ["2026-09-26 12:00:02", "2026-02-30 12:00:02", "2026-09-27T12:00:02+08:00", 123]) {
        const actual = applyNormalizers(capture(invalid), [rule], { executionWindow: window }).db.after;
        expect(compareDbState(actual, expected)).toContainEqual(expect.objectContaining({
          layer: "db_state", path: "after.service_issues.0.closed_at", expected: "<RECENT_SQL_DATETIME>", actual: invalid,
        }));
      }
    });
  });
});
