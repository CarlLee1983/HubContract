import fs from "fs/promises";
import mysql from "mysql2/promise";
import { withDisposableMariaDb, loadSqlBytes, dumpDatabase } from "./dockerMariaDb";
import { maskDatabase } from "./maskDatabase";

/**
 * Issue #13：讀入測試站快照（`.sql` 或 `.sql.gz`），起一個拋棄式 MariaDB
 * 容器載入、在資料庫裡遮罩、`mysqldump` 匯出，寫出遮罩後的種子。
 *
 * 輸入/輸出是否為 gzip 各自依副檔名判斷，兩者可以不同（例如把 .sql.gz
 * 快照遮罩後輸出成未壓縮的 .sql，或反過來）。
 */
export interface MaskSnapshotOptions {
  inputPath: string;
  outputPath: string;
}

function isGzipPath(filePath: string): boolean {
  return filePath.endsWith(".gz");
}

async function readSnapshotBytes(filePath: string): Promise<Buffer> {
  const raw = await fs.readFile(filePath);
  return isGzipPath(filePath) ? Buffer.from(Bun.gunzipSync(new Uint8Array(raw))) : raw;
}

async function writeSnapshotBytes(filePath: string, bytes: Buffer): Promise<void> {
  const output = isGzipPath(filePath) ? Buffer.from(Bun.gzipSync(new Uint8Array(bytes))) : bytes;
  await fs.writeFile(filePath, output);
}

/**
 * 遮罩單一快照檔案，回傳遮罩後的 SQL 內容（呼叫端可再自行檢查）。
 *
 * 全程：讀檔（解壓縮）-> 起拋棄式 MariaDB 容器 -> 把原始 bytes 灌進去 -> 用
 * `information_schema` 做白名單完整性檢查 -> 逐表遮罩 -> `mysqldump` 匯出 ->
 * 寫檔（視副檔名決定要不要壓縮）-> 容器一定被清掉（見 `withDisposableMariaDb`）。
 */
export async function maskSnapshotFile(options: MaskSnapshotOptions): Promise<Buffer> {
  const inputBytes = await readSnapshotBytes(options.inputPath);

  const maskedBytes = await withDisposableMariaDb(async (db) => {
    await loadSqlBytes(db, inputBytes);

    // `loadSqlBytes` 把整份快照丟給 `mariadb` CLI 處理，這個連線只執行單一
    // 語句的 SELECT/UPDATE/TRUNCATE（見 maskDatabase.ts），不需要
    // `multipleStatements: true`——開著反而是不必要的攻擊面（第四輪 code
    // review 決議）。
    //
    // 用單一專屬連線、不走 pool（第五輪 code review 決議，見 maskDatabase.ts
    // 檔案開頭說明）：`SET SESSION sql_mode`/`FOREIGN_KEY_CHECKS` 這類連線層級
    // 設定才能保證整個遮罩過程都生效。
    //
    // `supportBigNumbers`/`bigNumberStrings`：主鍵是超出 JS number 安全整數
    // 範圍的 BIGINT（例如 9007199254740993）時，mysql2 預設會把它捨入成一個
    // 相近但不同的數字，讀出來再用 `WHERE id = ?` 寫回去會配不到正確的那一列
    // ——已用探針證實：UPDATE 變成 no-op，原始值就這樣留在輸出裡。開了這兩個
    // 選項後，BIGINT 一律用字串表示，不會經過浮點數精度的轉換。
    const conn = await mysql.createConnection({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
      supportBigNumbers: true,
      bigNumberStrings: true,
    });
    try {
      await maskDatabase(conn, db.database);
    } finally {
      await conn.end();
    }

    return dumpDatabase(db);
  });

  await writeSnapshotBytes(options.outputPath, maskedBytes);
  return maskedBytes;
}
