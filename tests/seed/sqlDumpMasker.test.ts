import "./testEnv";
import { describe, expect, it } from "bun:test";
import { maskMysqlDump } from "../../src/seed/sqlDumpMasker";
import { maskValue } from "../../src/seed/maskValue";
import { STUB_BASE_URL } from "../../src/seed/maskConfig";

/**
 * Issue #13：自己合成一份「看起來像真的」測試站快照（mysqldump 格式），
 * 用來驅動遮罩腳本的測試。真實快照尚未提供，不讀取、不搜尋任何實際 dump。
 *
 * 第二輪 code review 補的情境：INSERT 表名不加反引號／`db`.`table`／
 * `LOW_PRIORITY`／ANSI 雙引號、CREATE_TABLE_RE 沒錨定的注入攻擊、JSON 陣列
 * 繼承父鍵名脈絡、字串值本身又是一段 JSON、players.account 對不上推導格式時
 * 退回一般遮罩、players.vendor_player_id、擴大的敏感鍵名清單、payments.api_url
 * 換 stub、一批「純回應 blob」欄位清 NULL、輸出剝除 DDL 且每句 INSERT 帶明確
 * 欄位列表。
 */
function buildSampleSnapshot(): string {
  return `-- MySQL dump 10.13  Distrib 8.0.34, for synthetic-fixture (Issue #13)
--
-- Host: 127.0.0.1    Database: stationhub_test_snapshot
-- ------------------------------------------------------
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET TIME_ZONE='+00:00' */;

DROP TABLE IF EXISTS \`stations\`;
CREATE TABLE \`stations\` (\`id\` int NOT NULL, \`code\` varchar(255), \`name\` varchar(255), \`secret_key\` varchar(255)) ENGINE=InnoDB;

--
-- Dumping data for table \`stations\` (mysqldump 預設不帶欄位列表)
--

LOCK TABLES \`stations\` WRITE;
/*!40000 ALTER TABLE \`stations\` DISABLE KEYS */;
INSERT INTO \`stations\` VALUES (1,'DEMO_STATION','合成測試站台','sk_live_a1b2c3d4e5f6_REALLOOKING'),(2,'STATION_TWO','第二站','sk_live_z9y8x7w6v5u4_ANOTHERKEY');
REPLACE INTO \`stations\` (\`id\`,\`code\`,\`name\`,\`secret_key\`) VALUES (3,'STATION_THREE','第三站','sk_live_replace_variant_secret');
INSERT IGNORE INTO \`stations\` (\`id\`,\`code\`,\`name\`,\`secret_key\`) VALUES (4,'STATION_FOUR','第四站','sk_live_ignore_variant_secret');
/*!40000 ALTER TABLE \`stations\` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS \`administers\`;
CREATE TABLE \`administers\` (\`id\` int NOT NULL, \`name\` varchar(255), \`account\` varchar(255), \`email\` varchar(255), \`password\` varchar(255), \`remember_token\` varchar(255), \`last_login_token\` varchar(255), \`last_login_ip\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`administers\` WRITE;
INSERT INTO \`administers\` (\`id\`,\`name\`,\`account\`,\`email\`,\`password\`,\`remember_token\`,\`last_login_token\`,\`last_login_ip\`) VALUES (1,'王小明','carladmin01','carladmin01@realdomain.example','$2y$10$RealBcryptHashShouldBeOverwritten1234567890abcdefg','remember_me_real_token_abc','last_login_real_token_xyz','203.0.113.42'),(2,'O''Brien','carladmin03','c3@realdomain.example','$2y$10$AnotherRealHashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',NULL,NULL,NULL);
UNLOCK TABLES;

DROP TABLE IF EXISTS \`users\`;
CREATE TABLE \`users\` (\`id\` int NOT NULL, \`station_id\` int, \`account\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`users\` WRITE;
INSERT INTO \`users\` VALUES (1,1,'carladmin01');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`players\`;
CREATE TABLE \`players\` (\`id\` int NOT NULL, \`station_id\` int, \`platform_id\` int, \`user_id\` int, \`account\` varchar(255), \`vendor_player_id\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`players\` WRITE;
INSERT INTO \`players\` (\`id\`,\`station_id\`,\`platform_id\`,\`user_id\`,\`account\`,\`vendor_player_id\`) VALUES
(10,1,42,5,'real_player_acc99DEMO_STATIONp42','real_vendor_player_id_001'),
(11,1,1,1,'carladmin01',NULL),
(12,1,99,7,'vendor_raw_998877','real_vendor_player_id_002');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`platforms\`;
CREATE TABLE \`platforms\` (\`id\` int NOT NULL, \`name\` varchar(255), \`api_settings\` text) ENGINE=InnoDB;

LOCK TABLES \`platforms\` WRITE;
INSERT INTO \`platforms\` (\`id\`,\`name\`,\`api_settings\`) VALUES
(1,'main',NULL),
(2,'cq9','{\\"url\\":\\"https://real-provider.example:9443/api\\",\\"secret_key\\":\\"plat_secret_ABC123\\",\\"note\\":\\"keep\\",\\"tokens\\":[\\"TOK1\\",\\"TOK2\\"],\\"nested\\":\\"{\\\\\\"account\\\\\\":\\\\\\"real_nested_account\\\\\\"}\\"}');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`payments\`;
CREATE TABLE \`payments\` (\`id\` int NOT NULL, \`name\` varchar(255), \`api_url\` text, \`api_tokens\` longtext) ENGINE=InnoDB;

LOCK TABLES \`payments\` WRITE;
INSERT INTO \`payments\` (\`id\`,\`name\`,\`api_url\`,\`api_tokens\`) VALUES (1,'GatewayA','https://real-gateway.example/callback','{\\"merchant\\":\\"real_merchant_007\\",\\"mobile\\":\\"real_mobile_998\\",\\"note\\":\\"keep\\"}');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`commission_withdraws\`;
CREATE TABLE \`commission_withdraws\` (\`id\` int NOT NULL, \`no\` varchar(255), \`receipt_data\` text, \`trade_response_data\` text, \`trade_error_reason\` text, \`txn_data\` text) ENGINE=InnoDB;

LOCK TABLES \`commission_withdraws\` WRITE;
INSERT INTO \`commission_withdraws\` (\`id\`,\`no\`,\`receipt_data\`,\`trade_response_data\`,\`trade_error_reason\`,\`txn_data\`) VALUES (1,'CW0001','{"bank":"real bank account info"}','{"raw":"real gateway response"}','real error dump with stack trace','{"rate":0.01}'),(2,'CW0002',NULL,NULL,NULL,NULL);
UNLOCK TABLES;

DROP TABLE IF EXISTS \`payment_history_records\`;
CREATE TABLE \`payment_history_records\` (\`id\` int NOT NULL, \`no\` varchar(255), \`response_data\` longtext) ENGINE=InnoDB;

LOCK TABLES \`payment_history_records\` WRITE;
INSERT INTO \`payment_history_records\` (\`id\`,\`no\`,\`response_data\`) VALUES (1,'PH0001','{"raw":"real payment gateway response body"}');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`payment_deposit_options\`;
CREATE TABLE \`payment_deposit_options\` (\`id\` int NOT NULL, \`mode\` varchar(255), \`txn_data\` text) ENGINE=InnoDB;

LOCK TABLES \`payment_deposit_options\` WRITE;
INSERT INTO \`payment_deposit_options\` (\`id\`,\`mode\`,\`txn_data\`) VALUES (1,'bank','{"fee":"real fee schedule"}');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`payment_withdrawal_options\`;
CREATE TABLE \`payment_withdrawal_options\` (\`id\` int NOT NULL, \`mode\` varchar(255), \`txn_data\` text) ENGINE=InnoDB;

LOCK TABLES \`payment_withdrawal_options\` WRITE;
INSERT INTO \`payment_withdrawal_options\` (\`id\`,\`mode\`,\`txn_data\`) VALUES (1,'crypto','{"fee":"real fee schedule"}');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`service_issues\`;
CREATE TABLE \`service_issues\` (\`id\` int NOT NULL, \`type\` varchar(255), \`summaries\` text, \`answer\` text) ENGINE=InnoDB;

LOCK TABLES \`service_issues\` WRITE;
INSERT INTO \`service_issues\` (\`id\`,\`type\`,\`summaries\`,\`answer\`) VALUES (1,'withdrawal','real free-text summary written by a user','real free-text reply written by an admin');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`site_bank_cards\`;
CREATE TABLE \`site_bank_cards\` (\`id\` int NOT NULL, \`name\` varchar(255), \`account\` varchar(255), \`account_name\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`site_bank_cards\` WRITE;
INSERT INTO \`site_bank_cards\` (\`id\`,\`name\`,\`account\`,\`account_name\`) VALUES (1,'台灣銀行','1234567890123','王小明'),(2,'國泰世華',NULL,NULL);
UNLOCK TABLES;

DROP TABLE IF EXISTS \`user_crypto_wallets\`;
CREATE TABLE \`user_crypto_wallets\` (\`id\` int NOT NULL, \`address\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`user_crypto_wallets\` WRITE;
INSERT INTO \`user_crypto_wallets\` (\`id\`,\`address\`) VALUES (1,'0xDEADBEEF00000000000000000000000000BEEF');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`betting_logs\`;
CREATE TABLE \`betting_logs\` (\`id\` int NOT NULL, \`no\` varchar(255), \`raw_data\` text) ENGINE=InnoDB;

LOCK TABLES \`betting_logs\` WRITE;
INSERT INTO \`betting_logs\` (\`id\`,\`no\`,\`raw_data\`) VALUES (1,'BET0001','{\\"raw\\":\\"sensitive dump\\"}'),(2,'BET0002',NULL);
UNLOCK TABLES;

DROP TABLE IF EXISTS \`sessions\`;
CREATE TABLE \`sessions\` (\`id\` varchar(255) NOT NULL, \`payload\` longtext) ENGINE=InnoDB;

LOCK TABLES \`sessions\` WRITE;
INSERT INTO sessions (\`id\`,\`payload\`) VALUES ('abc123','serialized-session-data-with-secrets');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`password_reset_tokens\`;
CREATE TABLE \`password_reset_tokens\` (\`email\` varchar(255) NOT NULL, \`token\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`password_reset_tokens\` WRITE;
INSERT INTO \`password_reset_tokens\` (\`email\`,\`token\`) VALUES ('someone@real.example','reset-token-value');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`chat_room_messages\`;
CREATE TABLE \`chat_room_messages\` (\`id\` int NOT NULL, \`body\` longtext) ENGINE=InnoDB;

LOCK TABLES \`chat_room_messages\` WRITE;
INSERT INTO \`chat_room_messages\` (\`id\`,\`body\`) VALUES (1,'{"text":"hello"}');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`currencies\`;
CREATE TABLE \`currencies\` (\`id\` int NOT NULL, \`name\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`currencies\` WRITE;
INSERT INTO \`currencies\` (\`id\`,\`name\`) VALUES (1,'TWD (完全不受任何遮罩規則影響)');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`service_issue_categories\`;
CREATE TABLE \`service_issue_categories\` (\`id\` int NOT NULL, \`name\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`service_issue_categories\` WRITE;
INSERT INTO \`service_issue_categories\` (\`id\`,\`name\`) VALUES (1,'injection payload: CREATE TABLE \`stations\` (\`id\` int,\`code\` varchar(255),\`name\` varchar(255),\`totally_not_secret_key\` varchar(255)) ENGINE=InnoDB should NOT be parsed as real DDL (SEKRIT11 regression)');
UNLOCK TABLES;
`;
}

function extractStatementsFor(output: string, table: string): string[] {
  const re = new RegExp("(?:INSERT|REPLACE)[^;]*INTO\\s+`?" + table + "`?[\\s\\S]*?;", "gi");
  return output.match(re) ?? [];
}

function extractInsert(output: string, table: string): string {
  const [first] = extractStatementsFor(output, table);
  if (!first) throw new Error(`output 裡找不到表 ${table} 的 INSERT`);
  return first;
}

describe("Issue #13：maskMysqlDump", () => {
  it("同一份輸入重跑，輸出逐位元組相同（決定性）", () => {
    const sql = buildSampleSnapshot();
    expect(maskMysqlDump(sql)).toBe(maskMysqlDump(sql));
  });

  it("INSERT 沒帶欄位列表時，仍能靠同一份 dump 的 CREATE TABLE 找到欄位順序並遮罩 secret_key", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const stationsInsert = extractInsert(output, "stations");
    expect(stationsInsert).not.toContain("sk_live_a1b2c3d4e5f6_REALLOOKING");
    expect(stationsInsert).not.toContain("sk_live_z9y8x7w6v5u4_ANOTHERKEY");
    expect(stationsInsert).toContain("synthetic_secret_key_");
  });

  it("REPLACE INTO 與 INSERT IGNORE INTO 也會被遮罩，不會因為語句關鍵字不同而漏遮", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    expect(output).not.toContain("sk_live_replace_variant_secret");
    expect(output).not.toContain("sk_live_ignore_variant_secret");
  });

  it("重複單引號跳脫（'a''b'）不會解析錯，也不會破壞後面欄位的值", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const administersInsert = extractInsert(output, "administers");
    expect(administersInsert).not.toContain("c3@realdomain.example");
    expect(administersInsert).toContain("@example.test");
    const emails = [...administersInsert.matchAll(/'([a-f0-9]+@example\.test)'/g)].map((m) => m[1]);
    expect(emails).toHaveLength(2);
    expect(emails[0]).not.toBe(emails[1]);
  });

  it("administers.email 遮罩，且原始網域不再出現於輸出", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    expect(output).not.toContain("realdomain.example");
    expect(output).toContain("@example.test");
  });

  it("administers.password 統一換成 synthetic-seed.sql 的固定 bcrypt 雜湊", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const administersInsert = extractInsert(output, "administers");
    expect(administersInsert).not.toContain("RealBcryptHashShouldBeOverwritten");
    expect(administersInsert).not.toContain("AnotherRealHashXXXX");
    const hashes = [...administersInsert.matchAll(/'(\$2y\$10\$[^']+)'/g)].map((m) => m[1]);
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).toBe(hashes[1]);
  });

  it("administers.remember_token／last_login_token／last_login_ip 一律清成 NULL", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const administersInsert = extractInsert(output, "administers");
    expect(administersInsert).not.toContain("remember_me_real_token_abc");
    expect(administersInsert).not.toContain("last_login_real_token_xyz");
    expect(administersInsert).not.toContain("203.0.113.42");
    expect(administersInsert).toMatch(/NULL,\s*NULL,\s*NULL\)/);
  });

  it("同一個帳號字串出現在不同表（administers.account 與 users.account）時，遮罩後映射到同一個合成值", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const administersInsert = extractInsert(output, "administers");
    const usersInsert = extractInsert(output, "users");

    const adminAccountMatch = administersInsert.match(/\(1,'[^']*','([^']+)'/);
    const userAccountMatch = usersInsert.match(/\(1,\s*1,\s*'([^']+)'\)/);

    expect(adminAccountMatch).not.toBeNull();
    expect(userAccountMatch).not.toBeNull();
    expect(adminAccountMatch![1]).toBe(userAccountMatch![1]);
  });

  it("players.account 符合「使用者帳號 + 站台代碼 + p + 平台 id」的推導格式時，保留這個推導關係", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const playersInsert = extractInsert(output, "players");

    expect(playersInsert).not.toContain("real_player_acc99DEMO_STATIONp42");
    expect(playersInsert).toContain("DEMO_STATIONp42");

    const expectedPrefix = maskValue("account", "real_player_acc99");
    expect(playersInsert).toContain(`${expectedPrefix}DEMO_STATIONp42`);
  });

  it("players.account 不符合推導格式時（主平台直接存 users.account）不會 throw，改走一般帳號遮罩，且與 users.account 映射到同一合成值", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const playersInsert = extractInsert(output, "players");
    const usersInsert = extractInsert(output, "users");

    expect(playersInsert).not.toContain("'carladmin01'");

    const playerRowMatch = playersInsert.match(/\(11,\s*1,\s*1,\s*1,\s*'([^']+)'/);
    const userAccountMatch = usersInsert.match(/\(1,\s*1,\s*'([^']+)'\)/);
    expect(playerRowMatch).not.toBeNull();
    expect(userAccountMatch).not.toBeNull();
    expect(playerRowMatch![1]).toBe(userAccountMatch![1]);
  });

  it("players.account 不符合推導格式時（供應商直接發的值）也不會 throw，改走一般帳號遮罩", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const playersInsert = extractInsert(output, "players");
    expect(playersInsert).not.toContain("vendor_raw_998877");
    expect(playersInsert).toContain(maskValue("account", "vendor_raw_998877"));
  });

  it("players.vendor_player_id 清成 NULL", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const playersInsert = extractInsert(output, "players");
    expect(playersInsert).not.toContain("real_vendor_player_id_001");
    expect(playersInsert).not.toContain("real_vendor_player_id_002");
    expect(playersInsert).toMatch(/,\s*NULL\)/);
  });

  it("JSON 欄位：陣列元素繼承父鍵名脈絡（tokens 陣列裡的字串都被當成 token 遮罩）", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const platformsInsert = extractInsert(output, "platforms");
    expect(platformsInsert).not.toContain("TOK1");
    expect(platformsInsert).not.toContain("TOK2");
  });

  it("JSON 欄位：字串值本身又是一段 JSON 時遞迴處理，裡面的敏感鍵一樣被遮罩", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const platformsInsert = extractInsert(output, "platforms");
    expect(platformsInsert).not.toContain("real_nested_account");
  });

  it("JSON 欄位：鍵名符合擴大後的敏感清單（含 account/name/phone/mobile/tel/email/pwd/pass/merchant）的字串值被遮罩，URL 被換成 stub，其餘鍵原樣保留", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const platformsInsert = extractInsert(output, "platforms");
    const jsonMatch = platformsInsert.match(/\(2,'cq9','((?:[^'\\]|\\.)*)'\)/);
    expect(jsonMatch).not.toBeNull();
    const decoded = jsonMatch![1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const parsed = JSON.parse(decoded);

    expect(parsed.url).toBe(STUB_BASE_URL);
    expect(parsed.secret_key).not.toBe("plat_secret_ABC123");
    expect(parsed.note).toBe("keep");
    expect(Array.isArray(parsed.tokens)).toBe(true);
    expect(parsed.tokens).not.toContain("TOK1");
    expect(parsed.tokens).not.toContain("TOK2");

    const paymentsInsert = extractInsert(output, "payments");
    const paymentsJsonMatch = paymentsInsert.match(/'((?:[^'\\]|\\.)*)'\)/);
    expect(paymentsJsonMatch).not.toBeNull();
    const paymentsDecoded = paymentsJsonMatch![1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const paymentsParsed = JSON.parse(paymentsDecoded);
    expect(paymentsParsed.merchant).not.toBe("real_merchant_007");
    expect(paymentsParsed.mobile).not.toBe("real_mobile_998");
    expect(paymentsParsed.note).toBe("keep");
  });

  it("payments.api_url 換成 stub 位址", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const paymentsInsert = extractInsert(output, "payments");
    expect(paymentsInsert).not.toContain("real-gateway.example");
    expect(paymentsInsert).toContain(STUB_BASE_URL);
  });

  it("純回應／紀錄用的 blob 欄位一律清成 NULL：commission_withdraws", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const insert = extractInsert(output, "commission_withdraws");
    expect(insert).not.toContain("real bank account info");
    expect(insert).not.toContain("real gateway response");
    expect(insert).not.toContain("real error dump with stack trace");
    expect(insert).not.toContain("real fee schedule");
    expect(insert).toContain("'CW0001',NULL,NULL,NULL,NULL)");
  });

  it("純回應／紀錄用的 blob 欄位一律清成 NULL：payment_history_records／payment_deposit_options／payment_withdrawal_options／service_issues", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    expect(extractInsert(output, "payment_history_records")).not.toContain("real payment gateway response body");
    expect(extractInsert(output, "payment_deposit_options")).not.toContain("real fee schedule");
    expect(extractInsert(output, "payment_withdrawal_options")).not.toContain("real fee schedule");
    const serviceIssuesInsert = extractInsert(output, "service_issues");
    expect(serviceIssuesInsert).not.toContain("real free-text summary");
    expect(serviceIssuesInsert).not.toContain("real free-text reply");
    expect(serviceIssuesInsert).toContain("'withdrawal',NULL,NULL)");
  });

  it("NULL 值維持 NULL，不會被當成字串遮罩", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const platformsInsert = extractInsert(output, "platforms");
    const bankCardsInsert = extractInsert(output, "site_bank_cards");
    expect(platformsInsert).toContain("(1,'main',NULL)");
    expect(bankCardsInsert).toContain("(2,'國泰世華',NULL,NULL)");
  });

  it("加密錢包地址被遮罩", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    expect(output).not.toContain("0xDEADBEEF00000000000000000000000000BEEF");
    expect(output).toContain("synthetic_wallet_");
  });

  it("betting_logs.raw_data 被清成 NULL，其他欄位（no）不受影響", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const bettingInsert = extractInsert(output, "betting_logs");
    expect(bettingInsert).not.toContain("sensitive dump");
    expect(bettingInsert).toContain("'BET0001',NULL)");
    expect(bettingInsert).toContain("'BET0002',NULL)");
  });

  it("整表清空的表（sessions／password_reset_tokens／chat_room_messages）在輸出裡完全沒有 INSERT，即使原始語句表名沒加反引號", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    expect(extractStatementsFor(output, "sessions")).toHaveLength(0);
    expect(extractStatementsFor(output, "password_reset_tokens")).toHaveLength(0);
    expect(extractStatementsFor(output, "chat_room_messages")).toHaveLength(0);
    expect(output).not.toContain("serialized-session-data-with-secrets");
    expect(output).not.toContain("reset-token-value");
    expect(output).not.toContain("real.example");
  });

  it("輸出剝除 dump 自帶的 DROP TABLE／CREATE TABLE，但其他非 INSERT 陳述式（LOCK/UNLOCK/SET/註解）保留", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    // 用陳述式層級的正則檢查（而不是整份文字找子字串），因為 service_issue_categories
    // 那筆測試資料故意把 "CREATE TABLE" 這幾個字放進一個資料值裡（SEKRIT11 regression
    // 測試用），那個字串值本身應該保留，不代表輸出裡還有真的 DDL 陳述式。
    expect(output).not.toMatch(/(?:^|;)\s*CREATE TABLE\b/);
    expect(output).not.toMatch(/(?:^|;)\s*DROP TABLE\b/);
    expect(output).toContain("LOCK TABLES `stations` WRITE;");
    expect(output).toContain("UNLOCK TABLES;");
    expect(output).toContain("/*!40000 ALTER TABLE `stations` DISABLE KEYS */;");
    expect(output).toContain("/*!40101 SET NAMES utf8mb4 */;");
  });

  it("每句 INSERT 輸出時都帶明確欄位列表，即使原本沒有（靠 CREATE TABLE 補上）", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const stationsInsert = extractInsert(output, "stations");
    expect(stationsInsert).toContain("(`id`, `code`, `name`, `secret_key`) VALUES");
  });

  it("完全沒有規則的控制組資料表（currencies）的值不受影響（只有欄位列表格式被正規化）", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const currenciesInsert = extractInsert(output, "currencies");
    expect(currenciesInsert).toContain("TWD (完全不受任何遮罩規則影響)");
  });

  it("SEKRIT11 regression：CREATE_TABLE_RE 錨定陳述式開頭，資料值裡出現的 'CREATE TABLE' 文字不會被誤判成真的 DDL、蓋掉 schema 欄位順序", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const stationsInsert = extractInsert(output, "stations");
    // 如果 CREATE_TABLE_RE 沒錨定，注入的假 DDL 會把 stations 的欄位順序改成
    // ['id','code','name','totally_not_secret_key']，secret_key 的值就會因為
    // 「查無 totally_not_secret_key 規則」而原樣外洩。
    expect(stationsInsert).not.toContain("sk_live_a1b2c3d4e5f6_REALLOOKING");
    expect(stationsInsert).toContain("synthetic_secret_key_");
    expect(stationsInsert).toContain("(`id`, `code`, `name`, `secret_key`) VALUES");
  });
});

describe("Issue #13：INSERT 表名的各種合法寫法都要能正確遮罩（不只認反引號）", () => {
  const createStations =
    "CREATE TABLE `stations` (`id` int, `code` varchar(255), `name` varchar(255), `secret_key` varchar(255)) ENGINE=InnoDB;\n";

  it("表名完全不加引號：INSERT INTO stations ...", () => {
    const sql = `${createStations}INSERT INTO stations VALUES (1,'DEMO_STATION','name','sk_live_unquoted_table_name');\n`;
    const output = maskMysqlDump(sql);
    expect(output).not.toContain("sk_live_unquoted_table_name");
    expect(output).toContain("synthetic_secret_key_");
  });

  it("`db`.`table` 限定名：INSERT INTO `hub`.`stations` ...", () => {
    const sql = `${createStations}INSERT INTO \`hub\`.\`stations\` VALUES (1,'DEMO_STATION','name','sk_live_qualified_table_name');\n`;
    const output = maskMysqlDump(sql);
    expect(output).not.toContain("sk_live_qualified_table_name");
    expect(output).toContain("synthetic_secret_key_");
  });

  it("ANSI 雙引號表名：INSERT INTO \"stations\" ...", () => {
    const sql = `${createStations}INSERT INTO "stations" VALUES (1,'DEMO_STATION','name','sk_live_ansi_quoted_table_name');\n`;
    const output = maskMysqlDump(sql);
    expect(output).not.toContain("sk_live_ansi_quoted_table_name");
    expect(output).toContain("synthetic_secret_key_");
  });

  it("INSERT LOW_PRIORITY/DELAYED/HIGH_PRIORITY INTO 修飾詞", () => {
    const sql = `${createStations}INSERT LOW_PRIORITY INTO stations VALUES (1,'DEMO_STATION','name','sk_live_low_priority_variant');\n`;
    const output = maskMysqlDump(sql);
    expect(output).not.toContain("sk_live_low_priority_variant");
    expect(output).toContain("synthetic_secret_key_");
  });

  it("整表清空的表，表名不加引號也能被清空：INSERT INTO sessions ...", () => {
    const sql =
      "CREATE TABLE `sessions` (`id` varchar(255), `payload` longtext) ENGINE=InnoDB;\n" +
      "INSERT INTO sessions VALUES ('abc','secret-payload');\n";
    const output = maskMysqlDump(sql);
    expect(output).not.toContain("secret-payload");
    expect(extractStatementsFor(output, "sessions")).toHaveLength(0);
  });
});

describe("Issue #13：maskMysqlDump 安全防呆（一律 throw，不猜測）", () => {
  it("陳述式以 INSERT/REPLACE 開頭卻解析不出表頭時 throw", () => {
    const sql = "INSERT GARBAGE HERE;\n";
    expect(() => maskMysqlDump(sql)).toThrow(/解析不出/);
  });

  it("需要遮罩的表沒有欄位列表、dump 裡也沒有對應的 CREATE TABLE 時 throw", () => {
    const sql = "INSERT INTO `stations` VALUES (1,'DEMO_STATION','name','sk_live_x');\n";
    expect(() => maskMysqlDump(sql)).toThrow(/CREATE TABLE/);
  });

  it("一筆 row 的值數量與欄位數量不符時 throw", () => {
    const sql = `CREATE TABLE \`stations\` (\`id\` int, \`code\` varchar(255), \`name\` varchar(255), \`secret_key\` varchar(255)) ENGINE=InnoDB;
INSERT INTO \`stations\` (\`id\`,\`code\`,\`name\`,\`secret_key\`) VALUES (1,'DEMO_STATION','name');
`;
    expect(() => maskMysqlDump(sql)).toThrow(/數量/);
  });

  it("該遮罩的欄位值不是字串字面值也不是 NULL（例如 0x... 十六進位常值）時 throw", () => {
    const sql = `CREATE TABLE \`stations\` (\`id\` int, \`code\` varchar(255), \`name\` varchar(255), \`secret_key\` varchar(255)) ENGINE=InnoDB;
INSERT INTO \`stations\` (\`id\`,\`code\`,\`name\`,\`secret_key\`) VALUES (1,'DEMO_STATION','name',0x73656372657429);
`;
    expect(() => maskMysqlDump(sql)).toThrow(/不是字串字面值/);
  });

  it("mask_json 欄位內容不是合法 JSON 時 throw", () => {
    const sql = `CREATE TABLE \`platforms\` (\`id\` int, \`api_settings\` text) ENGINE=InnoDB;
INSERT INTO \`platforms\` (\`id\`,\`api_settings\`) VALUES (1,'not-json-at-all');
`;
    expect(() => maskMysqlDump(sql)).toThrow(/不是合法 JSON/);
  });
});
