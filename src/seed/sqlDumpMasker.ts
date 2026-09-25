import {
  COLUMN_RULES,
  CLEAR_TABLES,
  buildColumnRuleLookup,
  type ColumnAction,
  type ColumnRule,
  type ColumnRuleLookup,
} from "./maskConfig";
import { maskJsonText } from "./jsonValueMasker";
import { maskValue } from "./maskValue";
import {
  findMatchingParen,
  parseIdentifier,
  parseQualifiedName,
  skipLeadingTrivia,
  skipQuoted,
  splitTopLevelByComma,
  trimSpan,
  type SourceSpan,
} from "./sqlTokenizer";

/**
 * Issue #13：把 mysqldump 產出的 SQL 文字，依 `maskConfig.ts` 的規則做遮罩。
 *
 * 第二輪 code review 決議的兩個結構性改變：
 * 1. 輸出剝除 dump 自帶的 `DROP TABLE`/`CREATE TABLE`——schema 一律以凍結的
 *    `seeds/mysql-schema.sql` 為準（`env-reset.sh` 會先載入它），這份遮罩後的
 *    種子只負責 DML。dump 裡的 `CREATE TABLE` 還是要解析（拿欄位順序），只是
 *    解析完不再原樣輸出。
 * 2. 每一句 INSERT 在輸出裡一律帶明確欄位列表（不管原本有沒有），逐一對照
 *    resolveColumns() 決定的欄位順序重新產生。這樣測試站的實際欄位順序跟這份
 *    凍結 schema 不一樣時，MySQL 靠欄位名稱對齊值，不會插進錯的欄位；欄位名稱
 *    在凍結 schema 裡不存在的話，匯入當場就會噴錯，不會悄悄把值塞錯地方。
 *
 * 安全原則（第一輪 code review 決議，延續）：凡是需要遮罩處理的表，任何無法
 * 安全解析的情況——INSERT/REPLACE 開頭卻解析不出表名或 VALUES 子句、沒有欄位
 * 列表又找不到對應的 CREATE TABLE、欄位數與值數不符、該處理的欄位值不是字串
 * 字面值（`_binary '…'`、`0x…` 之類）又不是 NULL——一律 throw，絕不默默放行、
 * 絕不猜測。
 */

interface InsertHeader {
  readonly table: string;
  readonly explicitColumns: readonly string[] | null;
  /** `INSERT`/`REPLACE` 關鍵字開始的 index（等於陳述式跳過前導註解/空白後的位置）。 */
  readonly headerStart: number;
  /** 表名結束的 index（欄位列表或 VALUES 開始之前）。 */
  readonly keywordEnd: number;
  /** VALUES 關鍵字之後、第一個 row 的 '(' 開始的 index。 */
  readonly valuesStart: number;
}

const INSERT_OR_REPLACE_RE = /^(?:INSERT|REPLACE)\b/i;
const MODIFIER_RE = /^\s*(?:LOW_PRIORITY|DELAYED|HIGH_PRIORITY|IGNORE)\b/i;
const INTO_RE = /^\s*INTO\b/i;
const VALUES_RE = /^\s*VALUES\b\s*/i;
const CREATE_TABLE_PREFIX_RE = /^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?/i;
const DROP_TABLE_PREFIX_RE = /^DROP TABLE\s+(?:IF EXISTS\s+)?/i;

function parseFailure(rest: string, reason: string): never {
  throw new Error(`${reason}，拒絕原樣放行。陳述式開頭：${rest.slice(0, 80).trim()}`);
}

/**
 * 解析一個陳述式是不是 `INSERT`/`INSERT IGNORE`/`REPLACE INTO`（含
 * `LOW_PRIORITY`/`DELAYED`/`HIGH_PRIORITY` 修飾詞、`` `db`.`table` `` 限定名、
 * ANSI 雙引號、完全不加引號的表名）。開頭不是 `INSERT`/`REPLACE` 就回傳
 * null（表示這不是我們要處理的陳述式）；開頭是但後面解析不出表名/VALUES
 * 子句，一律 throw——這種陳述式一定牽動資料列，不能因為「看不懂」就放行。
 */
function parseInsertHeader(stmt: string): InsertHeader | null {
  const bodyStart = skipLeadingTrivia(stmt, 0);
  const rest = stmt.slice(bodyStart);

  const kwMatch = INSERT_OR_REPLACE_RE.exec(rest);
  if (!kwMatch) return null;

  let i = kwMatch[0].length;
  while (true) {
    const mod = MODIFIER_RE.exec(rest.slice(i));
    if (!mod) break;
    i += mod[0].length;
  }

  const into = INTO_RE.exec(rest.slice(i));
  if (!into) parseFailure(rest, "陳述式以 INSERT/REPLACE 開頭卻解析不出 INTO 子句");
  i += into[0].length;

  while (/\s/.test(rest[i])) i++;
  const tableIdent = parseQualifiedName(rest, i);
  if (!tableIdent) parseFailure(rest, "陳述式解析不出表名");
  i = tableIdent.end;
  const keywordEnd = bodyStart + i;

  while (/\s/.test(rest[i])) i++;
  let explicitColumns: string[] | null = null;
  if (rest[i] === "(") {
    const closeIdx = findMatchingParen(rest, i);
    const colSpans = splitTopLevelByComma(rest, i + 1, closeIdx);
    explicitColumns = colSpans.map((span) => {
      const seg = rest.slice(span.start, span.end).trim();
      const ident = parseIdentifier(seg, 0);
      return ident ? ident.name : seg;
    });
    i = closeIdx + 1;
  }

  const valuesMatch = VALUES_RE.exec(rest.slice(i));
  if (!valuesMatch) parseFailure(rest, `表 \`${tableIdent.name}\` 的陳述式解析不到 VALUES 子句`);
  i += valuesMatch[0].length;

  return {
    table: tableIdent.name,
    explicitColumns,
    headerStart: bodyStart,
    keywordEnd,
    valuesStart: bodyStart + i,
  };
}

/** 解析一個陳述式是不是 `CREATE TABLE`，取出表名與欄位順序；不是就回傳 null。 */
function parseCreateTableColumns(stmt: string): { table: string; columns: string[] } | null {
  const bodyStart = skipLeadingTrivia(stmt, 0);
  const rest = stmt.slice(bodyStart);

  const prefixMatch = CREATE_TABLE_PREFIX_RE.exec(rest);
  if (!prefixMatch) return null;

  let i = prefixMatch[0].length;
  const tableIdent = parseQualifiedName(rest, i);
  if (!tableIdent) return null;
  i = tableIdent.end;

  while (/\s/.test(rest[i])) i++;
  if (rest[i] !== "(") return null;

  const closeIdx = findMatchingParen(rest, i);
  const defSpans = splitTopLevelByComma(rest, i + 1, closeIdx);

  const columns: string[] = [];
  for (const span of defSpans) {
    const def = rest.slice(span.start, span.end).trim();
    // 只有真正的欄位定義是以引號識別字開頭；PRIMARY KEY／KEY／UNIQUE KEY／
    // CONSTRAINT 這些表格層級的宣告開頭是裸字關鍵字，不會直接是引號。
    if (def[0] === "`" || def[0] === '"') {
      const colIdent = parseIdentifier(def, 0);
      if (colIdent) columns.push(colIdent.name);
    }
  }

  return { table: tableIdent.name, columns };
}

/** 陳述式是不是 `DROP TABLE`（不需要表名，輸出時整句剝除）。 */
function isDropTableStatement(stmt: string): boolean {
  const bodyStart = skipLeadingTrivia(stmt, 0);
  return DROP_TABLE_PREFIX_RE.test(stmt.slice(bodyStart));
}

/** 掃過整份 dump 的所有陳述式，建立 table -> 欄位順序 的對照表。 */
function collectSchemaColumns(statements: readonly string[]): Map<string, string[]> {
  const schemaColumns = new Map<string, string[]>();
  for (const stmt of statements) {
    const parsed = parseCreateTableColumns(stmt);
    if (parsed) schemaColumns.set(parsed.table, parsed.columns);
  }
  return schemaColumns;
}

/**
 * 決定一個 INSERT 陳述式的欄位順序：陳述式自帶欄位列表就直接用；沒有的話（mysqldump
 * 預設不帶欄位列表）就查同一份 dump 裡的 CREATE TABLE。兩者都沒有就 throw——絕不
 * 假設「大概跟 SELECT * 順序一樣」。輸出永遠帶明確欄位列表，所以這個函式現在對
 * 「每一張表」都會被呼叫，不是只有需要遮罩的表。
 */
function resolveColumns(
  table: string,
  explicitColumns: readonly string[] | null,
  schemaColumns: ReadonlyMap<string, string[]>
): string[] {
  if (explicitColumns) return [...explicitColumns];

  const fromSchema = schemaColumns.get(table);
  if (fromSchema) return fromSchema;

  throw new Error(
    `無法判斷表 \`${table}\` 的欄位順序：這個 INSERT 陳述式沒有帶欄位列表，` +
      `同一份 dump 裡也找不到對應的 CREATE TABLE \`${table}\`。輸出的每一句 INSERT` +
      "都必須帶明確欄位列表，拒絕用猜測的欄位順序繼續執行。"
  );
}

/** 解析 `VALUES (...), (...), ...` 每個 row 的欄位值範圍（相對於整個陳述式字串）。 */
function parseValueRows(stmt: string, valuesStart: number): SourceSpan[][] {
  const rows: SourceSpan[][] = [];
  const n = stmt.length;
  let i = valuesStart;

  while (i < n) {
    while (i < n && /\s/.test(stmt[i])) i++;
    if (stmt[i] !== "(") break;

    const rowEnd = findMatchingParen(stmt, i);
    rows.push(splitTopLevelByComma(stmt, i + 1, rowEnd));
    i = rowEnd + 1;

    while (i < n && /\s/.test(stmt[i])) i++;
    if (stmt[i] === ",") {
      i++;
      continue;
    }
    break;
  }

  return rows;
}

interface QuotedLiteral {
  readonly quote: string;
  /** 引號內容（不含前後引號）在整個陳述式字串裡的起訖 index。 */
  readonly contentStart: number;
  readonly contentEnd: number;
}

/** 判斷 `[start, end)` 這個欄位值 token 是不是字串字面值；不是就回傳 null。 */
function findQuotedLiteral(stmt: string, start: number, end: number): QuotedLiteral | null {
  let i = start;
  while (i < end && /\s/.test(stmt[i])) i++;
  const quote = stmt[i];
  if (quote !== "'" && quote !== '"') return null;

  const closeIdx = skipQuoted(stmt, i, quote);
  return { quote, contentStart: i + 1, contentEnd: closeIdx };
}

function decodeSqlStringLiteral(raw: string, quote: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1];
      switch (next) {
        case "0":
          out += "\0";
          break;
        case "n":
          out += "\n";
          break;
        case "r":
          out += "\r";
          break;
        case "t":
          out += "\t";
          break;
        case "Z":
          out += "\x1a";
          break;
        case "b":
          out += "\b";
          break;
        default:
          out += next; // 涵蓋 \' \" \\ 等：跳脫符號本身不留下，取跳脫後的字元
      }
      i++;
      continue;
    }
    if (ch === quote && raw[i + 1] === quote) {
      out += quote; // 重複引號跳脫（'a''b' -> a'b）
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

function escapeSqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function makeNullEdit(stmt: string, span: SourceSpan): Edit {
  const { start, end } = trimSpan(stmt, span.start, span.end);
  return { start, end, text: "NULL" };
}

function makeLiteralEdit(literal: QuotedLiteral, plainValue: string): Edit {
  return {
    start: literal.contentStart - 1,
    end: literal.contentEnd + 1,
    text: `${literal.quote}${escapeSqlString(plainValue)}${literal.quote}`,
  };
}

/**
 * `players.account` 專用：能還原「使用者帳號 + 站台代碼 + p + 平台 id」的推導
 * 關係（見 `LobbyAbstract::getFormattedPlayerAccount()`）就保留這個關係，只換
 * 使用者帳號那一段；還原不了（主平台直接存 `users.account` 沒有任何後綴、
 * Mg/Pinnacle 之類直接存供應商值、Sa 是小寫化再接雜湊後綴……這些格式都不一樣）
 * 就退回當一般帳號字串整串遮罩——第二輪 code review 決議：格式對不上不是
 * 「資料有問題」，是本來就有好幾種合法格式，不該 throw。
 *
 * 因為合成值是原始值本身的 keyed hash，主平台那種「整串就是 users.account」
 * 的情況，遮罩後會跟 users.account 自己被遮罩的結果算出同一個合成值，關聯不會
 * 丟失（見 `sqlDumpMasker.test.ts` 的對應測試）。
 */
function buildPlayerAccountEdit(
  stmt: string,
  literal: QuotedLiteral,
  row: readonly SourceSpan[],
  columns: readonly string[],
  stationCodeByStationId: ReadonlyMap<string, string>
): Edit {
  const original = decodeSqlStringLiteral(stmt.slice(literal.contentStart, literal.contentEnd), literal.quote);

  const stationIdIdx = columns.indexOf("station_id");
  const platformIdIdx = columns.indexOf("platform_id");
  if (stationIdIdx !== -1 && platformIdIdx !== -1) {
    const stationIdRaw = stmt.slice(row[stationIdIdx].start, row[stationIdIdx].end).trim();
    const platformIdRaw = stmt.slice(row[platformIdIdx].start, row[platformIdIdx].end).trim();
    const stationCode = stationCodeByStationId.get(stationIdRaw);
    if (stationCode !== undefined) {
      const expectedSuffix = `${stationCode}p${platformIdRaw}`;
      if (original.endsWith(expectedSuffix)) {
        const prefix = original.slice(0, original.length - expectedSuffix.length);
        return makeLiteralEdit(literal, maskValue("account", prefix) + expectedSuffix);
      }
    }
  }

  return makeLiteralEdit(literal, maskValue("account", original));
}

interface RowMaskContext {
  readonly stmt: string;
  readonly table: string;
  readonly row: readonly SourceSpan[];
  readonly columns: readonly string[];
  readonly stationCodeByStationId: ReadonlyMap<string, string>;
}

/** 依 `action` 決定單一欄位值要不要改、改成什麼；不需要改就回傳 null。 */
function buildColumnEdit(span: SourceSpan, column: string, action: ColumnAction, ctx: RowMaskContext): Edit | null {
  const { stmt, table } = ctx;
  const trimmed = stmt.slice(span.start, span.end).trim();
  const isNullLiteral = /^null$/i.test(trimmed);

  if (action.kind === "null") {
    return isNullLiteral ? null : makeNullEdit(stmt, span);
  }

  if (isNullLiteral) return null; // 其餘動作都允許 NULL 原樣保留

  const literal = findQuotedLiteral(stmt, span.start, span.end);
  if (!literal) {
    throw new Error(
      `欄位 \`${table}\`.\`${column}\` 的值不是字串字面值也不是 NULL（原始內容：${trimmed}），` +
        "可能是 _binary '...'、0x... 或其他無法安全解析的形式，拒絕原樣放行。"
    );
  }

  switch (action.kind) {
    case "fixed":
      return makeLiteralEdit(literal, action.value);
    case "mask": {
      const original = decodeSqlStringLiteral(stmt.slice(literal.contentStart, literal.contentEnd), literal.quote);
      return makeLiteralEdit(literal, maskValue(action.category, original));
    }
    case "mask_json": {
      const original = decodeSqlStringLiteral(stmt.slice(literal.contentStart, literal.contentEnd), literal.quote);
      return makeLiteralEdit(literal, maskJsonText(original));
    }
    case "derive_player_account":
      return buildPlayerAccountEdit(stmt, literal, ctx.row, ctx.columns, ctx.stationCodeByStationId);
  }
}

function applyEdits(stmt: string, edits: readonly Edit[]): string {
  // 從尾端往前套用，才不會因為前面替換造成的長度變化影響後面的 offset。
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = stmt;
  for (const edit of sorted) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

function quoteIdentifier(name: string): string {
  return "`" + name.replace(/`/g, "``") + "`";
}

/**
 * 重寫一句 INSERT/REPLACE：欄位列表永遠換成 `resolveColumns()` 決定的明確列表
 * （不管原本有沒有帶），再依 `columnRules`（可能是 null——這張表沒有遮罩規則）
 * 對每個 row 逐欄位套用動作。
 */
function rewriteInsertStatement(
  stmt: string,
  header: InsertHeader,
  columnRules: ReadonlyMap<string, ColumnAction> | null,
  schemaColumns: ReadonlyMap<string, string[]>,
  stationCodeByStationId: ReadonlyMap<string, string>
): string {
  const columns = resolveColumns(header.table, header.explicitColumns, schemaColumns);
  const rows = parseValueRows(stmt, header.valuesStart);

  const headerText =
    stmt.slice(header.headerStart, header.keywordEnd) + " (" + columns.map(quoteIdentifier).join(", ") + ") VALUES ";
  const edits: Edit[] = [{ start: header.headerStart, end: header.valuesStart, text: headerText }];

  for (const row of rows) {
    if (row.length !== columns.length) {
      throw new Error(
        `表 \`${header.table}\` 的一筆 INSERT 值數量（${row.length}）與欄位數量（${columns.length}）不符，` +
          "拒絕在欄位對不齊的狀態下繼續處理（明確欄位列表跟值對不上，MySQL 匯入時也一定會失敗）。"
      );
    }

    if (!columnRules) continue;

    const ctx: RowMaskContext = { stmt, table: header.table, row, columns, stationCodeByStationId };
    columns.forEach((column, colIndex) => {
      const action = columnRules.get(column);
      if (!action) return;
      const edit = buildColumnEdit(row[colIndex], column, action, ctx);
      if (edit) edits.push(edit);
    });
  }

  return applyEdits(stmt, edits);
}

/** 掃過整份 dump，建立 `stations.id -> stations.code` 對照表（`players.account` 推導要用）。 */
function collectStationCodes(statements: readonly string[], schemaColumns: ReadonlyMap<string, string[]>): Map<string, string> {
  const stationCodeByStationId = new Map<string, string>();

  for (const stmt of statements) {
    const header = parseInsertHeader(stmt);
    if (!header || header.table !== "stations") continue;

    const columns = resolveColumns("stations", header.explicitColumns, schemaColumns);
    const idIdx = columns.indexOf("id");
    const codeIdx = columns.indexOf("code");
    // 不是每份快照都會用到 players.account 的推導遮罩；stations 的 INSERT 沒帶
    // id/code 欄位時，單純跳過（不納入對照表），players.account 那邊本來就有
    // 「查不到就退回一般帳號遮罩」的 fallback，不需要在這裡先 throw。
    if (idIdx === -1 || codeIdx === -1) continue;

    for (const row of parseValueRows(stmt, header.valuesStart)) {
      const idRaw = stmt.slice(row[idIdx].start, row[idIdx].end).trim();
      const codeLiteral = findQuotedLiteral(stmt, row[codeIdx].start, row[codeIdx].end);
      if (!codeLiteral) continue; // code 不是字串字面值（理論上不會），一樣跳過、留給 fallback 處理
      const code = decodeSqlStringLiteral(stmt.slice(codeLiteral.contentStart, codeLiteral.contentEnd), codeLiteral.quote);
      stationCodeByStationId.set(idRaw, code);
    }
  }

  return stationCodeByStationId;
}

function maskStatement(
  stmt: string,
  columnRuleLookup: ColumnRuleLookup,
  schemaColumns: ReadonlyMap<string, string[]>,
  stationCodeByStationId: ReadonlyMap<string, string>
): string {
  // schema 以凍結的 seeds/mysql-schema.sql 為準：dump 自帶的 DROP/CREATE TABLE
  // 只拿來解析欄位順序（collectSchemaColumns 用的是掃描整份 dump 的結果，跟這裡
  // 的輸出過濾是兩個獨立步驟），輸出裡不重複帶一份。
  if (parseCreateTableColumns(stmt)) return "";
  if (isDropTableStatement(stmt)) return "";

  const header = parseInsertHeader(stmt);
  if (!header) return stmt; // 不是 INSERT/REPLACE 陳述式，原樣通過（LOCK TABLES、SET、註解...）

  if (CLEAR_TABLES.has(header.table)) return ""; // 整表清空：直接捨棄這筆 INSERT

  return rewriteInsertStatement(stmt, header, columnRuleLookup.get(header.table) ?? null, schemaColumns, stationCodeByStationId);
}

/**
 * 依頂層（不在引號/註解內）的 `;` 切割陳述式，每一段包含其前導空白與註解，
 * 讓所有片段串接回去等於原始輸入（byte-identical round trip）。
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let stmtStart = 0;
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];

    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(sql, i, ch) + 1;
      continue;
    }

    if (ch === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i = Math.min(i + 2, n);
      continue;
    }

    if (ch === "-" && sql[i + 1] === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }

    if (ch === ";") {
      i++;
      statements.push(sql.slice(stmtStart, i));
      stmtStart = i;
      continue;
    }

    i++;
  }

  if (stmtStart < n) statements.push(sql.slice(stmtStart));

  return statements;
}

/**
 * 遮罩整份 mysqldump SQL 文字。同一份輸入、同一份規則、同一把 `MASK_HMAC_KEY`，
 * 永遠產生同一份輸出（決定性：合成值只由原值的 keyed hash 推得，見
 * `maskValue.ts`）。輸出不含 dump 自帶的 DROP/CREATE TABLE，且每句 INSERT 都
 * 帶明確欄位列表（見檔案開頭說明）。
 */
export function maskMysqlDump(sql: string, rules: readonly ColumnRule[] = COLUMN_RULES): string {
  const columnRuleLookup = buildColumnRuleLookup(rules);
  const statements = splitStatements(sql);
  const schemaColumns = collectSchemaColumns(statements);
  const stationCodeByStationId = collectStationCodes(statements, schemaColumns);

  return statements
    .map((stmt) => maskStatement(stmt, columnRuleLookup, schemaColumns, stationCodeByStationId))
    .join("");
}
