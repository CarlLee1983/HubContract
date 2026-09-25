import fs from "fs/promises";
import { maskMysqlDump } from "./sqlDumpMasker";

/**
 * Issue #13：讀入測試站快照（`.sql` 或 `.sql.gz`），套用遮罩後寫出。
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

async function readSqlFile(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath);
  const bytes = isGzipPath(filePath) ? Bun.gunzipSync(raw) : raw;
  return Buffer.from(bytes).toString("utf-8");
}

async function writeSqlFile(filePath: string, sql: string): Promise<void> {
  const utf8 = Buffer.from(sql, "utf-8");
  const bytes = isGzipPath(filePath) ? Bun.gzipSync(utf8) : utf8;
  await fs.writeFile(filePath, bytes);
}

/** 遮罩單一快照檔案，回傳遮罩後的 SQL 文字內容（呼叫端可再自行檢查）。 */
export async function maskSnapshotFile(options: MaskSnapshotOptions): Promise<string> {
  const sql = await readSqlFile(options.inputPath);
  const masked = maskMysqlDump(sql);
  await writeSqlFile(options.outputPath, masked);
  return masked;
}
