import { STUB_BASE_URL } from "./maskConfig";
import { maskValue } from "./maskValue";

/**
 * Issue #13：`platforms.api_settings`、`payments.api_tokens`、`sms.settings`、
 * `settings.val` 這幾個欄位存的是 JSON 字串，裡面可能藏著金鑰、token、簽名
 * 參數、真實姓名／電話／帳號，或是打向真實線路的 URL（parent spec
 * HubRefactoring#1 第 18 點：`api_settings` 的端點要指向 stub，才能在不改
 * Legacy 程式碼的前提下攔截出站呼叫）。這些欄位是「情境/stub 需要結構」的
 * 設定，遮罩後仍要維持合法 JSON。
 *
 * 不是逐欄位設定路徑，而是依「鍵名」與「值的形狀」通用處理：
 * - 敏感判斷改用鍵名片段比對，不是整串 substring：鍵名先依 snake_case（`_`）
 *   與 camelCase 邊界切成片段（`sign_type` -> `["sign","type"]`、
 *   `platformName` -> `["platform","name"]`），任一片段落在敏感片段集合就算
 *   敏感鍵。片段集合：`{key, secret, token, password, pwd, pass, sign,
 *   signature, account, phone, mobile, tel, email, merchant, salt, iv, auth,
 *   cert, user, uid, name}`。這樣可以避免整串 substring 比對「過寬」抓到
 *   `sign_type`（簽名演算法版本，不是簽名本身）這類欄位；同時保留一份明確的
 *   「安全例外」清單（`SAFE_KEY_EXCEPTIONS`），對片段比對仍會誤判的個案直接
 *   排除。目前已知的例外：`sign_type`、`platform_name`（依 Legacy 實際用到的
 *   欄位/命名習慣列出，`sign_type` 目前沒有在 `.legacy-src` 裡找到實際用例，
 *   是 review 給的示範情境，先保留機制、之後真的遇到再擴充清單）。
 *   已知取捨：片段比對需要明確的分隔符或大小寫邊界，`username`、`nickname`
 *   這種沒有分隔符的複合字不會被切出 `user`/`name` 片段、因此不會被視為敏感
 *   ——這是刻意的設計取捨（見第三輪 code review 決議「改以鍵名切成片段比
 *   對」），不是遺漏。
 * - 陣列元素繼承父鍵名脈絡：`{"token":["TOK1","TOK2"]}` 的兩個字串都當成
 *   「token 底下的值」處理，不是因為陣列本身有鍵名。
 * - 字串值如果本身可以被解析成 JSON 物件/陣列，先遞迴解開處理（雙重編碼）。
 * - 數字在敏感鍵底下也要遮（例如 PIN 碼用數字存），遮罩後型別會變成字串；
 *   非敏感鍵底下的數字、以及所有布林值、null，一律原樣保留。
 * - 頂層如果整段就是字串（沒有物件/陣列包住），依它是不是 URL 判斷；不是 URL
 *   就當成這個 JSON 欄位本身在描述一個機密值，一併遮罩。
 */

const SENSITIVE_FRAGMENTS = new Set([
  "key",
  "secret",
  "token",
  "password",
  "pwd",
  "pass",
  "sign",
  "signature",
  "account",
  "phone",
  "mobile",
  "tel",
  "email",
  "merchant",
  "salt",
  "iv",
  "auth",
  "cert",
  "user",
  "uid",
  "name",
]);

/** 整把鍵名完全比對（小寫）才排除，不是片段比對；片段比對本身仍會判定為敏感。 */
const SAFE_KEY_EXCEPTIONS = new Set(["sign_type", "platform_name"]);

const URL_RE = /^https?:\/\//i;

function splitKeyFragments(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // camelCase 邊界轉成底線，統一交給後面用底線切
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** 片段完全比對，或去掉單純的複數 `s` 之後比對（`tokens` -> `token`、`accounts` -> `account`）。 */
function isSensitiveFragment(fragment: string): boolean {
  if (SENSITIVE_FRAGMENTS.has(fragment)) return true;
  return fragment.endsWith("s") && SENSITIVE_FRAGMENTS.has(fragment.slice(0, -1));
}

function isSensitiveKey(key: string): boolean {
  if (SAFE_KEY_EXCEPTIONS.has(key.toLowerCase())) return false;
  return splitKeyFragments(key).some(isSensitiveFragment);
}

function tryParseJsonContainer(raw: string): unknown {
  const trimmed = raw.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function maskJsonString(value: string, keyContext: string | null): string {
  const nested = tryParseJsonContainer(value);
  if (nested !== undefined) {
    return JSON.stringify(maskJsonNode(nested, keyContext));
  }
  if (URL_RE.test(value)) return STUB_BASE_URL;
  if (keyContext === null || isSensitiveKey(keyContext)) return maskValue("secret_key", value);
  return value;
}

function maskJsonNode(value: unknown, keyContext: string | null): unknown {
  if (Array.isArray(value)) {
    // 陣列元素繼承父鍵名脈絡，而不是「陣列自己的鍵名」（陣列沒有鍵名）。
    return value.map((item) => maskJsonNode(item, keyContext));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = maskJsonNode(child, key);
    }
    return out;
  }
  if (typeof value === "string") {
    return maskJsonString(value, keyContext);
  }
  if (typeof value === "number" && keyContext !== null && isSensitiveKey(keyContext)) {
    // 數字在敏感鍵底下也要遮，遮罩後型別會變成字串（例如數字型 PIN 碼）。
    return maskValue("secret_key", String(value));
  }
  return value; // 非敏感鍵底下的數字、布林、null 原樣保留
}

/**
 * 遮罩一段 JSON 內容，回傳重新序列化後的 JSON 文字。`raw` 可以是尚未解析的
 * JSON 字串，也可以是已經被解析過的值——MariaDB 對宣告 `CHECK (json_valid(...))`
 * 的 `LONGTEXT` 欄位，mysql2 有時會直接回傳解析好的 JS 物件/陣列而不是原始
 * 字串，兩種情況都要能處理。字串內容如果不是合法 JSON 一律 throw——這類欄位
 * 在 schema 裡就是拿來存 JSON 用的，內容如果不是合法 JSON，代表遮罩規則不適用
 * 於這筆資料，寧可讓人工確認也不要冒著漏遮的風險原樣放行。
 */
export function maskJsonValue(raw: unknown): string {
  let parsed: unknown;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      throw new Error(
        `maskJsonValue 失敗：內容不是合法 JSON，拒絕原樣放行（可能藏著未遮罩的機密）。原始內容開頭：${raw.slice(0, 80)}`,
        { cause }
      );
    }
  } else {
    parsed = raw;
  }
  // 頂層沒有鍵名（keyContext = null）：物件/陣列往下遞迴各自處理各自的鍵；
  // 頂層本身如果是純字串，maskJsonNode 的字串分支會依 URL / 是否可再解析成
  // JSON 判斷，兩者都不是就當成敏感值整個遮罩（見上方檔案說明）。
  return JSON.stringify(maskJsonNode(parsed, null));
}
