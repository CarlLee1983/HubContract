import { timingSafeEqual } from "node:crypto";

/**
 * Convert value according to PHP string casting semantics:
 * - null or undefined -> ""
 * - false -> ""
 * - true -> "1"
 * - object/array -> throws Error("Array to string conversion")
 * - other -> String(val)
 */
export function toPhpString(val: unknown): string {
  if (val === null || val === undefined) {
    return "";
  }
  if (typeof val === "boolean") {
    return val ? "1" : "";
  }
  if (typeof val === "object") {
    throw new Error("Array to string conversion");
  }
  return String(val);
}

// Legacy's App\Http\Middleware\TrimStrings::$except (fixtures/../.legacy-src/app/Http/Middleware/TrimStrings.php).
// Matched against the FULL dotted key path (Illuminate\Foundation\Http\Middleware\TransformsRequest::cleanArray
// builds "parent.child" prefixes when recursing), so this only skips top-level fields literally named one of
// these — a nested field like `credentials.password` is still trimmed, matching Legacy exactly.
const DEFAULT_TRIM_EXCEPT = ["current_password", "password", "password_confirmation"];

// Legacy: preg_replace('~^[\s\x{FEFF}\x{200B}]+|[\s\x{FEFF}\x{200B}]+$~u', '', $value)
// (.legacy-src/vendor/laravel/framework/src/Illuminate/Foundation/Http/Middleware/TrimStrings.php).
// JS's String.prototype.trim() only strips whitespace, not U+FEFF (BOM) or U+200B
// (zero-width space), so this mirrors the exact character class instead.
const LEGACY_TRIM_CHARS = /^[\s﻿​]+|[\s﻿​]+$/gu;

export interface NormalizeInputOptions {
  trimStrings?: boolean;
  convertEmptyStringsToNull?: boolean;
  /** Full dotted key paths to skip trimming for. Defaults to Legacy's TrimStrings::$except. */
  trimExcept?: string[];
}

function normalizeValue(
  value: unknown,
  keyPath: string,
  trimStrings: boolean,
  convertEmptyStringsToNull: boolean,
  trimExcept: string[]
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      normalizeValue(item, `${keyPath}.${index}`, trimStrings, convertEmptyStringsToNull, trimExcept)
    );
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = normalizeValue(
        nested,
        `${keyPath}.${key}`,
        trimStrings,
        convertEmptyStringsToNull,
        trimExcept
      );
    }
    return result;
  }

  if (typeof value === "string") {
    let v = value;
    if (trimStrings && !trimExcept.includes(keyPath)) {
      v = v.replace(LEGACY_TRIM_CHARS, "");
    }
    if (convertEmptyStringsToNull && v === "") {
      return null;
    }
    return v;
  }

  return value;
}

/**
 * Normalizes request data replicating Legacy's global middleware pipeline
 * (App\Http\Middleware\TrimStrings then Illuminate ConvertEmptyStringsToNull),
 * recursing through nested arrays/objects the same way
 * Illuminate\Foundation\Http\Middleware\TransformsRequest::cleanArray does.
 */
export function normalizeRequestInputs(
  data: Record<string, unknown>,
  options: NormalizeInputOptions = {}
): Record<string, unknown> {
  const trimStrings = options.trimStrings ?? true;
  const convertEmptyStringsToNull = options.convertEmptyStringsToNull ?? true;
  const trimExcept = options.trimExcept ?? DEFAULT_TRIM_EXCEPT;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = normalizeValue(value, key, trimStrings, convertEmptyStringsToNull, trimExcept);
  }
  return result;
}

// A string is a canonical PHP integer array key iff it round-trips through
// (string)(int)$key without change: optional leading '-', then digits, no
// leading zero unless the whole key is "0" (e.g. "08" is NOT canonical, stays
// a string key; "0", "7", "-3" are). PHP silently casts such string keys to
// int keys when building the array.
const PHP_INT_KEY = /^-?(0|[1-9]\d*)$/;

/**
 * Mirrors PHP's `ksort($data)` default (SORT_REGULAR) ordering for the string
 * keys generate_signature() deals with: two canonical-integer-like keys are
 * compared numerically (so "2" sorts before "10"); anything else falls back to
 * plain string comparison — which is what PHP8's regular comparison rules
 * reduce to once you cast the int-key side back to its own decimal string (see
 * SignatureHelper golden case `ksort_numeric_string_keys`, verified against
 * `php -r` output from the pinned Legacy commit).
 */
function phpKsortCompare(a: string, b: string): number {
  if (PHP_INT_KEY.test(a) && PHP_INT_KEY.test(b)) {
    const na = BigInt(a);
    const nb = BigInt(b);
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Station Signature Generator (ADR-0005)
 *
 * 1. Takes all request fields, removes `sign`, ksort by key names.
 * 2. Builds query string `key=val&` without URL encoding.
 * 3. Appends `secretKey` and `timestamp`.
 * 4. Takes MD5 hex digest.
 */
export function signRequest(
  data: Record<string, unknown>,
  secretKey: string
): string {
  const filteredKeys = Object.keys(data)
    .filter((k) => k !== "sign")
    .sort(phpKsortCompare);

  let queryString = "";
  for (const key of filteredKeys) {
    queryString += `${key}=${toPhpString(data[key])}&`;
  }
  // PHP's rtrim($queryString, '&') strips *every* trailing '&', not just the
  // separator after the last field — matters when the last field's own value
  // ends in '&' (e.g. "reason=abc&&&"). A single-'&' replace would leave that
  // untrimmed and diverge from Legacy's signature.
  queryString = queryString.replace(/&+$/, "");

  const timestamp = toPhpString(data["timestamp"]);
  const stringToHash = queryString + secretKey + timestamp;

  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(stringToHash);
  return hasher.digest("hex");
}

/**
 * Constant-time signature verification (ADR-0005 RD-01)
 */
export function verifySignature(
  data: Record<string, unknown>,
  secretKey: string
): boolean {
  if (typeof data.sign !== "string" || !data.timestamp) {
    return false;
  }

  const expectedSign = signRequest(data, secretKey);
  const signBuffer = Buffer.from(data.sign);
  const expectedBuffer = Buffer.from(expectedSign);

  if (signBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(signBuffer, expectedBuffer);
}
