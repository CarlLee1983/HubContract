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
  skipLeadingTrivia,
  skipQuoted,
  splitTopLevelByComma,
  trimSpan,
  type SourceSpan,
} from "./sqlTokenizer";

/**
 * Issue #13：把 mysqldump 產出的 SQL 文字，依 `maskConfig.ts` 的規則做遮罩。
 *
 * 策略是「外科手術式」取代：只改動落在需要處理的欄位上的字面值本身，其餘所有
 * 文字（schema DDL、註解、`INSERT` 陳述式的排版、非規則內欄位的值）逐字元保留。
 *
 * 安全原則（code review 決議）：凡是 `COLUMN_RULES`／`CLEAR_TABLES` 內的表，任何
 * 無法安全解析的情況——INSERT 沒有欄位列表又找不到對應的 CREATE TABLE、欄位數與
 * 值數不符、該處理的欄位值不是字串字面值（`_binary '…'`、`0x…` 之類）又不是
 * NULL——一律 throw，絕不默默放行、絕不猜測。
 */

interface InsertHeader {
  readonly table: string;
  readonly explicitColumns: readonly string[] | null;
  /** VALUES 關鍵字之後、第一個 row 的 '(' 開始的 index。 */
  readonly valuesStart: number;
}

const INSERT_HEADER_RE = /^(?:INSERT(?:\s+IGNORE)?|REPLACE)\s+INTO\s+`([^`]+)`\s*(?:\(([^)]*)\))?\s*VALUES\s*/i;
const CREATE_TABLE_RE = /CREATE TABLE\s+`([^`]+)`\s*\(/i;

function splitColumnList(raw: string): string[] {
  return raw.split(",").map((c) => c.trim().replace(/^`|`$/g, ""));
}

/** 解析一個陳述式是不是 `INSERT`/`INSERT IGNORE`/`REPLACE INTO`；不是就回傳 null。 */
function parseInsertHeader(stmt: string): InsertHeader | null {
  const bodyStart = skipLeadingTrivia(stmt, 0);
  const match = INSERT_HEADER_RE.exec(stmt.slice(bodyStart));
  if (!match) return null;

  return {
    table: match[1],
    explicitColumns: match[2] != null ? splitColumnList(match[2]) : null,
    valuesStart: bodyStart + match[0].length,
  };
}

/** 解析一個陳述式是不是 `CREATE TABLE`，取出欄位順序；不是就回傳 null。 */
function parseCreateTableColumns(stmt: string): { table: string; columns: string[] } | null {
  const match = CREATE_TABLE_RE.exec(stmt);
  if (!match) return null;

  const openIdx = match.index + match[0].length - 1;
  const closeIdx = findMatchingParen(stmt, openIdx);
  const defSpans = splitTopLevelByComma(stmt, openIdx + 1, closeIdx);

  const columns: string[] = [];
  for (const span of defSpans) {
    const def = stmt.slice(span.start, span.end).trim();
    // 只有真正的欄位定義是以反引號識別字開頭；PRIMARY KEY／KEY／UNIQUE KEY／
    // CONSTRAINT 這些表格層級的宣告開頭是關鍵字，不會直接是反引號。
    const colMatch = /^`([^`]+)`/.exec(def);
    if (colMatch) columns.push(colMatch[1]);
  }

  return { table: match[1], columns };
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
 * 假設「大概跟 SELECT * 順序一樣」。
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
      `同一份 dump 裡也找不到對應的 CREATE TABLE \`${table}\`。這張表需要遮罩，` +
      `拒絕用猜測的欄位順序繼續執行（可能會把 secret_key 之類的欄位當成別的欄位放行）。`
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

/** `players.account` 專用：保留「使用者帳號 + 站台代碼 + p + 平台 id」的推導關係。 */
function buildDerivedPlayerAccountEdit(
  stmt: string,
  literal: QuotedLiteral,
  row: readonly SourceSpan[],
  columns: readonly string[],
  stationCodeByStationId: ReadonlyMap<string, string>
): Edit {
  const stationIdIdx = columns.indexOf("station_id");
  const platformIdIdx = columns.indexOf("platform_id");
  if (stationIdIdx === -1 || platformIdIdx === -1) {
    throw new Error(
      "players.account 遮罩失敗：這筆 INSERT 的欄位列表裡沒有 station_id 或 platform_id，" +
        "無法依推導公式（見 LobbyAbstract::getFormattedPlayerAccount）安全遮罩，拒絕原樣放行。"
    );
  }

  const stationIdRaw = stmt.slice(row[stationIdIdx].start, row[stationIdIdx].end).trim();
  const platformIdRaw = stmt.slice(row[platformIdIdx].start, row[platformIdIdx].end).trim();
  const stationCode = stationCodeByStationId.get(stationIdRaw);
  if (stationCode === undefined) {
    throw new Error(
      `players.account 遮罩失敗：找不到 station_id=${stationIdRaw} 對應的 stations.code` +
        "（這份 dump 裡可能缺少該站台的 INSERT，或 stations 表還沒被掃過）。"
    );
  }

  const expectedSuffix = `${stationCode}p${platformIdRaw}`;
  const original = decodeSqlStringLiteral(stmt.slice(literal.contentStart, literal.contentEnd), literal.quote);
  if (!original.endsWith(expectedSuffix)) {
    throw new Error(
      `players.account="${original}" 不符合預期的推導格式 <使用者帳號>${expectedSuffix}` +
        "（見 LobbyAbstract::getFormattedPlayerAccount()），拒絕用猜測的方式遮罩。"
    );
  }

  const prefix = original.slice(0, original.length - expectedSuffix.length);
  return makeLiteralEdit(literal, maskValue("account", prefix) + expectedSuffix);
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
      return buildDerivedPlayerAccountEdit(stmt, literal, ctx.row, ctx.columns, ctx.stationCodeByStationId);
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

/** 對一個 INSERT 陳述式套用某張表的欄位規則，回傳改寫後的陳述式文字。 */
function maskInsertStatement(
  stmt: string,
  header: InsertHeader,
  columnRules: ReadonlyMap<string, ColumnAction>,
  schemaColumns: ReadonlyMap<string, string[]>,
  stationCodeByStationId: ReadonlyMap<string, string>
): string {
  const columns = resolveColumns(header.table, header.explicitColumns, schemaColumns);
  const rows = parseValueRows(stmt, header.valuesStart);

  const edits: Edit[] = [];
  for (const row of rows) {
    if (row.length !== columns.length) {
      throw new Error(
        `表 \`${header.table}\` 的一筆 INSERT 值數量（${row.length}）與欄位數量（${columns.length}）不符，` +
          "拒絕在欄位對不齊的狀態下繼續遮罩。"
      );
    }

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
    // id/code 欄位時，單純跳過（不納入對照表），留到真的需要查表時才 throw
    // （見 buildDerivedPlayerAccountEdit 的「找不到 station_id=… 對應的
    // stations.code」錯誤）。
    if (idIdx === -1 || codeIdx === -1) continue;

    for (const row of parseValueRows(stmt, header.valuesStart)) {
      const idRaw = stmt.slice(row[idIdx].start, row[idIdx].end).trim();
      const codeLiteral = findQuotedLiteral(stmt, row[codeIdx].start, row[codeIdx].end);
      if (!codeLiteral) {
        throw new Error(`stations.code（id=${idRaw}）不是字串字面值，無法建立 players.account 推導需要的對照表。`);
      }
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
  const header = parseInsertHeader(stmt);
  if (!header) return stmt; // 不是 INSERT/REPLACE 陳述式，原樣通過

  if (CLEAR_TABLES.has(header.table)) return ""; // 整表清空：直接捨棄這筆 INSERT

  const columnRules = columnRuleLookup.get(header.table);
  if (!columnRules) return stmt; // 這張表沒有欄位規則，原樣通過

  return maskInsertStatement(stmt, header, columnRules, schemaColumns, stationCodeByStationId);
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
 * `maskValue.ts`）。
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
