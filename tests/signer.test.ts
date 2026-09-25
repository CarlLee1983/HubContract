import { describe, expect, it } from "bun:test";
import { signRequest, verifySignature } from "../src/signer/signature";

describe("Station Signature (ADR-0005)", () => {
  const secretKey = "synthetic_secret_key_for_contract_testing_only_1234567890";

  it("should generate valid md5 signature for check-transaction parameters", () => {
    const payload = {
      station_code: "DEMO_STATION",
      txn_no: "TRADE_DEP_001",
      timestamp: 1727270000,
    };

    const sign = signRequest(payload, secretKey);
    expect(sign).toBeTypeOf("string");
    expect(sign.length).toBe(32);

    // Manual calculation check:
    // ksort keys: station_code, timestamp, txn_no
    // query: station_code=DEMO_STATION&timestamp=1727270000&txn_no=TRADE_DEP_001
    // toHash: query + secretKey + timestamp
    const expectedQuery = "station_code=DEMO_STATION&timestamp=1727270000&txn_no=TRADE_DEP_001";
    const toHash = expectedQuery + secretKey + "1727270000";
    const hasher = new Bun.CryptoHasher("md5");
    hasher.update(toHash);
    const expectedSign = hasher.digest("hex");

    expect(sign).toBe(expectedSign);
  });

  it("should handle boolean and null conversions matching PHP string cast semantics", () => {
    // PHP: false => "", null => "", true => "1"
    const payload = {
      b_false: false,
      b_null: null,
      b_true: true,
      str: "hello",
      timestamp: 1000,
    };

    const sign = signRequest(payload, secretKey);
    const expectedQuery = "b_false=&b_null=&b_true=1&str=hello&timestamp=1000";
    const toHash = expectedQuery + secretKey + "1000";
    const hasher = new Bun.CryptoHasher("md5");
    hasher.update(toHash);
    const expectedSign = hasher.digest("hex");

    expect(sign).toBe(expectedSign);
  });

  it("should verify signature in constant time", () => {
    const payload = {
      station_code: "DEMO_STATION",
      txn_no: "TRADE_DEP_001",
      timestamp: 1727270000,
    };
    const sign = signRequest(payload, secretKey);

    expect(verifySignature({ ...payload, sign }, secretKey)).toBe(true);
    expect(verifySignature({ ...payload, sign: "wrongsignwrongsignwrongsignwrong" }, secretKey)).toBe(false);
  });
});
