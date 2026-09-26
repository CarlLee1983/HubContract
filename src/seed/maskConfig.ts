/**
 * Issue #13：快照遮罩白名單設定。
 *
 * 為什麼是白名單，不是 SQL parser + 黑名單
 * ------------------------------------------
 * 前三輪 code review 都在同一個地方找到漏網：自己寫的 mysqldump parser 有某種
 * 語法沒認出來（不加引號的表名、`db`.`table`、`ON DUPLICATE KEY UPDATE`、
 * `VALUES ROW()`、`#` 註解……），或是黑名單漏了某個表/欄位（`note`、
 * `settings.val`、fixture 寫死的 id）。SQL 語法的變化型態幾乎無窮，黑名單只能
 * 不斷追著已知的漏洞跑；換成白名單以後，情況倒過來：**任何沒被明確分類的表或
 * 欄位，遮罩腳本直接失敗**，而不是「看起來沒問題就放行」。解析本身也交給真的
 * MariaDB（見 `src/seed/dockerMariaDb.ts`），我們只在資料庫「裡面」用 SQL
 * 讀資料、算合成值、UPDATE 回去——不用自己維護一份 SQL 語法的子集合解析器。
 *
 * 這份設定對照 `seeds/mysql-schema.sql`（112 張表、1075 個欄位）逐欄整理，
 * 先用程式化規則打底（`id`/`*_id` 一律 `keep`；數值與時間型別一律 `keep`；欄名
 * 符合常見自由文字樣式──note/memo/remark/summary/content/body/description/
 * reason/message/comment/raw/response/request/payload/log/receipt/snapshot/
 * reply/answer──一律 `null`），再用這三輪 review 找到的具體項目手動覆蓋（見
 * `OVERRIDES`）。跑在真的資料庫上時，`information_schema` 找到的每一個表/欄位
 * 都必須能在這份設定裡查到分類，查不到就列出全部後 throw（見
 * `maskDatabase()` 開頭的分類完整性檢查）——不管是這份手動
 * 整理漏掉的欄位，還是測試站 schema 比 `seeds/mysql-schema.sql` 多出來的欄位，
 * 都會在跑遮罩腳本的當下被擋下來，而不是悄悄外洩。
 */

export type MaskCategory = "secret_key" | "account" | "name" | "email" | "wallet_address";

/**
 * `mask_json` 欄位裡，一個鍵名可以原樣保留（`keep`），或者是要換成 stub 位址的
 * URL（`url`）。沒列在 `safeKeys` 裡的鍵，不管值是字串還是數字，一律遮罩——
 * 白名單，不是「看鍵名像不像敏感字」的黑名單（第四輪 code review 決議：
 * `appkey`/`md5key`/`mch_id` 這類鍵名黑名單永遠列不完，唯一安全的預設是
 * 「預設遮，明確列出來的才留」）。
 */
export type JsonKeyKind = "keep" | "url";

export type ColumnAction =
  /** 欄位原樣保留：已確認不是敏感資料（業務代碼、狀態、金額、時間戳記……）。 */
  | { readonly kind: "keep" }
  /** 換成依原值決定性推得的合成值（見 `maskValue.ts`）。 */
  | { readonly kind: "mask"; readonly category: MaskCategory }
  /** 一律清成 NULL（token、記住我 cookie、自由文字備註、第三方回應原文……）。 */
  | { readonly kind: "null" }
  /** 換成同一個固定值，不管原值是什麼（例如統一密碼雜湊、stub URL）。 */
  | { readonly kind: "fixed"; readonly value: string }
  /** 欄位存的是 JSON 字串，依 `safeKeys` 白名單遞迴遮罩（見 `jsonValueMasker.ts`）。 */
  | { readonly kind: "mask_json"; readonly safeKeys: Readonly<Record<string, JsonKeyKind>> }
  /** `players.account` 專用：保留「使用者帳號 + 站台代碼 + p + 平台 id」的推導關係。 */
  | { readonly kind: "derive_player_account" };

export interface TableConfig {
  /** 整張表都是「情境用不到、只裝敏感內容」，資料列整批不寫進遮罩後的種子。 */
  readonly truncate?: true;
  /** `truncate` 沒設時必填：這張表每一個欄位都要有分類。 */
  readonly columns?: Readonly<Record<string, ColumnAction>>;
}

/** synthetic-seed.sql 裡固定用的合成 bcrypt 雜湊，統一拿來蓋掉遮罩後的密碼欄位。 */
export const SYNTHETIC_PASSWORD_HASH = "$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi";

/**
 * 錄製環境的線路 stub 位址，跟 `seeds/synthetic-seed.sql` 的 `platforms.api_settings`
 * 一致。JSON 欄位裡的 URL、以及整欄就是 URL 的欄位（例如 `payments.api_url`），
 * 遮罩後統一指向這裡（parent spec HubRefactoring#1 第 18 點）。
 */
export const STUB_BASE_URL = "http://mock-provider:8081";

const keep: ColumnAction = { kind: "keep" };
const nul: ColumnAction = { kind: "null" };
const derivePlayerAccount: ColumnAction = { kind: "derive_player_account" };
const mask = (category: MaskCategory): ColumnAction => ({ kind: "mask", category });
const fixed = (value: string): ColumnAction => ({ kind: "fixed", value });
const maskJson = (safeKeys: Readonly<Record<string, JsonKeyKind>> = {}): ColumnAction => ({
  kind: "mask_json",
  safeKeys,
});

/**
 * 整張表都是「情境用不到、只裝敏感內容或內部遙測」的資料，見下方 `TABLE_CONFIG`
 * 裡各自標了 `truncate: true` 的表。除了 Issue #13 第一輪就決定的
 * `sessions`/`personal_access_tokens`/`password_reset_tokens`/`failed_jobs`/
 * `activity_log`/`sms_logs`/`chat_room_messages`/`login_logs`/`user_login_logs`，
 * 這輪重寫額外整表清空：
 * - `pulse_aggregates`/`pulse_entries`/`pulse_values`：Laravel Pulse 的內部遙測
 *   表，存的是序列化的查詢/例外資訊，格式不受控、任何情境都不依賴，逐欄分類
 *   意義不大，乾脆整表清空。
 * - `job_batches`：queue 批次追蹤，可能包含序列化的例外堆疊。
 * - `schedule_logs`／`report_logs`：排程與報表產生紀錄，內容是執行期間的
 *   輸出/錯誤訊息，情境不依賴。
 */
export const TABLE_CONFIG: Readonly<Record<string, TableConfig>> = {
  activity_log: { truncate: true },
  administers: {
    columns: {
      id: keep,
      name: mask("name"),
      account: mask("account"),
      email: mask("email"),
      active: keep,
      password: fixed(SYNTHETIC_PASSWORD_HASH),
      language: keep,
      remember_token: nul,
      last_login_ip: nul,
      last_login_at: keep,
      last_login_token: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  advance_deposits: {
    columns: {
      id: keep,
      no: keep,
      amount: keep,
      accumulation: keep,
      status: keep,
      completed_at: keep,
      note: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  banners: {
    columns: {
      id: keep,
      uuid: keep,
      active: keep,
      open_window: keep,
      sort: keep,
      uri: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  betting_log_temps: {
    columns: {
      id: keep,
      platform_name: keep,
      game_at: keep,
      settled_at: keep,
      data_count: keep,
      is_log: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  betting_logs: {
    columns: {
      id: keep,
      no: keep,
      version: keep,
      user_id: keep,
      platform_id: keep,
      player_id: keep,
      game_type: keep,
      game_id: keep,
      wallet_id: keep,
      rollover_log_id: keep,
      status: keep,
      result: keep,
      bet: keep,
      win: keep,
      total: keep,
      valid_bet: keep,
      rebate: keep,
      rebate_rate: keep,
      type: keep,
      summary: nul,
      raw_data: nul,
      rebateable: keep,
      betting_at: keep,
      settled_at: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  betting_reports: {
    columns: {
      id: keep,
      user_id: keep,
      report_type: keep,
      report_at: keep,
      deposit: keep,
      withdrawal: keep,
      payment_cost: keep,
      profit_loss: keep,
      valid_bet: keep,
      bonus: keep,
      commission: keep,
      rebate: keep,
      game_cost: keep,
      summary: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  bonus_news: {
    columns: {
      id: keep,
      bonus_tag_id: keep,
      uuid: keep,
      title: keep,
      content: nul,
      cover_url: keep,
      sort: keep,
      active: keep,
      start_at: keep,
      end_at: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  bonus_news_tags: {
    columns: {
      id: keep,
      name: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  chat_room_announcements: {
    columns: {
      id: keep,
      type: keep,
      body: nul,
      updated_at: keep,
      created_at: keep,
      deleted_at: keep,
    },
  },
  chat_room_messages: { truncate: true },
  chat_room_privates: {
    columns: {
      id: keep,
      user_id: keep,
      chatter_id: keep,
      last_message_id: keep,
      updated_at: keep,
      created_at: keep,
    },
  },
  commission_checkouts: {
    columns: {
      id: keep,
      user_id: keep,
      active_users: keep,
      valid_bet_total: keep,
      profit_loss_total: keep,
      commission_type: keep,
      commission_total: keep,
      summaries: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  commission_reports: {
    columns: {
      id: keep,
      user_id: keep,
      betting_report_id: keep,
      commission_checkout_id: keep,
      down_user_id: keep,
      layer: keep,
      valid_bet: keep,
      profit_loss: keep,
      cost: keep,
      checkout_no: keep,
      is_checkout: keep,
      commission_percent: keep,
      rebate_percent: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  commission_withdraws: {
    columns: {
      id: keep,
      no: keep,
      receipt_type: nul,
      receipt_id: keep,
      receipt_data: nul,
      trade_no: keep,
      trade_response_data: nul,
      trade_error_reason: nul,
      payment_id: keep,
      payment_withdrawal_option_id: keep,
      type: keep,
      is_third_party: keep,
      user_id: keep,
      user_level: keep,
      cash: keep,
      amount: keep,
      txn_data: nul,
      txn_fees: keep,
      status: keep,
      stage: keep,
      note: nul,
      expired_at: keep,
      check_code: keep,
      error_code: keep,
      error_message: nul,
      administer_id: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  currencies: {
    columns: {
      id: keep,
      name: keep,
      rate: keep,
      active: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  dashboard: {
    columns: {
      id: keep,
      name: keep,
      date: keep,
      data: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  deposit_records: {
    columns: {
      id: keep,
      no: keep,
      trade_no: keep,
      user_id: keep,
      wallet_id: keep,
      currency: keep,
      amount: keep,
      status: keep,
      stage: keep,
      note: nul,
      expired_at: keep,
      error_code: keep,
      error_message: nul,
      completed_at: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  earning_records: {
    columns: {
      id: keep,
      user_id: keep,
      player_id: keep,
      wallet_id: keep,
      balance_original: keep,
      balance: keep,
      balance_variable: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  event_bonus_records: {
    columns: {
      id: keep,
      user_id: keep,
      event_id: keep,
      user_event_id: keep,
      serial: keep,
      bonus: keep,
      rollover_log_amount: keep,
      ticket_id: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  events: {
    columns: {
      id: keep,
      uuid: keep,
      code: keep,
      name: keep,
      type: keep,
      introduction: keep,
      description: nul,
      start_at: keep,
      end_at: keep,
      active: keep,
      rebateable: keep,
      bonus_budget: keep,
      bonus_issued: keep,
      addons: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  failed_jobs: { truncate: true },
  flatten_rebate_reports: {
    columns: {
      id: keep,
      user_id: keep,
      reported_at: keep,
      data: keep,
      total: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  friends: {
    columns: {
      id: keep,
      user_id: keep,
      target_id: keep,
      type: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  game_companies: {
    columns: {
      id: keep,
      name: keep,
      platform_id: keep,
      platform_name: keep,
      currency: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  game_currencies: {
    columns: {
      id: keep,
      game_id: keep,
      currency: keep,
      status: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  game_logo_histories: {
    columns: {
      id: keep,
      game_id: keep,
      path: keep,
      original_path: keep,
      disk: keep,
      version: keep,
      created_by: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  game_name_translations: {
    columns: {
      id: keep,
      game_code: keep,
      locale: keep,
      name: keep,
      source: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  game_types: {
    columns: {
      id: keep,
      name: keep,
      active: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  games: {
    columns: {
      id: keep,
      code: keep,
      signature: keep,
      name: keep,
      logo: nul,
      type: keep,
      platform_name: keep,
      game_company_name: keep,
      active: keep,
      maintain: keep,
      orientation: keep,
      is_recommended: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  genealogies: {
    columns: {
      id: keep,
      user_id: keep,
      up_user_id: keep,
      layer: keep,
    },
  },
  gross_profit_reports: {
    columns: {
      id: keep,
      report_at: keep,
      deposit_total: keep,
      withdrawal_total: keep,
      deposit_and_withdrawal_diff: keep,
      deposit_and_withdrawal_fees_total: keep,
      rebate_total: keep,
      bonus_total: keep,
      commission_total: keep,
      game_cost: keep,
      gross_profit: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  guild_users: {
    columns: {
      id: keep,
      user_id: keep,
      guild_id: keep,
      role: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  guilds: {
    columns: {
      id: keep,
      // name／intro 是會員自己創立公會時填的顯示名稱/簡介，不是業務代碼或
      // enum；name 是 NOT NULL 所以用 mask（合成名稱字串），intro 可為 NULL
      // 直接清空（第四輪 code review 決議）。
      name: mask("name"),
      creator_id: keep,
      level: keep,
      intro: nul,
      description: nul,
      balance: keep,
      settings: keep,
      deleted_reason: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  i18n_descriptions: {
    columns: {
      id: keep,
      key: keep,
      tags: keep,
      description: nul,
      created_at: keep,
      updated_at: keep,
    },
  },
  i18n_languages: {
    columns: {
      id: keep,
      name: keep,
      locale_code: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  i18n_translated: {
    columns: {
      id: keep,
      i18n_description_id: keep,
      i18n_language_id: keep,
      translated: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  job_batches: { truncate: true },
  login_logs: { truncate: true },
  maintain_schedules: {
    columns: {
      id: keep,
      model_type: keep,
      model_id: keep,
      start_at: keep,
      end_at: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  medias: {
    columns: {
      uuid: keep,
      mediable_id: keep,
      mediable_type: keep,
      name: keep,
      path: keep,
      type: keep,
      scope: keep,
      sort: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  // 第四輪 code review 決議：migrations 改整表清空。凍結的 seeds/mysql-schema.sql
  // 本身已經內建一份完整的 migrations 資料列（載入 env-reset.sh 的第一步），
  // 遮罩後的種子如果還帶自己的 128 列 migrations，載入時會撞主鍵/唯一鍵
  // duplicate entry；這張表的內容（Laravel 內部的遷移執行紀錄）本來就跟任何
  // 情境無關，用 truncate 最單純。
  migrations: { truncate: true },
  model_has_permissions: {
    columns: {
      permission_id: keep,
      model_type: keep,
      model_id: keep,
    },
  },
  model_has_roles: {
    columns: {
      role_id: keep,
      model_type: keep,
      model_id: keep,
    },
  },
  news: {
    columns: {
      id: keep,
      news_tag_id: keep,
      uuid: keep,
      title: keep,
      content: nul,
      sort: keep,
      active: keep,
      start_at: keep,
      end_at: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  news_tags: {
    columns: {
      id: keep,
      name: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  orders: {
    columns: {
      id: keep,
      product_id: keep,
      deposit_record_id: keep,
      user_id: keep,
      price: keep,
      point: keep,
      tickets: keep,
      status: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  pages: {
    columns: {
      id: keep,
      title: keep,
      content: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  password_reset_tokens: { truncate: true },
  payment_deposit_options: {
    columns: {
      id: keep,
      payment_id: keep,
      active: keep,
      mode: keep,
      option_type: keep,
      min: keep,
      max: keep,
      txn_data: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  payment_history_records: {
    columns: {
      id: keep,
      no: keep,
      model_type: keep,
      model_id: keep,
      payment_id: keep,
      gateway_provider: keep,
      response_data: nul,
      created_at: keep,
      updated_at: keep,
    },
  },
  payment_logs: {
    columns: {
      id: keep,
      payment_id: keep,
      model_type: keep,
      model_id: keep,
      type: keep,
      variable: keep,
      amount: keep,
      note: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  payment_withdrawal_options: {
    columns: {
      id: keep,
      payment_id: keep,
      active: keep,
      mode: keep,
      option_type: keep,
      min: keep,
      max: keep,
      txn_data: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  payments: {
    columns: {
      id: keep,
      name: keep,
      active: keep,
      platform_kind: keep,
      currency: keep,
      merchant: keep,
      maximum_amount: keep,
      current_amount: keep,
      maximum_trades: keep,
      current_trades: keep,
      period: keep,
      api_url: fixed(STUB_BASE_URL),
      // payments.api_tokens 整欄就是金流 API 的憑證集合（md5key、merchant_id
      // 之類），沒有已知的非敏感鍵值得留白名單，安全值就是全遮。
      api_tokens: maskJson({}),
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  permissions: {
    columns: {
      id: keep,
      name: keep,
      guard_name: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  personal_access_tokens: { truncate: true },
  platform_currencies: {
    columns: {
      id: keep,
      platform_id: keep,
      currency: keep,
      vendor_currency_code: keep,
      source: keep,
      remark: nul,
      created_at: keep,
      updated_at: keep,
    },
  },
  platform_game_type_map: {
    columns: {
      platform_id: keep,
      game_type_id: keep,
      active: keep,
      cost_percent: keep,
    },
  },
  platform_maintenance_schedules: {
    columns: {
      id: keep,
      platform: keep,
      weekday: keep,
      start_time: keep,
      duration_minutes: keep,
      lead_minutes: keep,
      trail_minutes: keep,
      reason: nul,
      enabled: keep,
      effective_from: keep,
      effective_until: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  platforms: {
    columns: {
      id: keep,
      name: keep,
      is_original: keep,
      // 白名單依 .legacy-src 各 GameLobby Platform 類別實際讀取的鍵：`lang`
      // （語系）、`dc`（資料中心/地區代碼）是結構性描述，不是機密；`api_url`/
      // `url` 是打給線路的端點，換成 stub。其餘鍵（key/iv/private_key/
      // company_key/server_id/agent_id/agent/aud/portfolio……）都是各廠商自訂
      // 的憑證或識別碼，沒有全廠商通用的安全保證，一律遮。
      api_settings: maskJson({ lang: "keep", dc: "keep", api_url: "url", url: "url" }),
      active: keep,
      maintain: keep,
      authorized: keep,
      is_main: keep,
      raw_log_sync: keep,
      sort: keep,
      currencies: keep,
      regions: keep,
      game_types: keep,
      raw_index: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  play_logs: {
    columns: {
      id: keep,
      station_id: keep,
      platform_id: keep,
      user_id: keep,
      player_id: keep,
      game_id: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  players: {
    columns: {
      id: keep,
      station_id: keep,
      platform_id: keep,
      user_id: keep,
      account: derivePlayerAccount,
      vendor_player_id: nul,
      playing: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  product_packages: {
    columns: {
      id: keep,
      product_id: keep,
      user_id: keep,
      serial_number: keep,
      price: keep,
      point: keep,
      tickets: keep,
      status: keep,
      expires_at: keep,
      completed_at: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  product_serials: {
    columns: {
      id: keep,
      product_id: keep,
      user_id: keep,
      serial_number: keep,
      price: keep,
      point: keep,
      tickets: keep,
      status: keep,
      expires_at: keep,
      completed_at: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  products: {
    columns: {
      id: keep,
      name: keep,
      code: keep,
      type: keep,
      price: keep,
      point: keep,
      logo: nul,
      quantity: keep,
      tickets: keep,
      description: nul,
      status: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  promotion_tags: {
    columns: {
      id: keep,
      name: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  promotions: {
    columns: {
      id: keep,
      promotion_tag_id: keep,
      uuid: keep,
      title: keep,
      content: nul,
      cover_url: keep,
      sort: keep,
      active: keep,
      start_at: keep,
      end_at: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  pulse_aggregates: { truncate: true },
  pulse_entries: { truncate: true },
  pulse_values: { truncate: true },
  qa_tags: {
    columns: {
      id: keep,
      name: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  qas: {
    columns: {
      id: keep,
      qa_tag_id: keep,
      title: keep,
      content: nul,
      active: keep,
      active_home: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  rebate_records: {
    columns: {
      id: keep,
      user_id: keep,
      report_at: keep,
      amount: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  rebate_reports: {
    columns: {
      id: keep,
      user_id: keep,
      report_at: keep,
      game_type: keep,
      percent: keep,
      valid_bet: keep,
      amount: keep,
      rebate_record_id: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  remittance_records: {
    columns: {
      id: keep,
      platform_id: keep,
      station_id: keep,
      user_id: keep,
      no: keep,
      txn_no: keep,
      type: keep,
      wallet_id: keep,
      receipt_wallet_id: keep,
      currency: keep,
      amount: keep,
      status: keep,
      stage: keep,
      note: nul,
      error_code: keep,
      error_message: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  report_logs: { truncate: true },
  risk_event_user_map: {
    columns: {
      risk_event_id: keep,
      user_id: keep,
      detaching_at: keep,
    },
  },
  risk_event_withdrawal_map: {
    columns: {
      risk_event_id: keep,
      withdrawal_record_id: keep,
      detaching_at: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  risk_events: {
    columns: {
      id: keep,
      hashtag: keep,
      type: keep,
      note: nul,
      status: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  role_has_permissions: {
    columns: {
      permission_id: keep,
      role_id: keep,
      can_edit: keep,
    },
  },
  roles: {
    columns: {
      id: keep,
      name: keep,
      guard_name: keep,
      hierarchy: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  rollover_logs: {
    columns: {
      id: keep,
      no: keep,
      user_id: keep,
      model_type: keep,
      model_id: keep,
      amount: keep,
      origin_amount: keep,
      game: keep,
      rebateable: keep,
      note: nul,
      filled_at: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  rollover_map: {
    columns: {
      id: keep,
      rollover_log_id: keep,
      dependable_type: keep,
      dependable_id: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  schedule_logs: { truncate: true },
  service_issue_categories: {
    columns: {
      id: keep,
      name: keep,
      description: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  service_issues: {
    columns: {
      id: keep,
      issueable_type: keep,
      service_issue_category_id: keep,
      issueable_id: keep,
      closed_by_administer_id: keep,
      last_message_id: keep,
      type: keep,
      summaries: nul,
      answer: nul,
      closed_at: keep,
      updated_at: keep,
      created_at: keep,
    },
  },
  service_issues_administer_map: {
    columns: {
      service_issue_id: keep,
      administer_id: keep,
    },
  },
  sessions: { truncate: true },
  settings: {
    columns: {
      id: keep,
      name: keep,
      // val 的內容依 name 而定、沒有固定 schema（site_google_recaptcha 的
      // server_token、site_contact 的 email/tel……），無法針對個別 name 設定
      // 白名單，安全值就是全遮。
      val: maskJson({}),
      group: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  site_bank_cards: {
    columns: {
      id: keep,
      name: keep,
      code: keep,
      account: mask("account"),
      account_name: mask("name"),
      maximum_amount: keep,
      current_amount: keep,
      active: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  site_crypto_wallets: {
    columns: {
      id: keep,
      unique_id: keep,
      address: mask("wallet_address"),
      maximum_amount: keep,
      current_amount: keep,
      active: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  site_spends: {
    columns: {
      id: keep,
      platform_id: keep,
      game_type_id: keep,
      report_at: keep,
      amount: keep,
      cost_percent: keep,
      spend: keep,
      spend_accumulation: keep,
      alert: keep,
      is_settled: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  sms: {
    columns: {
      id: keep,
      station_id: keep,
      code: keep,
      name: keep,
      supplier: keep,
      active: keep,
      amount: keep,
      // 白名單依 .legacy-src 各 SMS Supplier 類別實際讀取的鍵：`url` 是打給
      // 簡訊供應商的端點，換成 stub；`smsCost` 是純業務設定（每則簡訊成本），
      // 不是憑證。其餘鍵（appkey/appcode/appsecret/api_id/api_password/
      // orgCode/MD5……）都是各供應商自訂的憑證，一律遮。
      settings: maskJson({ url: "url", smsCost: "keep" }),
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  sms_logs: { truncate: true },
  station_currencies: {
    columns: {
      id: keep,
      station_id: keep,
      currency: keep,
      status: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  station_game_companies: {
    columns: {
      id: keep,
      station_id: keep,
      game_company_id: keep,
      game_company_name: keep,
      currency: keep,
      active: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  stations: {
    columns: {
      id: keep,
      name: keep,
      code: keep,
      secret_key: mask("secret_key"),
      cost_percent: keep,
      callback_domain: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  ticket_bonus_records: {
    columns: {
      id: keep,
      user_id: keep,
      ticket_id: keep,
      user_ticket_id: keep,
      bonus: keep,
      rollover_log_amount: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  tickets: {
    columns: {
      id: keep,
      uuid: keep,
      code: keep,
      name: keep,
      type: keep,
      introduction: keep,
      description: nul,
      start_at: keep,
      end_at: keep,
      active: keep,
      rebateable: keep,
      addons: keep,
      updated_at: keep,
      created_at: keep,
      deleted_at: keep,
    },
  },
  transactions: {
    columns: {
      id: keep,
      user_id: keep,
      model_type: keep,
      model_id: keep,
      model_no: keep,
      wallet_id: keep,
      platform_name: keep,
      type: keep,
      trade_type: keep,
      currency: keep,
      balance_original: keep,
      balance_variable: keep,
      balance_complete: keep,
      withdrawal_threshold_original: keep,
      withdrawal_threshold_variable: keep,
      withdrawal_threshold_complete: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  user_bank_cards: {
    columns: {
      id: keep,
      uuid: keep,
      user_id: keep,
      name: keep,
      code: keep,
      account: mask("account"),
      account_name: mask("name"),
      active: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  user_crypto_wallets: {
    columns: {
      id: keep,
      uuid: keep,
      user_id: keep,
      option_type: keep,
      // 使用者自己取的錢包暱稱（不像 site/user_bank_cards.name 是從固定的銀行
      // 清單選的），可能夾帶個人資訊，第四輪 code review 決議清空。
      name: nul,
      address: mask("wallet_address"),
      public_chain: keep,
      active: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  user_events: {
    columns: {
      id: keep,
      user_id: keep,
      event_id: keep,
      checkpoint: keep,
      eventable_type: keep,
      eventable_id: keep,
      status: keep,
      note_user: nul,
      note_inner: nul,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  user_ewallets: {
    columns: {
      id: keep,
      uuid: keep,
      user_id: keep,
      option_type: keep,
      account: mask("account"),
      account_name: mask("name"),
      active: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  user_guests: {
    columns: {
      id: keep,
      account: mask("account"),
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  user_level_records: {
    columns: {
      id: keep,
      user_id: keep,
      user_level_setting_id: keep,
      rank: keep,
      type: keep,
      settings: keep,
      upgrade_condition: keep,
      renewal_condition: keep,
      rebates: keep,
      caculation_start_at: keep,
      caculation_end_at: keep,
      valid_start_at: keep,
      valid_end_at: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  user_level_settings: {
    columns: {
      id: keep,
      name: keep,
      rank: keep,
      type: keep,
      upgrade_condition: keep,
      renewal_condition: keep,
      rebates: keep,
      created_at: keep,
      updated_at: keep,
    },
  },
  user_login_logs: { truncate: true },
  user_tickets: {
    columns: {
      id: keep,
      user_id: keep,
      ticket_id: keep,
      amount: keep,
      updated_at: keep,
      created_at: keep,
      deleted_at: keep,
    },
  },
  users: {
    columns: {
      id: keep,
      station_id: keep,
      account: mask("account"),
      last_deposit_at: keep,
      last_betting_at: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  wallets: {
    columns: {
      id: keep,
      user_id: keep,
      platform_id: keep,
      platform_name: keep,
      player_id: keep,
      in_use: keep,
      currency: keep,
      balance: keep,
      freeze: keep,
      check_at: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
  withdrawal_records: {
    columns: {
      id: keep,
      no: keep,
      trade_no: keep,
      user_id: keep,
      wallet_id: keep,
      currency: keep,
      amount: keep,
      status: keep,
      stage: keep,
      note: nul,
      expired_at: keep,
      error_code: keep,
      error_message: nul,
      completed_at: keep,
      created_at: keep,
      updated_at: keep,
      deleted_at: keep,
    },
  },
};
