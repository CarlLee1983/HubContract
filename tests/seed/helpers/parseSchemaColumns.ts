import fs from "fs";

/**
 * Issue #13：只給測試用的極簡 `CREATE TABLE` 掃描器——從 `seeds/mysql-schema.sql`
 * 讀出「每張表有哪些欄位」，拿來離線驗證 `src/seed/maskConfig.ts` 的
 * `TABLE_CONFIG` 有沒有分類到每一個真實欄位。
 *
 * 這不是遮罩腳本的一部分（遮罩本身的「解析」交給真正的 MariaDB，見
 * `src/seed/dockerMariaDb.ts` 開頭說明），只是測試賴以离線執行的輔助工具，
 * 不需要處理任意 mysqldump 語法的邊界情況——`seeds/mysql-schema.sql` 是我們
 * 自己凍結、格式固定的檔案。
 */
export function parseSchemaColumns(schemaPath: string): Map<string, string[]> {
  const sql = fs.readFileSync(schemaPath, "utf-8");
  const tableRe = /CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\) ENGINE=/g;
  const columnsByTable = new Map<string, string[]>();

  let match: RegExpExecArray | null;
  while ((match = tableRe.exec(sql))) {
    const table = match[1];
    const body = match[2];
    const columns: string[] = [];
    for (const line of body.split("\n")) {
      const columnMatch = /^\s*`([^`]+)`\s/.exec(line);
      if (columnMatch) columns.push(columnMatch[1]);
    }
    columnsByTable.set(table, columns); // 同名表出現兩次時，用後面那次的欄位覆蓋前面（見 mysql-schema.sql 的 migrations）
  }

  return columnsByTable;
}
