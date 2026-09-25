/**
 * Issue #13：快照遮罩欄位設定。
 *
 * 依 `seeds/mysql-schema.sql` 逐表比對後手動整理，涵蓋四類敏感欄位：
 * 站台 `secret_key`、帳號（含第三方支付/銀行卡持有人姓名以外的帳號字串）、
 * 手機號碼、姓名（含須實名登記的銀行卡/電子錢包持有人姓名）。
 *
 * 只列出這四類；email 等其他 PII 目前不在 Issue #13 的驗收條件內，刻意不遮罩
 * （見 PR 說明）。若之後要擴大遮罩範圍，在此新增規則即可，不需要動遮罩演算法。
 */

export type MaskCategory = "secret_key" | "account" | "phone" | "name";

export interface MaskRule {
  readonly table: string;
  readonly column: string;
  readonly category: MaskCategory;
}

export const MASK_RULES: readonly MaskRule[] = [
  // 站台密鑰：simulator/legacy 用來驗證簽章，最高機密等級。
  { table: "stations", column: "secret_key", category: "secret_key" },

  // 後台管理員。
  { table: "administers", column: "account", category: "account" },
  { table: "administers", column: "name", category: "name" },

  // 會員帳號。
  { table: "users", column: "account", category: "account" },

  // 遊戲線路玩家帳號（站台帳號 + 平台代碼組出的登入帳號）。
  { table: "players", column: "account", category: "account" },

  // 訪客編號欄位名稱雖是 account，實際是系統產生的訪客識別碼，但仍依欄位名稱
  // 一併遮罩，避免遺漏（見 PR 說明的決策紀錄）。
  { table: "user_guests", column: "account", category: "account" },

  // 銀行卡：帳號 + 須實名登記的持卡人姓名。
  { table: "site_bank_cards", column: "account", category: "account" },
  { table: "site_bank_cards", column: "account_name", category: "name" },
  { table: "user_bank_cards", column: "account", category: "account" },
  { table: "user_bank_cards", column: "account_name", category: "name" },

  // 電子錢包：帳號 + 須實名登記的持有人姓名。
  { table: "user_ewallets", column: "account", category: "account" },
  { table: "user_ewallets", column: "account_name", category: "name" },

  // 簡訊發送紀錄的接收電話。
  { table: "sms_logs", column: "phone", category: "phone" },
] as const;

/** 依表名查出該表要遮罩的欄位（欄位名稱 -> 類別）。 */
export function buildMaskLookup(rules: readonly MaskRule[] = MASK_RULES): Map<string, Map<string, MaskCategory>> {
  const lookup = new Map<string, Map<string, MaskCategory>>();
  for (const rule of rules) {
    if (!lookup.has(rule.table)) {
      lookup.set(rule.table, new Map());
    }
    lookup.get(rule.table)!.set(rule.column, rule.category);
  }
  return lookup;
}
