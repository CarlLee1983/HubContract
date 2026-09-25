import { MASK_RULES, buildMaskLookup, type MaskCategory, type MaskRule } from "./maskConfig";
import { maskValue } from "./maskValue";

/**
 * Issue #13：把 mysqldump 產出的 SQL 文字，依 `maskConfig.ts` 的規則做遮罩。
 *
 * 策略是「外科手術式」取代：只改動落在遮罩欄位上的字串常值本身，其餘所有
 * 文字（schema DDL、註解、`INSERT` 陳述式的排版、非遮罩欄位的值）逐字元保留，
 * 讓輸出盡量貼近原始快照、方便人工 diff。
 *
 * 不做的事：不重新排版整份 SQL、不嘗試理解每一種 mysqldump 語法（例如
 * `LOCK TABLES`、`SET` 系列），這些陳述式一律原樣通過。
 */

const INSERT_HEADER_RE = /^(\s*INSERT INTO\s+`([^`]+)`\s*\(([^)]*)\)\s*VALUES\s*)/i;

interface ValueToken {
  start: number;
  end: number;
}

interface ParsedRow {
  values: ValueToken[];
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
      const quote = ch;
      i++;
      while (i < n) {
        if (quote !== "`" && sql[i] === "\\") {
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          i++;
          break;
        }
        i++;
      }
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

  if (stmtStart < n) {
    statements.push(sql.slice(stmtStart));
  }

  return statements;
}

/**
 * 從 `VALUES` 之後開始解析每一列的欄位值範圍（起訖 index，相對於整個陳述式字串）。
 * 需要用括號深度追蹤，因為欄位值本身可能是 `NOW()`、`DATE_ADD(NOW(), INTERVAL 1 HOUR)`
 * 這類帶括號的函式呼叫。
 */
function parseValueRows(stmt: string, start: number): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const n = stmt.length;
  let i = start;

  while (i < n) {
    while (i < n && /\s/.test(stmt[i])) i++;
    if (stmt[i] !== "(") break;

    i++; // 消耗 row 開頭的 '('
    let depth = 1;
    const values: ValueToken[] = [];
    let valStart = i;

    while (depth > 0 && i < n) {
      const ch = stmt[i];

      if (ch === "'" || ch === '"') {
        const quote = ch;
        i++;
        while (i < n) {
          if (stmt[i] === "\\") {
            i += 2;
            continue;
          }
          if (stmt[i] === quote) {
            i++;
            break;
          }
          i++;
        }
        continue;
      }

      if (ch === "(") {
        depth++;
        i++;
        continue;
      }

      if (ch === ")") {
        depth--;
        if (depth === 0) {
          values.push({ start: valStart, end: i });
          i++;
          break;
        }
        i++;
        continue;
      }

      if (ch === "," && depth === 1) {
        values.push({ start: valStart, end: i });
        i++;
        valStart = i;
        continue;
      }

      i++;
    }

    rows.push({ values });

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
  quote: string;
  /** quote 內容（不含前後引號）在 token 內的起訖 index。 */
  contentStart: number;
  contentEnd: number;
}

/** 判斷一個欄位值 token 是不是字串常值；NULL、數字、`NOW()` 等回傳 null，維持原樣。 */
function findQuotedLiteral(token: string): QuotedLiteral | null {
  let i = 0;
  while (i < token.length && /\s/.test(token[i])) i++;
  const quote = token[i];
  if (quote !== "'" && quote !== '"') return null;

  const contentStart = i + 1;
  i++;
  while (i < token.length) {
    if (token[i] === "\\") {
      i += 2;
      continue;
    }
    if (token[i] === quote) {
      return { quote, contentStart, contentEnd: i };
    }
    i++;
  }
  return null; // 引號沒有正常收尾，理論上不會發生（parseValueRows 已保證配對）
}

function unescapeSqlString(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\\" && i + 1 < raw.length) {
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
    } else {
      out += raw[i];
    }
  }
  return out;
}

function escapeSqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function maskStatement(stmt: string, lookup: Map<string, Map<string, MaskCategory>>): string {
  const match = INSERT_HEADER_RE.exec(stmt);
  if (!match) return stmt; // 不是 INSERT 陳述式，原樣通過

  const header = match[1];
  const table = match[2];
  const columnsRaw = match[3];
  const maskCols = lookup.get(table);
  if (!maskCols) return stmt; // 這張表沒有需要遮罩的欄位

  const columns = columnsRaw.split(",").map((c) => c.trim().replace(/^`|`$/g, ""));
  const rows = parseValueRows(stmt, header.length);

  const edits: { start: number; end: number; text: string }[] = [];
  for (const row of rows) {
    row.values.forEach((tokenRange, colIndex) => {
      const column = columns[colIndex];
      const category = column ? maskCols.get(column) : undefined;
      if (!category) return;

      const token = stmt.slice(tokenRange.start, tokenRange.end);
      const literal = findQuotedLiteral(token);
      if (!literal) return; // NULL 或非字串型別，保留原值

      const rawContent = token.slice(literal.contentStart, literal.contentEnd);
      const original = unescapeSqlString(rawContent);
      const masked = maskValue(category, original);
      const replacement = `${literal.quote}${escapeSqlString(masked)}${literal.quote}`;

      edits.push({
        start: tokenRange.start + literal.contentStart - 1,
        end: tokenRange.start + literal.contentEnd + 1,
        text: replacement,
      });
    });
  }

  // 從尾端往前套用，才不會因為前面替換造成的長度變化影響後面的 offset。
  edits.sort((a, b) => b.start - a.start);
  let result = stmt;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

/**
 * 遮罩整份 mysqldump SQL 文字。同一份輸入、同一份規則，永遠產生同一份輸出
 * （決定性：合成值只由原值的 keyed hash 推得，見 `maskValue.ts`）。
 */
export function maskMysqlDump(sql: string, rules: readonly MaskRule[] = MASK_RULES): string {
  const lookup = buildMaskLookup(rules);
  return splitStatements(sql)
    .map((stmt) => maskStatement(stmt, lookup))
    .join("");
}
