import type { Connection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { TABLE_CONFIG, type ColumnAction, type TableConfig } from "./maskConfig";
import { maskJsonValue } from "./jsonValueMasker";
import { maskValue } from "./maskValue";

/**
 * Issue #13（第三輪 code review 決議）：在拋棄式 MariaDB 容器「裡面」遮罩——
 * 逐表讀主鍵＋待處理欄位，在 TS 裡算合成值，分批 UPDATE 回去。解析交給真正的
 * 資料庫（`information_schema`），不再自己寫 SQL parser。
 *
 * 白名單以「載入後的資料庫」的 `information_schema` 為準，不是凍結的
 * `seeds/mysql-schema.sql`——這樣測試站快照比那份凍結 schema 多出來的表/欄位，
 * 也一定會被 `maskDatabase()` 開頭的分類完整性檢查擋下來，而不是悄悄放行。
 *
 * 第五輪 code review 決議：全程用同一條專屬連線（不走 pool）。原因有三個都跟
 * 「session 層級的狀態要一路生效」有關：
 * 1. `SET SESSION sql_mode = ...`（見 `STRICT_SQL_MODE`）跟 `FOREIGN_KEY_CHECKS
 *    = 0` 都是連線層級的設定，走 pool 的話每個查詢可能分到不同的底層連線，
 *    設定不保證一路生效。
 * 2. 每一筆遮罩 UPDATE 都要斷言 `affectedRows === 1`（見 `executeMaskingUpdate`），
 *    這個保證只有在「我們自己控制連線的交易邊界」時才站得住腳。
 * 3. 用同一條連線也讓「連線建立時的 `supportBigNumbers`/`bigNumberStrings`」
 *    保證從頭到尾都生效，不會有走 pool 時某個連線設定沒套用到的疑慮。
 */

/**
 * 第五輪 code review 決議：快照裡的 `SET GLOBAL sql_mode=''` 會改變「之後新建
 * 立的連線」預設繼承到的 sql_mode（已用探針證實）。遮罩連線一律強制設成嚴格
 * 模式，遮罩後的值如果超出欄位長度限制，寧可讓 UPDATE 直接報錯，也不要讓
 * MariaDB 在非嚴格模式下靜默截斷——截斷後的值本身可能還留著原始值的一部分。
 */
const STRICT_SQL_MODE = "STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO";

interface TableColumnRow extends RowDataPacket {
  tableName: string;
  columnName: string;
}

/**
 * 第四輪 code review 決議：快照裡如果帶了 trigger（或 routine/event/view），
 * 遮罩用的 UPDATE 執行時可能觸發它，把 `OLD.account` 這類原始值寫進別的表
 * （已用探針證實：`AFTER UPDATE` trigger 把 `OLD.account` insert 到另一張表，
 * 遮罩後的輸出裡那張表就外洩了原始值）。這些物件的行為無法通用地判斷安不
 * 安全，直接拒絕繼續、讓人工處理，不嘗試自動繞過。
 */
async function assertNoUserDefinedObjects(conn: Connection, database: string): Promise<void> {
  const [triggers] = await conn.query<RowDataPacket[]>(
    "SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?",
    [database]
  );
  const [routines] = await conn.query<RowDataPacket[]>(
    "SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS type FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?",
    [database]
  );
  const [events] = await conn.query<RowDataPacket[]>(
    "SELECT EVENT_NAME AS name FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?",
    [database]
  );
  const [views] = await conn.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS name FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?",
    [database]
  );

  const problems = [
    ...triggers.map((r) => `trigger \`${r.name}\``),
    ...routines.map((r) => `${String(r.type).toLowerCase()} \`${r.name}\``),
    ...events.map((r) => `event \`${r.name}\``),
    ...views.map((r) => `view \`${r.name}\``),
  ];

  if (problems.length === 0) return;

  throw new Error(
    "快照裡有使用者定義的資料庫物件，拒絕遮罩：" +
      problems.join("、") +
      "。這些物件可能在遮罩執行 UPDATE 時被觸發、把原始值寫進其他地方，且 mysqldump 也不會匯出它們" +
      "（已加 --skip-triggers；routines/events 預設本來就不匯出），繼續下去等於留下看不見的外洩管道，" +
      "或是輸出跟資料庫實際狀態不一致。這種物件的行為沒辦法通用地判斷安不安全，需要人工處理。"
  );
}

/**
 * 第四輪 code review 決議：快照如果帶了 `CREATE DATABASE ...; USE ...;` 切換
 * 到別的 schema，資料實際上不會寫進我們遮罩/匯出鎖定的目標資料庫——遮罩腳本
 * 卻會「成功」跑完、產出一份看似正常其實是空的種子（已用探針證實）。載入後
 * 檢查除了目標資料庫跟系統內建的 schema 以外，不該有任何其他 schema。
 */
async function assertNoOtherDatabases(conn: Connection, database: string): Promise<void> {
  const SYSTEM_SCHEMAS = ["information_schema", "mysql", "performance_schema", "sys"];
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN (${SYSTEM_SCHEMAS.map(() => "?").join(",")})`,
    SYSTEM_SCHEMAS
  );
  const others = rows.map((r) => r.name as string).filter((name) => name !== database);

  if (others.length === 0) return;

  throw new Error(
    `快照載入後出現了非預期的資料庫（${others.join("、")}），拒絕遮罩：可能是快照裡有 ` +
      "CREATE DATABASE/USE 切到別的 schema，資料實際上沒有寫進目標資料庫" +
      `\`${database}\`，遮罩與 mysqldump 都只看這個 database，繼續下去會產出一份看似成功、其實是空的種子。`
  );
}

async function fetchColumnsBySchema(conn: Connection, database: string): Promise<Map<string, string[]>> {
  const [rows] = await conn.query<TableColumnRow[]>(
    "SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.columns " +
      "WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION",
    [database]
  );

  const byTable = new Map<string, string[]>();
  for (const row of rows) {
    const columns = byTable.get(row.tableName) ?? [];
    columns.push(row.columnName);
    byTable.set(row.tableName, columns);
  }
  return byTable;
}

export interface UnclassifiedEntries {
  readonly tables: readonly string[];
  readonly columns: readonly string[];
}

/**
 * 白名單完整性檢查的純函式核心：給定「資料庫裡實際有的表 -> 欄位清單」，找出
 * 哪些表/欄位在 `TABLE_CONFIG` 裡沒有分類。跟真的資料庫連線分開，方便離線
 * 單元測試（見 `tests/seed/maskDatabase.test.ts`），也讓
 * `maskDatabase()` 保持單純。
 */
export function findUnclassifiedEntries(
  columnsByTable: ReadonlyMap<string, readonly string[]>,
  tableConfigByTable: Readonly<Record<string, TableConfig>> = TABLE_CONFIG
): UnclassifiedEntries {
  const tables: string[] = [];
  const columns: string[] = [];

  for (const [table, tableColumns] of columnsByTable) {
    const tableConfig = tableConfigByTable[table];
    if (!tableConfig) {
      tables.push(table);
      continue;
    }
    if (tableConfig.truncate) continue; // 整表清空，欄位不需要個別分類

    for (const column of tableColumns) {
      // `in` 會沿著原型鏈找，欄位剛好叫 `constructor`/`toString` 之類時會誤判
      // 成「已分類」（第四輪 code review 決議）：改用 Object.hasOwn，只認真正
      // 設定過的自身屬性。
      if (!tableConfig.columns || !Object.hasOwn(tableConfig.columns, column)) {
        columns.push(`${table}.${column}`);
      }
    }
  }

  return { tables, columns };
}

function formatUnclassifiedError(entries: UnclassifiedEntries): string {
  return [
    "遮罩設定不完整（src/seed/maskConfig.ts 的 TABLE_CONFIG）：",
    ...entries.tables.map((t) => `  - 未分類的表：\`${t}\``),
    ...entries.columns.map((c) => `  - 未分類的欄位：\`${c}\``),
    "每一張表、每一個欄位都必須明確分類成 keep/mask/null/fixed/mask_json/derive_player_account" +
      "（或整表 truncate），拒絕用「沒列到就當作安全」的假設繼續遮罩。",
  ].join("\n");
}

async function fetchPrimaryKeyColumns(conn: Connection, database: string, table: string): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT COLUMN_NAME AS columnName FROM information_schema.STATISTICS " +
      "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = 'PRIMARY' ORDER BY SEQ_IN_INDEX",
    [database, table]
  );
  return rows.map((row) => row.columnName as string);
}

/**
 * 第五輪 code review 決議：`ON UPDATE CURRENT_TIMESTAMP` 的欄位，只要那一列被
 * `UPDATE` 到（即使沒有把這個欄位列進 SET 子句），MariaDB 就會自動把它改成
 * 現在時間——遮罩會因此悄悄改掉這些欄位的值，破壞決定性（同一份快照兩次遮罩
 * 產生的時間戳記會不一樣）。從 `information_schema.COLUMNS.EXTRA` 找出這類
 * 欄位，遮罩時明確把它們也放進 SET 子句、設回自己原本的值（`` `col` = `col` ``）
 * 來抑制這個自動行為。
 */
async function fetchAutoUpdateTimestampColumns(conn: Connection, database: string, table: string): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT COLUMN_NAME AS columnName FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND EXTRA LIKE '%on update current_timestamp%'",
    [database, table]
  );
  return rows.map((row) => row.columnName as string);
}

/**
 * 執行一句遮罩用的 UPDATE，並斷言剛好改到一列。第五輪 code review 決議：主鍵
 * 是超出 JS number 安全整數範圍的 `BIGINT`（例如 `9007199254740993`）時，如果
 * 連線沒開 `supportBigNumbers`/`bigNumberStrings`，mysql2 會把它捨入成一個
 * 相近但不同的數字，`WHERE id = ?` 因此配不到任何一列、UPDATE 悄悄變成
 * no-op，原始值就這樣留在輸出裡（已用探針證實）。`affectedRows !== 1` 一律
 * 直接 throw，不管是主鍵精度問題、還是任何其他原因造成的「以為改了、其實沒
 * 改」。
 */
async function executeMaskingUpdate(conn: Connection, table: string, sql: string, values: readonly unknown[]): Promise<void> {
  // mysql2 的 ExecuteValues 型別比我們實際傳的 unknown[] 窄，這裡用 any[] 繞過
  // 純型別層面的不匹配（執行期沒有影響，mysql2 本來就接受任何純量值）。
  const [result] = await conn.execute<ResultSetHeader>(sql, values as any[]);
  if (result.affectedRows !== 1) {
    throw new Error(
      `表 \`${table}\` 的遮罩 UPDATE 影響了 ${result.affectedRows} 列（預期剛好 1 列），拒絕繼續。` +
        "常見成因：主鍵是超出 JS 安全整數範圍的 BIGINT，WHERE 條件配不到正確的那一列。"
    );
  }
}

/**
 * `stations.id -> stations.code`，`players.account` 的推導遮罩要用。`stations`
 * 表不存在、或沒有 `id`/`code` 欄位（例如測試用的精簡 fixture）就回傳空表——
 * `derivePlayerAccountValue` 本來就有查不到就退回一般帳號遮罩的 fallback，
 * 這裡不需要因為選配的推導資訊缺席就整個失敗。
 */
async function loadStationCodes(conn: Connection, columnsByTable: ReadonlyMap<string, readonly string[]>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const stationsColumns = columnsByTable.get("stations");
  if (!stationsColumns || !stationsColumns.includes("id") || !stationsColumns.includes("code")) return map;

  const [rows] = await conn.query<RowDataPacket[]>("SELECT `id` AS id, `code` AS code FROM `stations`");
  for (const row of rows) {
    map.set(String(row.id), String(row.code));
  }
  return map;
}

/**
 * `players.account` 專用：能還原「使用者帳號 + 站台代碼 + p + 平台 id」的推導
 * 關係就保留，還原不了（主平台直接存 `users.account`、部分廠商直接存供應商
 * 值……）就退回當一般帳號字串整串遮罩，不 throw（見 Issue #13 第二輪 code
 * review 決議）。
 */
function derivePlayerAccountValue(
  original: string,
  row: Record<string, unknown>,
  stationCodeByStationId: ReadonlyMap<string, string>
): string {
  const stationId = row.station_id;
  const platformId = row.platform_id;
  if (stationId !== null && stationId !== undefined && platformId !== null && platformId !== undefined) {
    const stationCode = stationCodeByStationId.get(String(stationId));
    if (stationCode !== undefined) {
      const expectedSuffix = `${stationCode}p${platformId}`;
      if (original.endsWith(expectedSuffix)) {
        const prefix = original.slice(0, original.length - expectedSuffix.length);
        return maskValue("account", prefix) + expectedSuffix;
      }
    }
  }
  return maskValue("account", original);
}

function computeNextValue(
  action: ColumnAction,
  original: unknown,
  row: Record<string, unknown>,
  stationCodeByStationId: ReadonlyMap<string, string>
): string {
  switch (action.kind) {
    case "mask":
      return maskValue(action.category, String(original));
    case "mask_json":
      // mysql2 對 CHECK (json_valid(...)) 的 LONGTEXT 欄位有時會直接回傳解析好
      // 的物件/陣列而不是原始字串，maskJsonValue 兩種輸入都能處理。
      return maskJsonValue(original, action.safeKeys);
    case "derive_player_account":
      return derivePlayerAccountValue(String(original), row, stationCodeByStationId);
    default:
      throw new Error(`computeNextValue 不支援的 action.kind：${action.kind}`);
  }
}

const ROW_BATCH_SIZE = 200;

async function maskTable(
  conn: Connection,
  database: string,
  table: string,
  columns: Readonly<Record<string, ColumnAction>>,
  actualColumns: readonly string[],
  stationCodeByStationId: ReadonlyMap<string, string>
): Promise<void> {
  // `TABLE_CONFIG` 分類的是「seeds/mysql-schema.sql 認識的欄位」，實際載入的
  // 快照可能是精簡過的（測試 fixture）或欄位集合略有出入，只處理這張表真的有
  // 的欄位——分類完整性檢查保證的是「資料庫裡有的欄位都被分類」，
  // 不是「分類設定裡列的欄位資料庫都要有」，兩個方向不對稱。
  const actualColumnSet = new Set(actualColumns);
  const entries = Object.entries(columns).filter(([column]) => actualColumnSet.has(column));
  const bulkEntries = entries.filter(([, action]) => action.kind === "null" || action.kind === "fixed");
  const perRowEntries = entries.filter(
    ([, action]) => action.kind === "mask" || action.kind === "mask_json" || action.kind === "derive_player_account"
  );

  // 要遮罩的欄位本身就不可能同時是 ON UPDATE CURRENT_TIMESTAMP 欄位（時間戳記
  // 欄位在 TABLE_CONFIG 裡一律分類成 keep），這裡還是排除一下避免 SET 子句裡
  // 同一個欄位出現兩次（MariaDB 對此會直接報錯）。注意：這裡只能排除「真的會
  // 被寫入」的欄位（bulk/perRow），不能用整個 `entries`——`updated_at` 這類欄位
  // 本身分類是 `keep`，也會出現在 `entries` 裡，如果誤用 `entries` 建排除清單，
  // 反而會把它自己排除掉，等於完全沒有保留時間戳記的效果（先前版本的 bug）。
  const maskedColumnNames = new Set([...bulkEntries, ...perRowEntries].map(([column]) => column));
  const autoUpdateTimestampColumns =
    bulkEntries.length > 0 || perRowEntries.length > 0
      ? (await fetchAutoUpdateTimestampColumns(conn, database, table)).filter((c) => !maskedColumnNames.has(c))
      : [];
  const preserveTimestampsClause = autoUpdateTimestampColumns.map((c) => `, \`${c}\` = \`${c}\``).join("");

  for (const [column, action] of bulkEntries) {
    if (action.kind === "null") {
      await conn.query(`UPDATE \`${table}\` SET \`${column}\` = NULL${preserveTimestampsClause}`);
    } else if (action.kind === "fixed") {
      await conn.query(`UPDATE \`${table}\` SET \`${column}\` = ?${preserveTimestampsClause}`, [action.value]);
    }
  }

  if (perRowEntries.length === 0) return;

  const pkColumns = await fetchPrimaryKeyColumns(conn, database, table);
  if (pkColumns.length === 0) {
    throw new Error(`表 \`${table}\` 需要逐列遮罩，但查不到 PRIMARY KEY，無法安全定位要 UPDATE 的資料列，拒絕繼續。`);
  }

  const needsStationPlatform = perRowEntries.some(([, action]) => action.kind === "derive_player_account");
  const extraColumns = needsStationPlatform
    ? ["station_id", "platform_id"].filter((c) => actualColumnSet.has(c))
    : [];
  const selectColumns = [...new Set([...pkColumns, ...perRowEntries.map(([column]) => column), ...extraColumns])];

  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT ${selectColumns.map((c) => `\`${c}\``).join(", ")} FROM \`${table}\``
  );

  for (let i = 0; i < rows.length; i += ROW_BATCH_SIZE) {
    const batch = rows.slice(i, i + ROW_BATCH_SIZE);
    await conn.beginTransaction();
    try {
      for (const row of batch) {
        const setClauses: string[] = [];
        const setValues: unknown[] = [];

        for (const [column, action] of perRowEntries) {
          const original = row[column];
          if (original === null || original === undefined) continue; // NULL 原樣保留

          const next = computeNextValue(action, original, row, stationCodeByStationId);
          if (next !== original) {
            setClauses.push(`\`${column}\` = ?`);
            setValues.push(next);
          }
        }

        if (setClauses.length === 0) continue;

        // 把這張表所有 ON UPDATE CURRENT_TIMESTAMP 的欄位也設回自己原本的值，
        // 抑制 MariaDB「這一列被 UPDATE 到就自動改成現在時間」的行為。
        for (const tsColumn of autoUpdateTimestampColumns) {
          setClauses.push(`\`${tsColumn}\` = \`${tsColumn}\``);
        }

        const whereClause = pkColumns.map((c) => `\`${c}\` = ?`).join(" AND ");
        const whereValues = pkColumns.map((c) => row[c]);
        await executeMaskingUpdate(conn, table, `UPDATE \`${table}\` SET ${setClauses.join(", ")} WHERE ${whereClause}`, [
          ...setValues,
          ...whereValues,
        ]);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  }
}

/**
 * 遮罩整個資料庫：先做白名單完整性檢查（有任何未分類的表/欄位就直接 throw，
 * 不遮罩任何東西），再整表清空該清空的表，最後逐表依欄位分類遮罩。
 */
export async function maskDatabase(conn: Connection, database: string): Promise<void> {
  // 一律強制設成嚴格模式，蓋掉快照可能帶的 `SET GLOBAL sql_mode=''`（見檔案
  // 開頭 STRICT_SQL_MODE 的說明），要早於任何一句 UPDATE。
  await conn.query(`SET SESSION sql_mode = '${STRICT_SQL_MODE}'`);

  await assertNoOtherDatabases(conn, database);
  await assertNoUserDefinedObjects(conn, database);

  const columnsByTable = await fetchColumnsBySchema(conn, database);
  const entries = findUnclassifiedEntries(columnsByTable);
  if (entries.tables.length > 0 || entries.columns.length > 0) {
    throw new Error(formatUnclassifiedError(entries));
  }

  await conn.query("SET FOREIGN_KEY_CHECKS = 0");

  for (const table of columnsByTable.keys()) {
    if (TABLE_CONFIG[table]?.truncate) {
      await conn.query(`TRUNCATE TABLE \`${table}\``);
    }
  }

  const stationCodeByStationId = await loadStationCodes(conn, columnsByTable);

  for (const table of columnsByTable.keys()) {
    const tableConfig = TABLE_CONFIG[table];
    if (!tableConfig || tableConfig.truncate || !tableConfig.columns) continue;
    const actualColumns = columnsByTable.get(table) ?? [];
    await maskTable(conn, database, table, tableConfig.columns, actualColumns, stationCodeByStationId);
  }
}
