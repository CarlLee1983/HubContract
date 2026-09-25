import { describe, expect, it } from "bun:test";
import { signRequest, verifySignature, normalizeRequestInputs } from "../src/signer/signature";
import goldenData from "../fixtures/golden_signatures.json";

describe("Issue #6: Signature Edge Cases Golden Test", () => {
  const secretKey = goldenData.secret_key;
  const cases = goldenData.cases;

  it("should match golden signature for basic parameters", () => {
    const item = cases.basic;
    const sign = signRequest(item.normalized_input, secretKey);
    expect(sign).toBe(item.golden_signature);
  });

  it("should match golden signature after trimming and converting empty strings to null", () => {
    const item = cases.trim_and_empty;
    const normalized = normalizeRequestInputs(item.raw_input);
    expect(normalized).toEqual(item.normalized_input);

    const sign = signRequest(normalized, secretKey);
    expect(sign).toBe(item.golden_signature);
  });

  it("should match golden signature with booleans and nulls (PHP string cast semantics)", () => {
    const item = cases.boolean_and_null;
    const sign = signRequest(item.normalized_input, secretKey);
    expect(sign).toBe(item.golden_signature);
  });

  it("should match golden signature with numbers and decimals", () => {
    const item = cases.numbers_and_decimals;
    const sign = signRequest(item.normalized_input, secretKey);
    expect(sign).toBe(item.golden_signature);
  });

  it("should match golden signature with Chinese characters and special URL characters without encoding", () => {
    const item = cases.chinese_and_special_chars;
    const sign = signRequest(item.normalized_input, secretKey);
    expect(sign).toBe(item.golden_signature);
  });

  it("should match golden signature for D-27 launch JSON with defaults merged", () => {
    const item = cases.launch_json_defaults_included;
    const sign = signRequest(item.normalized_input, secretKey);
    expect(sign).toBe(item.golden_signature);
  });

  it("should match golden signature for D-27 launch Form urlencoded with defaults excluded", () => {
    const item = cases.launch_form_defaults_excluded;
    const sign = signRequest(item.normalized_input, secretKey);
    expect(sign).toBe(item.golden_signature);
  });

  it("should throw 'Array to string conversion' when signing nested objects/arrays", () => {
    const nestedData = {
      station_code: "DEMO_STATION",
      timestamp: 1700000000,
      nested: { a: "b" },
    };

    expect(() => {
      signRequest(nestedData, secretKey);
    }).toThrow("Array to string conversion");
  });

  it("should verify golden signatures in constant time", () => {
    for (const [key, item] of Object.entries(cases)) {
      const isValid = verifySignature(
        { ...item.normalized_input, sign: item.golden_signature },
        secretKey
      );
      expect(isValid).toBe(true);

      const isInvalid = verifySignature(
        { ...item.normalized_input, sign: "wrongwrongwrongwrongwrongwrong12" },
        secretKey
      );
      expect(isInvalid).toBe(false);
    }
  });
});
