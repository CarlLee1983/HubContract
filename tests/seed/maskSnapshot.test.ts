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

  it(
    "第四輪 code review regression：快照帶 trigger 時直接 throw，不會讓遮罩用的 UPDATE 觸發它把原始值寫進別的表外洩",
    async () => {
      const inPath = await writeTempSql(
        "CREATE TABLE `currencies` (`id` int PRIMARY KEY, `name` varchar(255));\n" +
          "CREATE TABLE `players` (`id` int PRIMARY KEY, `station_id` int, `platform_id` int, `user_id` int, `account` varchar(255));\n" +
          "INSERT INTO `players` (`id`,`station_id`,`platform_id`,`user_id`,`account`) VALUES (1,1,1,1,'REAL_ACCOUNT_LEAK_VIA_TRIGGER');\n" +
          "CREATE TRIGGER t AFTER UPDATE ON players FOR EACH ROW INSERT INTO currencies VALUES (NEW.id+100, OLD.account);\n"
      );
      const outPath = path.join(os.tmpdir(), `hubcontract-mask-trigger-${Date.now()}.sql`);

      try {
        await expect(maskSnapshotFile({ inputPath: inPath, outputPath: outPath })).rejects.toThrow(
          /使用者定義的資料庫物件.*trigger `t`/s
        );
      } finally {
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath).catch(() => {});
      }
    },
    60000
  );

  it(
    "第四輪 code review regression：快照帶 CREATE DATABASE/USE 切到別的 schema 時直接 throw，不會默默產出空種子",
    async () => {
      const inPath = await writeTempSql(
        "CREATE DATABASE realdb;\nUSE realdb;\n" +
          "CREATE TABLE `currencies` (`id` int PRIMARY KEY, `name` varchar(255));\n" +
          "INSERT INTO `currencies` (`id`,`name`) VALUES (1,'REAL_DATA_IN_WRONG_SCHEMA');\n"
      );
      const outPath = path.join(os.tmpdir(), `hubcontract-mask-otherdb-${Date.now()}.sql`);

      try {
        await expect(maskSnapshotFile({ inputPath: inPath, outputPath: outPath })).rejects.toThrow(
          /非預期的資料庫.*realdb/s
        );
      } finally {
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath).catch(() => {});
      }
    },
    60000
  );

  it(
    "第四輪 code review regression：migrations 整表清空，凍結 schema 自帶的 migrations 資料列不會跟遮罩後的種子衝突",
    async () => {
      // 模擬 seeds/mysql-schema.sql 本身就帶一批 migrations 資料列的情況：
      // 快照如果也帶了自己的 migrations 資料列，遮罩後的輸出必須是空的（整表
      // 清空），這樣 env-reset.sh 依序載入「凍結 schema（含 migrations 資料）
      // -> 遮罩後的快照」才不會撞主鍵重複。
      const inPath = await writeTempSql(
        "CREATE TABLE `migrations` (`id` int PRIMARY KEY, `migration` varchar(255), `batch` int);\n" +
          "INSERT INTO `migrations` (`id`,`migration`,`batch`) VALUES (1,'2024_01_01_000000_create_x_table',1),(2,'2024_01_02_000000_create_y_table',1);\n"
      );
      const outPath = path.join(os.tmpdir(), `hubcontract-mask-migrations-${Date.now()}.sql`);

      try {
        const maskedBytes = await maskSnapshotFile({ inputPath: inPath, outputPath: outPath });
        const output = maskedBytes.toString("utf-8");
        expect(output).not.toMatch(/INSERT[^;]*INTO `migrations`/i);
      } finally {
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath).catch(() => {});
      }
    },
    60000
  );

  it(
    "第五輪 code review regression：主鍵超出 JS number 安全整數範圍時，UPDATE 仍能命中正確的那一列（不會悄悄變成 no-op）",
    async () => {
      // 9007199254740993 = Number.MAX_SAFE_INTEGER + 2，剛好會被 JS number 捨入
      // 成 9007199254740992（少 1），如果連線沒開 supportBigNumbers/
      // bigNumberStrings，`WHERE id = ?` 會配不到任何一列。
      const inPath = await writeTempSql(
        "CREATE TABLE `users` (`id` bigint unsigned PRIMARY KEY, `account` varchar(255));\n" +
          "INSERT INTO `users` (`id`,`account`) VALUES (9007199254740993,'REAL_LEAK_BIGINT_PRECISION');\n"
      );
      const outPath = path.join(os.tmpdir(), `hubcontract-mask-bigint-${Date.now()}.sql`);

      try {
        const maskedBytes = await maskSnapshotFile({ inputPath: inPath, outputPath: outPath });
        const output = maskedBytes.toString("utf-8");
        expect(output).not.toContain("REAL_LEAK_BIGINT_PRECISION");
        expect(output).toContain("9007199254740993");
      } finally {
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath).catch(() => {});
      }
    },
    60000
  );

  it(
    "第五輪 code review regression：ON UPDATE CURRENT_TIMESTAMP 欄位在遮罩時維持原值，不會被 UPDATE 自動改成現在時間",
    async () => {
      const inPath = await writeTempSql(
        "CREATE TABLE `users` (`id` int PRIMARY KEY, `account` varchar(255), " +
          "`updated_at` timestamp NOT NULL DEFAULT '2020-01-01 00:00:00' ON UPDATE CURRENT_TIMESTAMP);\n" +
          "INSERT INTO `users` (`id`,`account`,`updated_at`) VALUES (1,'real_account_should_be_masked','2020-01-01 00:00:00');\n"
      );
      const outPath = path.join(os.tmpdir(), `hubcontract-mask-onupdate-${Date.now()}.sql`);

      try {
        const maskedBytes = await maskSnapshotFile({ inputPath: inPath, outputPath: outPath });
        const output = maskedBytes.toString("utf-8");
        expect(output).not.toContain("real_account_should_be_masked"); // users.account 還是照樣被遮
        expect(output).toContain("2020-01-01 00:00:00"); // 但 updated_at 沒有被 UPDATE 悄悄改掉
      } finally {
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath).catch(() => {});
      }
    },
    60000
  );
});
