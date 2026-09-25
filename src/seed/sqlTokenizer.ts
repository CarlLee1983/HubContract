/**
 * Issue #13 code review：字元級的 SQL 掃描邏輯（引號、括號深度）原本在
 * `sqlDumpMasker.ts` 裡重複了兩次（陳述式切割、VALUES tuple 解析各寫一份），
 * 且 `'a''b'` 這種用重複單引號跳脫的字串會被漏判。這裡統一成一份共用實作，
 * 給 `sqlDumpMasker.ts` 的每個掃描步驟共用。
 */

export interface SourceSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * 從 `start`（指向開頭引號本身）掃到對應的結尾引號，回傳結尾引號字元的 index。
 * 支援兩種跳脫寫法：反斜線跳脫（mysqldump 預設）與重複引號跳脫（`'a''b'`，
 * 標準 SQL 寫法，`--compatible=ansi` 或人工編輯過的 dump 可能出現）。
 * 反引號（identifier）只支援重複跳脫，不支援反斜線跳脫。
 */
export function skipQuoted(text: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < text.length) {
    if (quote !== "`" && text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === quote) {
      if (text[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i;
    }
    i++;
  }
  throw new Error(`SQL 解析失敗：從 index ${start} 開始的 ${quote} 引號字串沒有正常收尾`);
}

/** 找出與 `openIndex` 位置的 `(` 配對的 `)` 的 index（會跳過引號內的括號）。 */
export function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(text, i, ch);
      continue;
    }
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`SQL 解析失敗：index ${openIndex} 的 '(' 找不到對應的 ')'`);
}

/**
 * 依「頂層」逗號切割 `[start, end)` 這段文字（呼叫端負責先剝掉最外層括號），
 * 跳過引號字串與巢狀括號內的逗號。CREATE TABLE 的欄位定義列表、VALUES 裡一個
 * row 的欄位值列表、VALUES 裡一整批 row 的列表，都是同一種「頂層逗號分隔」
 * 結構，共用這個函式。
 */
export function splitTopLevelByComma(text: string, start: number, end: number): SourceSpan[] {
  const spans: SourceSpan[] = [];
  let depth = 0;
  let partStart = start;
  let i = start;

  while (i < end) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(text, i, ch) + 1;
      continue;
    }
    if (ch === "(") {
      depth++;
      i++;
      continue;
    }
    if (ch === ")") {
      depth--;
      i++;
      continue;
    }
    if (ch === "," && depth === 0) {
      spans.push({ start: partStart, end: i });
      i++;
      partStart = i;
      continue;
    }
    i++;
  }

  spans.push({ start: partStart, end });
  return spans;
}

/** 跳過前導空白、`-- ...` 行註解、`/* ... *\/` 區塊註解，回傳第一個有意義字元的 index。 */
export function skipLeadingTrivia(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }
    if (text[i] === "-" && text[i + 1] === "-") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (text[i] === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i = Math.min(i + 2, text.length);
      continue;
    }
    break;
  }
  return i;
}

/** 把 `[start, end)` 這段文字掐頭去尾（不含前後空白）。 */
export function trimSpan(text: string, start: number, end: number): SourceSpan {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  return { start: s, end: e };
}
