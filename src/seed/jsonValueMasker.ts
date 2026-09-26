import { STUB_BASE_URL, type JsonKeyKind } from "./maskConfig";
import { maskNumber, maskValue } from "./maskValue";

/**
 * Issue #13（第四輪 code review 決議）：JSON 遮罩改成白名單，不是黑名單。
 *
 * 前一版用「鍵名片段比對敏感字集合」判斷要不要遮，結果同時「太寬」（`sign_type`
 * 這種欄位名字帶 `sign` 但其實是演算法版本，不該遮）又「太窄」（`appkey`、
 * `md5key`、`mch_id`、`pin`、`username`……這些真正的憑證/個資鍵名不在集合裡，
 * 原樣外洩）。鍵名黑名單／敏感字集合永遠列不完，跟三輪 review 一直在 SQL
 * parser 上重蹈覆轍是同一種錯誤。
 *
 * 現在反過來：每個 `mask_json` 欄位（`src/seed/maskConfig.ts` 的
 * `TABLE_CONFIG`）自己宣告一份「可以原樣保留的鍵名」白名單（`keep`，例如
 * `lang`、`dc`、`smsCost` 這類結構性描述／業務設定），或是「要換成 stub 的
 * URL 鍵」（`url`，依 Legacy 實際讀取的端點鍵，例如 `api_url`）。**沒列在
 * 白名單裡的鍵，不管值是字串還是數字，一律遮**——字串換成合成字串，數字換成
 * 合成數字，型別不變；只有布林值和 `null` 不會是機密，原樣保留。
 *
 * 其餘規則沿用：陣列元素繼承父鍵名脈絡（白名單也是依父鍵名查）；字串值如果
 * 本身可以被解析成 JSON 物件/陣列（雙重編碼）就遞迴處理。
 *
 * 第五輪 code review 決議：字串值只要長得像 `http(s)://` URL，不管鍵名有沒有
 * 在白名單裡、也不管白名單把它標成 `keep` 還是沒列，一律換成 stub 位址——
 * 已用探針證實：`backoffice_api_url` 這類沒被個別列進白名單的端點鍵，原本會
 * 被當成一般字串遮成不可用的亂碼，而不是換成 stub，導致情境/stub 撥不通。
 * URL 的值本身沒有「原樣保留」的安全理由（一定是某個出站端點），偵測到就統一
 * 導去 stub，比要求每個平台/供應商各自把端點鍵一一列進白名單更不容易漏。
 */
const HTTP_URL_RE = /^https?:\/\//i;

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

function maskJsonString(value: string, keyKind: JsonKeyKind | undefined): string {
  const nested = tryParseJsonContainer(value);
  if (nested !== undefined) {
    // 字串值本身又是一段 JSON：不管外層鍵是不是白名單，都要往下遞迴檢查，
    // 白名單信任的是「這個鍵本身的值該不該露出來」，不是「這個鍵底下的任意
    // 巢狀結構都安全」。
    return JSON.stringify(maskJsonNode(nested, undefined));
  }
  if (HTTP_URL_RE.test(value)) return STUB_BASE_URL;
  if (keyKind === "url") return STUB_BASE_URL; // 值本身沒有 http(s) 開頭（例如裸網域）但鍵名宣告是 URL
  if (keyKind === "keep") return value;
  return maskValue("secret_key", value);
}

function maskJsonNumber(value: number, keyKind: JsonKeyKind | undefined): number | string {
  if (keyKind === "keep") return value;
  if (keyKind === "url") return value; // 數字不可能是 URL，理論上不會發生，保底原樣
  return maskNumber(value);
}

function maskJsonNode(value: unknown, keyKind: JsonKeyKind | undefined): unknown {
  if (Array.isArray(value)) {
    // 陣列元素繼承父鍵名脈絡（同一個 keyKind），陣列本身沒有鍵名。
    return value.map((item) => maskJsonNode(item, keyKind));
  }
  if (value !== null && typeof value === "object") {
    return maskJsonObject(value as Record<string, unknown>);
  }
  if (typeof value === "string") return maskJsonString(value, keyKind);
  if (typeof value === "number") return maskJsonNumber(value, keyKind);
  return value; // 布林、null 原樣保留
}

function maskJsonObject(obj: Record<string, unknown>, safeKeys: Readonly<Record<string, JsonKeyKind>> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(obj)) {
    out[key] = maskJsonNode(child, Object.hasOwn(safeKeys, key) ? safeKeys[key] : undefined);
  }
  return out;
}

/**
 * 遮罩一段 JSON 內容，回傳重新序列化後的 JSON 文字。`raw` 可以是尚未解析的
 * JSON 字串，也可以是已經被解析過的值——MariaDB 對宣告 `CHECK (json_valid(...))`
 * 的 `LONGTEXT` 欄位，mysql2 有時會直接回傳解析好的 JS 物件/陣列而不是原始
 * 字串，兩種情況都要能處理。字串內容如果不是合法 JSON 一律 throw——這類欄位
 * 在 schema 裡就是拿來存 JSON 用的，內容如果不是合法 JSON，代表遮罩規則不適用
 * 於這筆資料，寧可讓人工確認也不要冒著漏遮的風險原樣放行。
 *
 * `safeKeys` 是這個欄位專屬的白名單（`src/seed/maskConfig.ts` 逐欄宣告），
 * 只在 JSON 的「頂層」套用——頂層物件的每個鍵，依它是不是在白名單裡決定要
 * `keep`/`url`/遮罩；再往下巢狀的物件，鍵名脈絡由 `maskJsonNode` 自己往下傳
 * 遞（因為白名單是「這個欄位的頂層長什麼樣子」的宣告，不是「任何深度的這個
 * 鍵名都安全」——同名的巢狀鍵不會被誤判成頂層的白名單鍵）。
 */
export function maskJsonValue(raw: unknown, safeKeys: Readonly<Record<string, JsonKeyKind>> = {}): string {
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

  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return JSON.stringify(maskJsonObject(parsed as Record<string, unknown>, safeKeys));
  }
  // 頂層是陣列或純量：沒有頂層鍵名可以查白名單，一律當「沒有白名單」處理
  // （keyKind = undefined），陣列元素、純量都會被遮——這種形狀在
  // `TABLE_CONFIG` 目前設定的四個 mask_json 欄位裡不會出現，保底處理。
  return JSON.stringify(maskJsonNode(parsed, undefined));
}
