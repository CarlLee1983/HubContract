import "./testEnv";
import { describe, expect, it } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { maskSnapshotFile } from "../../src/seed/maskSnapshot";
import { RUNS_AGAINST_RECORDING_ENV } from "../helpers/integrationGate";

/**
 * Issue #13（第三輪 code review 決議）：解析交給真正的 MariaDB，這裡的測試就是
 * 「起一個真的資料庫、餵一份刻意踩過三輪 review 抓到的所有形態的快照、驗證
 * 遮罩結果」的整合測試——需要 docker，依 Issue #12 的慣例只在
 * `HUB_CONTRACT_INTEGRATION=1` 時執行，CI／離線環境自動 skip。
 *
 * 時間戳記全部用字面值、不用 `NOW()`：`NOW()` 每次執行結果都不同，會讓
 * 「決定性」測試看起來像失敗，但那是 fixture 本身的問題，不是遮罩腳本的。
 */
const SAMPLE_SQL = `
CREATE TABLE \`stations\` (\`id\` int NOT NULL PRIMARY KEY, \`code\` varchar(255), \`name\` varchar(255), \`secret_key\` varchar(255), \`callback_domain\` varchar(255));
CREATE TABLE \`administers\` (\`id\` int NOT NULL PRIMARY KEY, \`name\` varchar(255), \`account\` varchar(255), \`email\` varchar(255), \`password\` varchar(255));
CREATE TABLE \`users\` (\`id\` int NOT NULL PRIMARY KEY, \`station_id\` int, \`account\` varchar(255));
CREATE TABLE \`players\` (\`id\` int NOT NULL PRIMARY KEY, \`station_id\` int, \`platform_id\` int, \`user_id\` int, \`account\` varchar(255), \`vendor_player_id\` varchar(255));
CREATE TABLE \`platforms\` (\`id\` int NOT NULL PRIMARY KEY, \`name\` varchar(255), \`api_settings\` text);
CREATE TABLE \`withdrawal_records\` (\`id\` int NOT NULL PRIMARY KEY, \`trade_no\` varchar(255), \`note\` varchar(255));
CREATE TABLE \`settings\` (\`id\` int NOT NULL PRIMARY KEY, \`name\` varchar(255), \`val\` text, \`group\` varchar(255) NOT NULL DEFAULT 'default');
CREATE TABLE \`sessions\` (\`id\` varchar(255) NOT NULL PRIMARY KEY, \`payload\` longtext);
CREATE TABLE \`currencies\` (\`id\` int NOT NULL PRIMARY KEY, \`name\` varchar(255));

# 這是井字號註解（舊版自己寫的 parser 認不得，交給真的 MariaDB 就不是問題）。
INSERT INTO \`stations\` (\`id\`,\`code\`,\`name\`,\`secret_key\`,\`callback_domain\`) VALUES (1,'DEMO_STATION','合成測試站台','sk_live_REAL_SECRET_should_not_leak','http://real-callback.example');

-- ON DUPLICATE KEY UPDATE（舊版 parser 認不得欄位列表在 UPDATE 子句裡重複出現）。
INSERT INTO \`stations\` (\`id\`,\`code\`,\`name\`,\`secret_key\`,\`callback_domain\`) VALUES (1,'DEMO_STATION','合成測試站台','sk_live_REAL_SECRET_should_not_leak','http://real-callback.example')
  ON DUPLICATE KEY UPDATE \`secret_key\` = VALUES(\`secret_key\`);

INSERT INTO \`administers\` (\`id\`,\`name\`,\`account\`,\`email\`,\`password\`) VALUES (1,'王小明','real_admin_account','real_admin@realdomain.example','$2y$10$RealBcryptHashShouldBeOverwritten1234567890abcdefg');

INSERT INTO \`users\` (\`id\`,\`station_id\`,\`account\`) VALUES (1,1,'real_user_account_001');

INSERT INTO \`players\` (\`id\`,\`station_id\`,\`platform_id\`,\`user_id\`,\`account\`,\`vendor_player_id\`) VALUES
(1,1,42,1,'real_user_account_001DEMO_STATIONp42','real_vendor_player_id_001'),
(2,1,1,1,'real_user_account_001','real_vendor_player_id_002');

INSERT INTO \`platforms\` (\`id\`,\`name\`,\`api_settings\`) VALUES (1,'cq9','{"url":"https://real-provider.example/api","secret_key":"real_platform_secret","tokens":["REAL_TOK_1","REAL_TOK_2"]}');

INSERT INTO \`withdrawal_records\` (\`id\`,\`trade_no\`,\`note\`) VALUES (1,'TRADE_WD_001','real free-text withdrawal note written by a user');

INSERT INTO \`settings\` (\`id\`,\`name\`,\`val\`) VALUES (1,'site_google_recaptcha','{"server_token":"real_recaptcha_server_token"}'),(2,'site_contact','{"email":"real_contact@realdomain.example","tel":"real_contact_tel_0912345678"}');

INSERT INTO \`sessions\` (\`id\`,\`payload\`) VALUES ('sess_abc123','real-serialized-session-payload-with-secrets');

INSERT INTO \`currencies\` (\`id\`,\`name\`) VALUES (1,'TWD (完全不受任何遮罩規則影響)');
`;

/** fixture 裡種下的所有敏感原始字串——遮罩後的輸出裡一個都不該再出現。 */
const SEEDED_SENSITIVE_STRINGS = [
  "sk_live_REAL_SECRET_should_not_leak",
  "real_admin_account",
  "real_admin@realdomain.example",
  "RealBcryptHashShouldBeOverwritten",
  "real_user_account_001", // 同時出現在 users.account 與 players.account（推導/一般兩種格式）
  "real_vendor_player_id_001",
  "real_vendor_player_id_002",
  "real-provider.example",
  "real_platform_secret",
  "REAL_TOK_1",
  "REAL_TOK_2",
  "real free-text withdrawal note written by a user",
  "real_recaptcha_server_token",
  "real_contact@realdomain.example",
  "real_contact_tel_0912345678",
  "real-serialized-session-payload-with-secrets",
];

async function writeTempSql(content: string): Promise<string> {
  const p = path.join(os.tmpdir(), `hubcontract-mask-snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  await fs.writeFile(p, content, "utf-8");
  return p;
}

describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("Issue #13：maskSnapshotFile（起拋棄式 MariaDB 容器整合測試）", () => {
  it(
    "載入 -> 遮罩 -> 匯出：fixture 裡種下的所有敏感原始字串都不再出現在輸出裡",
    async () => {
      const inPath = await writeTempSql(SAMPLE_SQL);
      const outPath = path.join(os.tmpdir(), `hubcontract-mask-out-${Date.now()}.sql`);

      try {
        const maskedBytes = await maskSnapshotFile({ inputPath: inPath, outputPath: outPath });
        const output = maskedBytes.toString("utf-8");

        for (const secret of SEEDED_SENSITIVE_STRINGS) {
          expect(output).not.toContain(secret);
        }

        // 整表清空：sessions 完全沒有 INSERT。
        expect(output).not.toMatch(/INSERT[^;]*INTO `sessions`/i);

        // 沒有規則的控制組資料表原樣保留。
        expect(output).toContain("TWD (完全不受任何遮罩規則影響)");

        // players.account 的推導關係：站台代碼＋平台 id 這段不是敏感資料，維持明文。
        expect(output).toContain("DEMO_STATIONp42");

        // stations.callback_domain 沒有分類成遮罩／清空／固定值以外的動作時，
        // 應該原樣保留（見 README「不遮罩的欄位」的查證依據）。
        expect(output).toContain("http://real-callback.example");
      } finally {
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath).catch(() => {});
      }
    },
    60000
  );

  it(
    "同一份快照、同一把 MASK_HMAC_KEY，重跑兩次輸出逐位元組相同（決定性）",
    async () => {
      const inPath = await writeTempSql(SAMPLE_SQL);
      const outPath1 = path.join(os.tmpdir(), `hubcontract-mask-det-1-${Date.now()}.sql`);
      const outPath2 = path.join(os.tmpdir(), `hubcontract-mask-det-2-${Date.now()}.sql`);

      try {
        const first = await maskSnapshotFile({ inputPath: inPath, outputPath: outPath1 });
        const second = await maskSnapshotFile({ inputPath: inPath, outputPath: outPath2 });
        expect(Buffer.compare(first, second)).toBe(0);
      } finally {
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath1).catch(() => {});
        await fs.unlink(outPath2).catch(() => {});
      }
    },
    120000
  );

  it(
    "支援 .sql.gz 輸入輸出",
    async () => {
      const rawPath = await writeTempSql(SAMPLE_SQL);
      const raw = await fs.readFile(rawPath);
      const inPath = path.join(os.tmpdir(), `hubcontract-mask-gz-in-${Date.now()}.sql.gz`);
      const outPath = path.join(os.tmpdir(), `hubcontract-mask-gz-out-${Date.now()}.sql.gz`);
      await fs.writeFile(inPath, Bun.gzipSync(new Uint8Array(raw)));

      try {
        await maskSnapshotFile({ inputPath: inPath, outputPath: outPath });
        const outputGz = await fs.readFile(outPath);
        const output = Buffer.from(Bun.gunzipSync(new Uint8Array(outputGz))).toString("utf-8");
        expect(output).not.toContain("sk_live_REAL_SECRET_should_not_leak");
      } finally {
        await fs.unlink(rawPath).catch(() => {});
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath).catch(() => {});
      }
    },
    60000
  );

  it(
    "資料庫裡有未分類的表/欄位時，遮罩前就 throw，不會遮罩到一半才失敗",
    async () => {
      const inPath = await writeTempSql(
        "CREATE TABLE `totally_unknown_table` (`id` int PRIMARY KEY, `mystery` varchar(255));\n" +
          "INSERT INTO `totally_unknown_table` (`id`,`mystery`) VALUES (1,'x');\n"
      );
      const outPath = path.join(os.tmpdir(), `hubcontract-mask-unclassified-${Date.now()}.sql`);

      try {
        await expect(maskSnapshotFile({ inputPath: inPath, outputPath: outPath })).rejects.toThrow(
          /未分類的表.*totally_unknown_table/s
        );
      } finally {
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath).catch(() => {});
      }
    },
    60000
  );
});
