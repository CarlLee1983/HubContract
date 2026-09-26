import "./testEnv";
import { describe, expect, it } from "bun:test";
import path from "path";
import { findUnclassifiedEntries } from "../../src/seed/maskDatabase";
import { parseSchemaColumns } from "./helpers/parseSchemaColumns";

describe("Issue #13：findUnclassifiedEntries（白名單完整性檢查的純函式核心）", () => {
  it("表沒有出現在設定裡，列成未分類的表", () => {
    const columnsByTable = new Map([["mystery_table", ["id"]]]);
    const entries = findUnclassifiedEntries(columnsByTable, {});
    expect(entries.tables).toEqual(["mystery_table"]);
    expect(entries.columns).toHaveLength(0);
  });

  it("表有分類，但某個欄位沒列到，列成未分類的欄位", () => {
    const columnsByTable = new Map([["stations", ["id", "code", "new_column"]]]);
    const config = {
      stations: {
        columns: {
          id: { kind: "keep" } as const,
          code: { kind: "keep" } as const,
        },
      },
    };
    const entries = findUnclassifiedEntries(columnsByTable, config);
    expect(entries.tables).toHaveLength(0);
    expect(entries.columns).toEqual(["stations.new_column"]);
  });

  it("第四輪 code review 決議：欄位剛好叫 constructor/toString 時，不會被 `in` 的原型鏈誤判成已分類", () => {
    const columnsByTable = new Map([["stations", ["id", "constructor", "toString"]]]);
    const config = {
      stations: { columns: { id: { kind: "keep" } as const } }, // 故意不分類 constructor/toString
    };
    const entries = findUnclassifiedEntries(columnsByTable, config);
    expect([...entries.columns].sort()).toEqual(["stations.constructor", "stations.toString"]);
  });

  it("表設成 truncate 時，不需要逐欄位分類", () => {
    const columnsByTable = new Map([["sessions", ["id", "payload"]]]);
    const entries = findUnclassifiedEntries(columnsByTable, { sessions: { truncate: true } });
    expect(entries.tables).toHaveLength(0);
    expect(entries.columns).toHaveLength(0);
  });

  it("每一張表、每一個欄位都分類到時，回傳空清單", () => {
    const columnsByTable = new Map([["stations", ["id", "code"]]]);
    const config = {
      stations: { columns: { id: { kind: "keep" } as const, code: { kind: "keep" } as const } },
    };
    const entries = findUnclassifiedEntries(columnsByTable, config);
    expect(entries.tables).toHaveLength(0);
    expect(entries.columns).toHaveLength(0);
  });

  it("TABLE_CONFIG（真正在用的設定）對 seeds/mysql-schema.sql 裡的每一張表、每一個欄位都有分類（沒有遺漏）", () => {
    const schemaPath = path.join(import.meta.dir, "../../seeds/mysql-schema.sql");
    const columnsByTable = parseSchemaColumns(schemaPath);
    expect(columnsByTable.size).toBeGreaterThan(100); // 現在是 112 張表，抓一個寬鬆下限避免測試對表數太敏感

    const entries = findUnclassifiedEntries(columnsByTable);

    if (entries.tables.length > 0 || entries.columns.length > 0) {
      throw new Error(
        "src/seed/maskConfig.ts 的 TABLE_CONFIG 少分類了以下項目：\n" +
          [...entries.tables.map((t) => `  - 表：${t}`), ...entries.columns.map((c) => `  - 欄位：${c}`)].join("\n")
      );
    }
  });
});
