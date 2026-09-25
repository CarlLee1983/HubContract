# HubContract

StationHub 翻新的**可執行契約**。同一組情境（scenario）可以分別對 Legacy StationHub（Laravel）與 StationHubNext（Node）執行，用逐字比對判定兩者是否相容。

決策依據見 HubRefactoring 的 [ADR-0010](https://github.com/CarlLee1983/HubRefactoring/blob/main/docs/adr/0010-executable-contract-in-hubcontract.md)，規格見 [HubRefactoring#1](https://github.com/CarlLee1983/HubRefactoring/issues/1)。

## 契約涵蓋的四層

1. **入站回應**：HTTP status 與 body。
2. **DB 狀態變化**：寫入或更新了哪些資料列與欄位。
3. **出站呼叫**：送往遊戲線路與 SMS 供應商的 request，由 stub server 攔截並錄製。
4. **共享資源**：Redis key 與 TTL、Mongo `httplog_*` 等。Queue 不比對 payload，只比對 job 執行後的最終效果。

對外的 30 條路由比對全部四層；內部路由（後台、`dataapi`、`service` 等）只比對第 2、4 層。

## 運作方式

- **Runner**：用 Bun 加 TypeScript 寫，只依賴受測系統的 base URL。
  - `record`：對 Legacy 錄製預期結果。
  - `verify`：對任一受測目標比對預期結果。
- **錄製環境**：docker compose，內含 Legacy PHP、MariaDB 10.11.6、Redis、Mongo、線路 stub。每個情境執行前都重置為固定的種子資料。

## 資料安全

這個 repo 是公開的。fixture 與種子資料一律遮罩後才能提交；站台 `secret_key`、帳號、手機號碼全部使用合成值。

## 狀態

建置中。進度追蹤在 [HubRefactoring 的 issues](https://github.com/CarlLee1983/HubRefactoring/issues)（#2–#21）。
