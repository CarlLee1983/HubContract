import { describe, expect, it } from "bun:test";
import { maskMysqlDump } from "../../src/seed/sqlDumpMasker";

/**
 * Issue #13：自己合成一份「看起來像真的」測試站快照（mysqldump 格式），
 * 用來驅動遮罩腳本的測試。真實快照尚未提供，不讀取、不搜尋任何實際 dump。
 *
 * 刻意包含：跨表重複出現的帳號/姓名/手機（驗證遮罩後仍保持關聯）、
 * NULL 值、跳脫字元、沒有任何遮罩欄位的控制組資料表（`platforms`）。
 */
function buildSampleSnapshot(): string {
  return `-- MySQL dump 10.13  Distrib 8.0.34, for synthetic-fixture (Issue #13)
--
-- Host: 127.0.0.1    Database: stationhub_test_snapshot
-- ------------------------------------------------------
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET TIME_ZONE='+00:00' */;

DROP TABLE IF EXISTS \`stations\`;
CREATE TABLE \`stations\` (\`id\` int NOT NULL, \`name\` varchar(255), \`secret_key\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`stations\` WRITE;
INSERT INTO \`stations\` (\`id\`,\`name\`,\`secret_key\`) VALUES (1,'合成測試站台','sk_live_a1b2c3d4e5f6_REALLOOKING'),(2,'第二站','sk_live_z9y8x7w6v5u4_ANOTHERKEY');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`administers\`;
CREATE TABLE \`administers\` (\`id\` int NOT NULL, \`name\` varchar(255), \`account\` varchar(255), \`email\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`administers\` WRITE;
INSERT INTO \`administers\` (\`id\`,\`name\`,\`account\`,\`email\`) VALUES (1,'王小明','carladmin01','carladmin01@realdomain.example'),(2,'林淑芬','carladmin02','carladmin02@realdomain.example');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`users\`;
CREATE TABLE \`users\` (\`id\` int NOT NULL, \`station_id\` int, \`account\` varchar(255), \`created_at\` timestamp) ENGINE=InnoDB;

LOCK TABLES \`users\` WRITE;
INSERT INTO \`users\` (\`id\`,\`station_id\`,\`account\`,\`created_at\`) VALUES (1,1,'carladmin01',NOW()),(2,1,'real_player_9527',NOW());
UNLOCK TABLES;

DROP TABLE IF EXISTS \`sms_logs\`;
CREATE TABLE \`sms_logs\` (\`id\` int NOT NULL, \`phone\` varchar(20), \`content\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`sms_logs\` WRITE;
INSERT INTO \`sms_logs\` (\`id\`,\`phone\`,\`content\`) VALUES (1,'0912345678','您的驗證碼是 123456，請勿外流'),(2,'0912345678','重複發送給同一支手機');
UNLOCK TABLES;

DROP TABLE IF EXISTS \`site_bank_cards\`;
CREATE TABLE \`site_bank_cards\` (\`id\` int NOT NULL, \`name\` varchar(255), \`account\` varchar(255), \`account_name\` varchar(255)) ENGINE=InnoDB;

LOCK TABLES \`site_bank_cards\` WRITE;
INSERT INTO \`site_bank_cards\` (\`id\`,\`name\`,\`account\`,\`account_name\`) VALUES (1,'台灣銀行','1234567890123','王小明'),(2,'國泰世華',NULL,NULL);
UNLOCK TABLES;

DROP TABLE IF EXISTS \`platforms\`;
CREATE TABLE \`platforms\` (\`id\` int NOT NULL, \`name\` varchar(255), \`api_settings\` text) ENGINE=InnoDB;

LOCK TABLES \`platforms\` WRITE;
INSERT INTO \`platforms\` (\`id\`,\`name\`,\`api_settings\`) VALUES (1,'main',NULL),(2,'cq9','{\\"url\\":\\"http://real-provider.example:8081\\"}');
UNLOCK TABLES;
`;
}

describe("Issue #13：maskMysqlDump", () => {
  it("同一份輸入重跑，輸出逐位元組相同（決定性）", () => {
    const sql = buildSampleSnapshot();
    const first = maskMysqlDump(sql);
    const second = maskMysqlDump(sql);
    expect(second).toBe(first);
  });

  it("遮罩 stations.secret_key，且原始 secret_key 不再出現於輸出", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    expect(output).not.toContain("sk_live_a1b2c3d4e5f6_REALLOOKING");
    expect(output).not.toContain("sk_live_z9y8x7w6v5u4_ANOTHERKEY");
    expect(output).toContain("synthetic_secret_key_");
  });

  it("遮罩帳號欄位，且原始帳號不再出現於輸出", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    expect(output).not.toContain("carladmin01'");
    expect(output).not.toContain("carladmin02'");
    expect(output).not.toContain("real_player_9527");
  });

  it("同一個帳號出現在不同表（administers.account 與 users.account）時，遮罩後仍映射到同一個合成值", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const administersInsert = output.match(/INSERT INTO `administers`[\s\S]*?;/)![0];
    const usersInsert = output.match(/INSERT INTO `users`[\s\S]*?;/)![0];

    const adminAccountMatch = administersInsert.match(/\(1,'[^']*','([^']+)'/);
    const userAccountMatch = usersInsert.match(/\(1,1,'([^']+)'/);

    expect(adminAccountMatch).not.toBeNull();
    expect(userAccountMatch).not.toBeNull();
    expect(adminAccountMatch![1]).toBe(userAccountMatch![1]);
  });

  it("遮罩姓名欄位，且同一姓名跨表（administers.name 與 site_bank_cards.account_name）映射到同一合成值", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    expect(output).not.toContain("王小明");
    expect(output).not.toContain("林淑芬");

    const administersInsert = output.match(/INSERT INTO `administers`[\s\S]*?;/)![0];
    const bankCardsInsert = output.match(/INSERT INTO `site_bank_cards`[\s\S]*?;/)![0];

    const adminNameMatch = administersInsert.match(/\(1,'([^']+)'/);
    const bankCardNameMatch = bankCardsInsert.match(/\(1,'台灣銀行','[^']+','([^']+)'\)/);

    expect(adminNameMatch).not.toBeNull();
    expect(bankCardNameMatch).not.toBeNull();
    expect(adminNameMatch![1]).toBe(bankCardNameMatch![1]);
  });

  it("遮罩手機號碼，且同一支手機重複出現時映射到同一合成值", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    expect(output).not.toContain("0912345678");

    const smsInsert = output.match(/INSERT INTO `sms_logs`[\s\S]*?;/)![0];
    const phoneMatches = [...smsInsert.matchAll(/\(\d,'(09\d{8})'/g)].map((m) => m[1]);

    expect(phoneMatches).toHaveLength(2);
    expect(phoneMatches[0]).toBe(phoneMatches[1]);
  });

  it("NULL 值維持 NULL，不會被當成字串遮罩", () => {
    const output = maskMysqlDump(buildSampleSnapshot());
    const bankCardsInsert = output.match(/INSERT INTO `site_bank_cards`[\s\S]*?;/)![0];
    expect(bankCardsInsert).toContain("(2,'國泰世華',NULL,NULL)");
  });

  it("未列入遮罩設定的欄位與資料表原樣保留（含跳脫字元）", () => {
    const sql = buildSampleSnapshot();
    const output = maskMysqlDump(sql);

    // administers.email 不在遮罩範圍內（Issue #13 只涵蓋 secret_key/帳號/手機/姓名），刻意保留原值。
    expect(output).toContain("carladmin01@realdomain.example");

    // platforms 整張表都沒有遮罩欄位，INSERT 陳述式應逐字元不變（含跳脫的雙引號 JSON）。
    const originalPlatformsInsert = sql.match(/INSERT INTO `platforms`[\s\S]*?;/)![0];
    const maskedPlatformsInsert = output.match(/INSERT INTO `platforms`[\s\S]*?;/)![0];
    expect(maskedPlatformsInsert).toBe(originalPlatformsInsert);

    // site_bank_cards.name（銀行名稱，非遮罩欄位）保留原值。
    expect(output).toContain("台灣銀行");
    expect(output).toContain("國泰世華");
  });

  it("非 INSERT 陳述式（DROP/CREATE/LOCK/UNLOCK/註解）逐字元不變", () => {
    const sql = buildSampleSnapshot();
    const output = maskMysqlDump(sql);
    expect(output).toContain("DROP TABLE IF EXISTS `stations`;");
    expect(output).toContain("LOCK TABLES `stations` WRITE;");
    expect(output).toContain("UNLOCK TABLES;");
    expect(output).toContain("/*!40101 SET NAMES utf8mb4 */;");
  });
});
