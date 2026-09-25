import { describe, expect, it } from "bun:test";
import { compareInboundResponse, compareDbState, compareDiff } from "../src/comparator/comparator";

describe("Comparator", () => {
  it("should match identical inbound responses", () => {
    const actual = {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: { message: "OK", data: { id: 1 } },
    };
    const expected = {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: { message: "OK", data: { id: 1 } },
    };

    const diffs = compareInboundResponse(actual, expected);
    expect(diffs).toEqual([]);
  });

  it("should report mismatch in statusCode with exact path and values", () => {
    const actual = {
      statusCode: 500,
      headers: {},
      body: {},
    };
    const expected = {
      statusCode: 200,
      headers: {},
      body: {},
    };

    const diffs = compareInboundResponse(actual, expected);
    expect(diffs.length).toBe(1);
    expect(diffs[0].layer).toBe("inbound_response");
    expect(diffs[0].path).toBe("statusCode");
    expect(diffs[0].expected).toBe(200);
    expect(diffs[0].actual).toBe(500);
  });

  it("should report mismatch in nested body field with exact path and values", () => {
    const actual = {
      statusCode: 200,
      headers: {},
      body: { message: "OK", data: { status: "pending" } },
    };
    const expected = {
      statusCode: 200,
      headers: {},
      body: { message: "OK", data: { status: "completed" } },
    };

    const diffs = compareInboundResponse(actual, expected);
    expect(diffs.length).toBe(1);
    expect(diffs[0].layer).toBe("inbound_response");
    expect(diffs[0].path).toBe("body.data.status");
    expect(diffs[0].expected).toBe("completed");
    expect(diffs[0].actual).toBe("pending");
  });

  it("should report mismatch in db state", () => {
    const actual = {
      deposit_record: [{ no: "DE_001", amount: 100 }],
    };
    const expected = {
      deposit_record: [{ no: "DE_001", amount: 200 }],
    };

    const diffs = compareDbState(actual, expected);
    expect(diffs.length).toBe(1);
    expect(diffs[0].layer).toBe("db_state");
    expect(diffs[0].path).toBe("after.deposit_record.0.amount");
  });
});
