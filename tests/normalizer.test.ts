import { describe, expect, it } from "bun:test";
import { applyNormalizers, getDotPath, setDotPath } from "../src/normalizer/normalizer";

describe("Normalizer", () => {
  it("should get and set dot path values correctly", () => {
    const obj = { a: { b: { c: 123 } } };
    expect(getDotPath(obj, "a.b.c")).toBe(123);
    setDotPath(obj, "a.b.c", 456);
    expect(obj.a.b.c).toBe(456);
  });

  it("should apply current_timestamp rule to request body", () => {
    const request = {
      body: {
        timestamp: 0,
      },
    };
    const beforeSec = Math.floor(Date.now() / 1000);
    applyNormalizers(
      { request },
      [
        {
          target: "request.body.timestamp",
          type: "current_timestamp",
        },
      ],
      { fixedTimestamp: 1727270000 }
    );
    expect(request.body.timestamp).toBe(1727270000);
  });

  it("should mask or regex replace dynamic fields", () => {
    const data = {
      headers: {
        date: "Fri, 25 Sep 2026 14:13:46 GMT",
      },
    };
    applyNormalizers(data, [
      {
        target: "headers.date",
        type: "regex_replace",
        pattern: "^.*$",
        replacement: "<NORMALIZED_DATE>",
      },
    ]);
    expect(data.headers.date).toBe("<NORMALIZED_DATE>");
  });
});
