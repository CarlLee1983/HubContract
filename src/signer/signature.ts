import { timingSafeEqual } from "node:crypto";

/**
 * Convert value according to PHP string casting semantics:
 * - null or undefined -> ""
 * - false -> ""
 * - true -> "1"
 * - other -> String(val)
 */
function toPhpString(val: unknown): string {
  if (val === null || val === undefined) {
    return "";
  }
  if (typeof val === "boolean") {
    return val ? "1" : "";
  }
  return String(val);
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
    .sort();

  let queryString = "";
  for (const key of filteredKeys) {
    queryString += `${key}=${toPhpString(data[key])}&`;
  }
  queryString = queryString.replace(/&$/, "");

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
