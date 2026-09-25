import "./testEnv";
import { describe, expect, it } from "bun:test";
import { maskMysqlDump } from "../../src/seed/sqlDumpMasker";
import { maskValue } from "../../src/seed/maskValue";
import { STUB_BASE_URL } from "../../src/seed/jsonValueMasker";

/**
 * Issue #13：自己合成一份「看起來像真的」測試站快照（mysqldump 格式），
 * 用來驅動遮罩腳本的測試。真實快照尚未提供，不讀取、不搜尋任何實際 dump。
 *
 * 刻意涵蓋 code review 要求補的每一種情境：INSERT 不帶欄位列表（要靠 CREATE
 * TABLE 補欄位順序）、`REPLACE INTO`/`INSERT IGNORE INTO`、`''` 跳脫、
 * email／密碼／token／IP／JSON／加密錢包地址、players.account 的推導關係、
 * 整表清空、跨表重複值的關聯一致性、沒有任何規則的控制組資料表。
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
CREATE TABLE \`players\` (\`id\` int NOT NULL, \`station_id\` int, \`platform_id\` int, \`user_id\` int, \`account\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`players\` WRITE;
INSERT INTO \`players\` VALUES (10,1,42,5,'real_player_acc99DEMO_STATIONp42');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`platforms\`;
CREATE TABLE \`platforms\` (\`id\` int NOT NULL, \`name\` varchar(255), \`api_settings\` text) ENGINE=InnoDB;

LOCK TABLES \`platforms\` WRITE;
INSERT INTO \`platforms\` (\`id\`,\`name\`,\`api_settings\`) VALUES (1,'main',NULL),(2,'cq9','{\\"url\\":\\"https://real-provider.example:9443/api\\",\\"secret_key\\":\\"plat_secret_ABC123\\",\\"note\\":\\"keep\\"}');
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
INSERT INTO \`sessions\` (\`id\`,\`payload\`) VALUES ('abc123','serialized-session-data-with-secrets');
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
`;
}

function extractInsert(output: string, table: string): string {
  const match = output.match(new RegExp("INSERT[^;]*INTO `" + table + "`[\\s\\S]*?;"));
  if (!match) throw new Error(`output 裡找不到表 ${table} 的 INSERT`);
  return match[0];
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

  it("REPLACE INTO 與 INSERT IGNORE INTO 也會被遮罩，不会因为语句关键字不同而漏遮", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    expect(output).not.toContain("sk_live_replace_variant_secret");
    expect(output).not.toContain("sk_live_ignore_variant_secret");
  });

  it("重複單引號跳脫（'a''b'）不會解析錯，也不會破壞後面欄位的值", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const administersInsert = extractInsert(output, "administers");
    // O'Brien 本身不是遮罩欄位以外的值，但要確認它被正確吃掉一整個字串常值，
    // 沒有把後面的 email/password/token 欄位串壞。
    expect(administersInsert).not.toContain("c3@realdomain.example");
    expect(administersInsert).toContain("@example.test");
    // 第二筆 admin row 的 email 遮罩值必須跟第一筆不同（原始值不同）。
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
    expect(hashes[0]).toBe(hashes[1]); // 兩筆都被換成同一個固定雜湊
  });

  it("administers.remember_token／last_login_token／last_login_ip 一律清成 NULL", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const administersInsert = extractInsert(output, "administers");
    expect(administersInsert).not.toContain("remember_me_real_token_abc");
    expect(administersInsert).not.toContain("last_login_real_token_xyz");
    expect(administersInsert).not.toContain("203.0.113.42");
    // 第一筆原本三個欄位都有值，遮罩後應該變成 NULL,NULL,NULL 收尾（password 之後）。
    expect(administersInsert).toMatch(/NULL,NULL,NULL\)/);
  });

  it("同一個帳號字串出現在不同表（administers.account 與 users.account）時，遮罩後映射到同一個合成值", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const administersInsert = extractInsert(output, "administers");
    const usersInsert = extractInsert(output, "users");

    const adminAccountMatch = administersInsert.match(/\(1,'[^']*','([^']+)'/);
    const userAccountMatch = usersInsert.match(/\(1,1,'([^']+)'\)/);

    expect(adminAccountMatch).not.toBeNull();
    expect(userAccountMatch).not.toBeNull();
    expect(adminAccountMatch![1]).toBe(userAccountMatch![1]);
  });

  it("players.account 遮罩後仍保留「使用者帳號 + 站台代碼 + p + 平台 id」的推導關係", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const playersInsert = extractInsert(output, "players");

    expect(playersInsert).not.toContain("real_player_acc99DEMO_STATIONp42");
    // 站台代碼與平台 id 不是敏感資料，維持明文，才能驗證推導關係還在。
    expect(playersInsert).toContain("DEMO_STATIONp42");

    const expectedPrefix = maskValue("account", "real_player_acc99");
    expect(playersInsert).toContain(`${expectedPrefix}DEMO_STATIONp42`);
  });

  it("JSON 欄位：鍵名符合 key/secret/token/password/sign 的字串值被遮罩，URL 被換成 stub，其餘鍵原樣保留", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const platformsInsert = extractInsert(output, "platforms");
    const jsonMatch = platformsInsert.match(/\(2,'cq9','((?:[^'\\]|\\.)*)'\)/);
    expect(jsonMatch).not.toBeNull();

    const decoded = jsonMatch![1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const parsed = JSON.parse(decoded);

    expect(parsed.url).toBe(STUB_BASE_URL);
    expect(parsed.secret_key).not.toBe("plat_secret_ABC123");
    expect(parsed.note).toBe("keep");
  });

  it("NULL 值維持 NULL，不會被當成字串遮罩（含 JSON 欄位）", () => {
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
    expect(bettingInsert).toContain("(1,'BET0001',NULL)");
    expect(bettingInsert).toContain("(2,'BET0002',NULL)");
  });

  it("整表清空的表（sessions／password_reset_tokens／chat_room_messages）在輸出裡完全沒有 INSERT", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    expect(output).not.toMatch(/INSERT[^;]*INTO `sessions`/);
    expect(output).not.toMatch(/INSERT[^;]*INTO `password_reset_tokens`/);
    expect(output).not.toMatch(/INSERT[^;]*INTO `chat_room_messages`/);
    expect(output).not.toContain("serialized-session-data-with-secrets");
    expect(output).not.toContain("reset-token-value");
    expect(output).not.toContain("real.example");
  });

  it("完全沒有規則的控制組資料表（currencies）與其他非 INSERT 陳述式逐字元不變", () => {
    const sql = buildSampleSnapshot();
    const output = maskMysqlDump(sql);
    expect(extractInsert(output, "currencies")).toBe(extractInsert(sql, "currencies"));
    expect(output).toContain("DROP TABLE IF EXISTS `stations`;");
    expect(output).toContain("LOCK TABLES `stations` WRITE;");
    expect(output).toContain("/*!40000 ALTER TABLE `stations` DISABLE KEYS */;");
    expect(output).toContain("/*!40101 SET NAMES utf8mb4 */;");
  });
});

describe("Issue #13：maskMysqlDump 安全防呆（一律 throw，不猜測）", () => {
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

  it("players.account 找不到對應 station_id 的 stations.code 時 throw", () => {
    const sql = `CREATE TABLE \`players\` (\`id\` int, \`station_id\` int, \`platform_id\` int, \`account\` varchar(255)) ENGINE=InnoDB;
INSERT INTO \`players\` (\`id\`,\`station_id\`,\`platform_id\`,\`account\`) VALUES (1,999,1,'someaccountDEMO_STATIONp1');
`;
    expect(() => maskMysqlDump(sql)).toThrow(/找不到 station_id=999/);
  });

  it("players.account 不符合「帳號 + 站台代碼 + p + 平台 id」的推導格式時 throw", () => {
    const sql = `CREATE TABLE \`stations\` (\`id\` int, \`code\` varchar(255)) ENGINE=InnoDB;
INSERT INTO \`stations\` (\`id\`,\`code\`) VALUES (1,'DEMO_STATION');
CREATE TABLE \`players\` (\`id\` int, \`station_id\` int, \`platform_id\` int, \`account\` varchar(255)) ENGINE=InnoDB;
INSERT INTO \`players\` (\`id\`,\`station_id\`,\`platform_id\`,\`account\`) VALUES (1,1,1,'totally_unexpected_format');
`;
    expect(() => maskMysqlDump(sql)).toThrow(/不符合預期的推導格式/);
  });

  it("mask_json 欄位內容不是合法 JSON 時 throw", () => {
    const sql = `CREATE TABLE \`platforms\` (\`id\` int, \`api_settings\` text) ENGINE=InnoDB;
INSERT INTO \`platforms\` (\`id\`,\`api_settings\`) VALUES (1,'not-json-at-all');
`;
    expect(() => maskMysqlDump(sql)).toThrow(/不是合法 JSON/);
  });
});
