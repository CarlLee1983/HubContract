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

  describe("code review MEDIUM: signRequest matches PHP's rtrim($s,'&') and ksort() SORT_REGULAR exactly", () => {
    it("strips ALL trailing '&', not just the one added as the field separator (golden, from php -r)", () => {
      const item = cases.rtrim_strips_all_trailing_ampersands;
      const sign = signRequest(item.normalized_input, secretKey);
      expect(sign).toBe(item.golden_signature);
    });

    it("sorts canonical-integer-looking string keys numerically like ksort(), not lexicographically (golden, from php -r)", () => {
      const item = cases.ksort_numeric_string_keys;
      const sign = signRequest(item.normalized_input, secretKey);
      expect(sign).toBe(item.golden_signature);
    });

    it("would give a different (wrong) signature under naive lexicographic sort + single-'&' rtrim", () => {
      // Sanity check that the two golden cases above actually exercise the bugs:
      // a naive JS `.sort()` + `replace(/&$/, "")` implementation would produce a
      // different hash than Legacy's ksort()/rtrim($s, '&').
      const naiveSign = (data: Record<string, unknown>, secret: string): string => {
        const keys = Object.keys(data).filter((k) => k !== "sign").sort();
        let q = "";
        for (const k of keys) q += `${k}=${data[k]}&`;
        q = q.replace(/&$/, "");
        const hasher = new Bun.CryptoHasher("md5");
        hasher.update(q + secret + data["timestamp"]);
        return hasher.digest("hex");
      };

      expect(naiveSign(cases.rtrim_strips_all_trailing_ampersands.normalized_input, secretKey)).not.toBe(
        cases.rtrim_strips_all_trailing_ampersands.golden_signature
      );
      expect(naiveSign(cases.ksort_numeric_string_keys.normalized_input, secretKey)).not.toBe(
        cases.ksort_numeric_string_keys.golden_signature
      );
    });
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

  describe("code review MEDIUM #4: normalizeRequestInputs matches Legacy's TrimStrings/ConvertEmptyStringsToNull recursion and $except", () => {
    it("recurses into nested objects/arrays, trimming and nulling at every depth", () => {
      const raw = {
        station_code: "  DEMO_STATION  ",
        meta: {
          note: "  hello  ",
          empty: "   ",
        },
        items: ["  a  ", "  "],
      };
      const normalized = normalizeRequestInputs(raw);
      expect(normalized).toEqual({
        station_code: "DEMO_STATION",
        meta: {
          note: "hello",
          empty: null,
        },
        items: ["a", null],
      });
    });

    it("does not trim a top-level field literally named password/current_password/password_confirmation", () => {
      const raw = {
        station_code: "DEMO_STATION",
        password: "  secret with spaces  ",
        current_password: "  old  ",
        password_confirmation: "  old  ",
      };
      const normalized = normalizeRequestInputs(raw);
      expect(normalized.password).toBe("  secret with spaces  ");
      expect(normalized.current_password).toBe("  old  ");
      expect(normalized.password_confirmation).toBe("  old  ");
    });

    it("still trims a nested field merely named password, since Legacy's $except matches the full dotted path only", () => {
      const raw = {
        station_code: "DEMO_STATION",
        credentials: { password: "  nested  " },
      };
      const normalized = normalizeRequestInputs(raw);
      expect((normalized.credentials as Record<string, unknown>).password).toBe("nested");
    });

    it("still converts an excepted-from-trim field to null when it's already an empty string (no $except on ConvertEmptyStringsToNull)", () => {
      const raw = {
        station_code: "DEMO_STATION",
        password: "",
      };
      const normalized = normalizeRequestInputs(raw);
      expect(normalized.password).toBeNull();
    });

    it("trims Legacy's exact character class (ASCII whitespace + U+FEFF BOM + U+200B zero-width space), not just JS's .trim()", () => {
      // Legacy: preg_replace('~^[\s\x{FEFF}\x{200B}]+|[\s\x{FEFF}\x{200B}]+$~u', '', $value)
      // (.legacy-src/vendor/laravel/framework/src/.../Middleware/TrimStrings.php)
      const raw = {
        station_code: "DEMO_STATION",
        zwsp_padded: "​​TRADE_DEP_001​",
        bom_padded: "﻿TRADE_DEP_001﻿",
        mixed_padded: " \t​﻿ hello ﻿​\n ",
      };
      const normalized = normalizeRequestInputs(raw);
      expect(normalized.zwsp_padded).toBe("TRADE_DEP_001");
      expect(normalized.bom_padded).toBe("TRADE_DEP_001");
      expect(normalized.mixed_padded).toBe("hello");
    });
  });

  it("should verify golden signatures in constant time", () => {
    for (const [, item] of Object.entries(cases)) {
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
