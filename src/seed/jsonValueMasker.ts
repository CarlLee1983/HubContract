import { maskValue } from "./maskValue";

/**
 * Issue #13：`platforms.api_settings`、`payments.api_tokens`、`sms.settings`、
 * `commission_withdraws.receipt_data` 這類欄位存的是 JSON 字串，裡面可能藏著
 * 金鑰、token、簽名參數，或是打向真實線路的 URL（parent spec #1 第 18 點：
 * `api_settings` 的端點要指向 stub，才能在不改 Legacy 程式碼的前提下攔截出站
 * 呼叫）。這裡不是逐欄位設定路徑，而是依「鍵名」與「值的形狀」通用處理：
 *
 * - 鍵名符合 /key|secret|token|password|sign/i 的字串值 -> 換成決定性合成值。
 * - 值本身是 http(s) URL -> 換成錄製環境的線路 stub 位址。
 * - 其餘原樣保留（包含結構、數字、布林、非以上兩種形狀的字串）。
 */

const SENSITIVE_KEY_RE = /key|secret|token|password|sign/i;
const URL_RE = /^https?:\/\//i;

/** 錄製環境的線路 stub 位址（與 `seeds/synthetic-seed.sql` 的 platforms.api_settings 一致）。 */
export const STUB_BASE_URL = "http://mock-provider:8081";

function maskJsonNode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(maskJsonNode);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === "string") {
        if (URL_RE.test(child)) {
          out[key] = STUB_BASE_URL;
        } else if (SENSITIVE_KEY_RE.test(key)) {
          out[key] = maskValue("secret_key", child);
        } else {
          out[key] = child;
        }
      } else {
        out[key] = maskJsonNode(child);
      }
    }
    return out;
  }
  return value;
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
  return JSON.stringify(maskJsonNode(parsed));
}
