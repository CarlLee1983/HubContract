/**
 * Issue #13：快照遮罩設定。依 `seeds/mysql-schema.sql` 逐表比對後手動整理。
 *
 * 三種動作，對應三種風險：
 * 1. `COLUMN_RULES`——欄位還留著（情境或 debug 可能用得到值本身的「形狀」），
 *    但值本身敏感，換成合成值 / 固定值 / NULL。
 * 2. `CLEAR_TABLES`——整張表都是「情境用不到、只裝敏感內容」，資料列直接不寫入
 *    快照種子（等同清空），省得逐欄位設定。
 * 3. `players.account` 用專屬的 `derive_player_account` 動作——它不是獨立資料，
 *    是 `${users.account}${stations.code}p${platforms.id}` 組出來的（驗證見
 *    `LobbyAbstract::getFormattedPlayerAccount()`，HubContract 主 repo
 *    `.legacy-src/app/Support/GameLobby/LobbyAbstract.php`），遮罩時要保留這個
 *    推導關係，不能整串當普通帳號字串處理。
 */

export type MaskCategory = "secret_key" | "account" | "phone" | "name" | "email" | "wallet_address";

export type ColumnAction =
  /** 換成依原值決定性推得的合成值（見 `maskValue.ts`）。 */
  | { readonly kind: "mask"; readonly category: MaskCategory }
  /** 欄位存的是 JSON 字串，依鍵名/值形狀遞迴遮罩（見 `jsonValueMasker.ts`）。 */
  | { readonly kind: "mask_json" }
  /** 換成同一個固定值，不管原值是什麼（例如統一密碼雜湊）。 */
  | { readonly kind: "fixed"; readonly value: string }
  /** 一律清成 NULL（例如 token、記住我 cookie）。 */
  | { readonly kind: "null" }
  /** `players.account` 專用：保留「使用者帳號 + 站台代碼 + p + 平台 id」的推導關係。 */
  | { readonly kind: "derive_player_account" };

export interface ColumnRule {
  readonly table: string;
  readonly column: string;
  readonly action: ColumnAction;
}

/** synthetic-seed.sql 裡固定用的合成 bcrypt 雜湊，統一拿來蓋掉遮罩後的密碼欄位。 */
export const SYNTHETIC_PASSWORD_HASH = "$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi";

const mask = (category: MaskCategory): ColumnAction => ({ kind: "mask", category });
const maskJson: ColumnAction = { kind: "mask_json" };
const clearToNull: ColumnAction = { kind: "null" };
const fixed = (value: string): ColumnAction => ({ kind: "fixed", value });

export const COLUMN_RULES: readonly ColumnRule[] = [
  // 站台密鑰：simulator/legacy 用來驗證簽章，最高機密等級。
  { table: "stations", column: "secret_key", action: mask("secret_key") },

  // 後台管理員：帳號、姓名、信箱、密碼、各種 token/IP 都要處理。
  { table: "administers", column: "account", action: mask("account") },
  { table: "administers", column: "name", action: mask("name") },
  { table: "administers", column: "email", action: mask("email") },
  { table: "administers", column: "password", action: fixed(SYNTHETIC_PASSWORD_HASH) },
  { table: "administers", column: "remember_token", action: clearToNull },
  { table: "administers", column: "last_login_token", action: clearToNull },
  { table: "administers", column: "last_login_ip", action: clearToNull },

  // 會員帳號。
  { table: "users", column: "account", action: mask("account") },

  // 遊戲線路玩家帳號：站台帳號 + 站台代碼 + 平台 id 組出來的，見上方說明。
  { table: "players", column: "account", action: { kind: "derive_player_account" } },

  // 訪客編號欄位名稱雖是 account，實際是系統產生的訪客識別碼；仍依欄位名稱一併
  // 遮罩，避免遺漏（code review 決議：連同 user_guests 一起遮）。
  { table: "user_guests", column: "account", action: mask("account") },

  // 銀行卡：帳號 + 須實名登記的持卡人姓名。
  { table: "site_bank_cards", column: "account", action: mask("account") },
  { table: "site_bank_cards", column: "account_name", action: mask("name") },
  { table: "user_bank_cards", column: "account", action: mask("account") },
  { table: "user_bank_cards", column: "account_name", action: mask("name") },

  // 電子錢包：帳號 + 須實名登記的持有人姓名。
  { table: "user_ewallets", column: "account", action: mask("account") },
  { table: "user_ewallets", column: "account_name", action: mask("name") },

  // 加密貨幣錢包地址（會員收款 / 平台收款）。
  { table: "user_crypto_wallets", column: "address", action: mask("wallet_address") },
  { table: "site_crypto_wallets", column: "address", action: mask("wallet_address") },

  // 密碼重設 token 所屬信箱：實務上 password_reset_tokens 整表都清空（見
  // CLEAR_TABLES），這裡不重複設定；如果之後改成不整表清空，記得補上。

  // 單筆清成 NULL：完整投注紀錄的原始資料（不是整張 betting_logs 都用不到，只
  // 有這欄可能夾帶第三方回傳的敏感內容）。
  { table: "betting_logs", column: "raw_data", action: clearToNull },

  // JSON 設定欄位：依鍵名/值形狀遞迴遮罩，見 jsonValueMasker.ts。
  { table: "platforms", column: "api_settings", action: maskJson },
  { table: "payments", column: "api_tokens", action: maskJson },
  { table: "sms", column: "settings", action: maskJson },
  { table: "commission_withdraws", column: "receipt_data", action: maskJson },
] as const;

/**
 * 整張表都是「情境用不到、只裝敏感內容」，資料列直接不寫進遮罩後的種子。
 *
 * - sessions／personal_access_tokens／password_reset_tokens／failed_jobs：登入
 *   態、API token、密碼重設 token、失敗 queue job 的完整 payload，任何情境都
 *   不會讀這些表，內容卻可能包含使用者敏感資料或內部堆疊資訊。
 * - activity_log：`causer`/`subject` 的操作紀錄與 `properties`，內容不受控（可能
 *   整包塞使用者送出的原始資料），情境不依賴它。
 * - sms_logs：`request_raw`/`response_raw` 是打給簡訊供應商的原始請求/回應，比
 *   `phone`/`smbody` 更容易夾帶帳密等資訊，乾脆整表清空（比只清 content 保守）。
 * - chat_room_messages：`body` 是使用者聊天室訊息原文（json），情境不依賴。
 * - login_logs／user_login_logs：`last_login_ip`/`ip_address` 是 IP，屬個資，
 *   Pilot（check-transaction）情境不依賴登入紀錄。
 */
export const CLEAR_TABLES: ReadonlySet<string> = new Set([
  "sessions",
  "personal_access_tokens",
  "password_reset_tokens",
  "failed_jobs",
  "activity_log",
  "sms_logs",
  "chat_room_messages",
  "login_logs",
  "user_login_logs",
]);

export type ColumnRuleLookup = ReadonlyMap<string, ReadonlyMap<string, ColumnAction>>;

/** 依表名查出該表要處理的欄位（欄位名稱 -> 動作）。不 mutate 傳入的規則陣列。 */
export function buildColumnRuleLookup(rules: readonly ColumnRule[] = COLUMN_RULES): ColumnRuleLookup {
  const lookup = new Map<string, Map<string, ColumnAction>>();
  for (const rule of rules) {
    const columns = lookup.get(rule.table) ?? new Map<string, ColumnAction>();
    columns.set(rule.column, rule.action);
    lookup.set(rule.table, columns);
  }
  return lookup;
}
