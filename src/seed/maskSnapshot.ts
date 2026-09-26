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

    const pool = mysql.createPool({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
      multipleStatements: true,
    });
    try {
      await maskDatabase(pool, db.database);
    } finally {
      await pool.end();
    }

    return dumpDatabase(db);
  });

  await writeSnapshotBytes(options.outputPath, maskedBytes);
  return maskedBytes;
}
