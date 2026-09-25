import { STUB_BASE_URL } from "./maskConfig";
import { maskValue } from "./maskValue";

/**
 * Issue #13：`platforms.api_settings`、`payments.api_tokens`、`sms.settings`
 * 這三個欄位存的是 JSON 字串，裡面可能藏著金鑰、token、簽名參數、真實姓名／
 * 電話／帳號，或是打向真實線路的 URL（parent spec HubRefactoring#1 第 18 點：
 * `api_settings` 的端點要指向 stub，才能在不改 Legacy 程式碼的前提下攔截出站
 * 呼叫）。這三個欄位是「情境/stub 需要結構」的設定，遮罩後仍要維持合法 JSON。
 *
 * 不是逐欄位設定路徑，而是依「鍵名」與「值的形狀」通用處理：
 * - 陣列元素繼承父鍵名脈絡：`{"token":["TOK1","TOK2"]}` 的兩個字串都當成
 *   「token 底下的值」處理，不是因為陣列本身有鍵名。
 * - 字串值如果本身可以被解析成 JSON 物件/陣列（雙重編碼，常見於某些廠商把整段
 *   設定用字串包一層），先遞迴解開處理，而不是被當成單純字串套用鍵名規則。
 * - 頂層如果整段就是字串（沒有物件/陣列包住），依它是不是 URL 判斷；不是 URL
 *   就當成這個 JSON 欄位本身的內容在描述一個機密值，一併遮罩（沒有鍵名可以
 *   判斷「敏不敏感」，這種欄位存在的意義本來就是拿來設定 API，保守起見一律當
 *   成敏感值處理）。
 * - 其餘（不符合 URL、鍵名不敏感的字串；數字、布林、null）原樣保留。
 */

const SENSITIVE_KEY_RE = /account|name|phone|mobile|tel|email|pwd|pass|merchant|key|secret|token|password|sign/i;
const URL_RE = /^https?:\/\//i;

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
  if (keyContext === null || SENSITIVE_KEY_RE.test(keyContext)) return maskValue("secret_key", value);
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
  return value; // 數字、布林、null 原樣保留
}

/**
 * 遮罩一段 JSON 文字。非合法 JSON 一律 throw——這類欄位在 schema 裡就是拿來存
 * JSON 用的，內容如果不是合法 JSON，代表遮罩規則不適用於這筆資料，寧可讓人
 * 工確認也不要冒著漏遮的風險原樣放行。
 */
export function maskJsonText(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(
      `maskJsonText 失敗：內容不是合法 JSON，拒絕原樣放行（可能藏著未遮罩的機密）。原始內容開頭：${raw.slice(0, 80)}`,
      { cause }
    );
  }
  // 頂層沒有鍵名（keyContext = null）：物件/陣列往下遞迴各自處理各自的鍵；
  // 頂層本身如果是純字串，maskJsonNode 的字串分支會依 URL / 是否可再解析成
  // JSON 判斷，兩者都不是就當成敏感值整個遮罩（見上方檔案說明）。
  return JSON.stringify(maskJsonNode(parsed, null));
}
