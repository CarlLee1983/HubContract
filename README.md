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
- **錄製環境**：docker compose，內含 Legacy PHP (8.3 CLI)、MariaDB 10.11.6、Redis 7.2、Mongo 6.0。每個情境執行前都重置為固定的種子資料。

## 錄製環境操作指南

### 快速開始

```bash
# 一鍵啟動所有容器並重置至純淨合成種子狀態，自動驗證 GET /v1/server/status
npm run env:up
# 或直接執行
./scripts/env-up.sh

# 重置資料庫、Redis、MongoDB 回到純淨種子資料（等冪執行）
npm run env:reset
# 或直接執行
./scripts/env-reset.sh

# 停止並移除容器與網路
npm run env:down
# 或直接執行
./scripts/env-down.sh
```

### 契約測試與 Runner 操作

```bash
# 離線單元測試（schema、filter、report、signer、normalizer...），不需要錄製環境
bun test

# 含錄製環境的整合測試（Walking Skeleton、pilot 情境、MCP 情境、probe），
# 需要先 `npm run env:up`
HUB_CONTRACT_INTEGRATION=1 bun test

# 錄製單一情境（對 Legacy 執行並產出 golden fixture）
bun run record scenarios/wallet/check-transaction-deposit-hit.json

# 驗證單一情境是否符合契約（可對 Legacy 或 StationHubNext 執行）
bun run verify scenarios/wallet/check-transaction-deposit-hit.json

# 驗證整個 scenarios/ 目錄（預設路徑），輸出人類可讀報告到 stdout
bun run verify -t http://localhost:8080

# 只跑符合條件的情境：--route 與 --tag 皆可重複帶入多次（OR），兩者併用時是 AND；
# 不支援逗號分隔（例如 --tag a,b 會被當成單一 tag "a,b"）
bun run verify --route /v1/wallet/check-transaction --tag deposit --tag withdrawal

# 額外輸出機器可讀的 JSON 報告（見下方「JSON 報告格式」），可接進 StationHubNext CI 當上線閘門
bun run verify --report-json report.json
```

每個情境執行前都會重置一次錄製環境（`--skip-reset` 可關閉），符合「情境彼此獨立、結果可重現」的規格；重置或情境本身丟出的任何錯誤，都只會讓那一個情境變成 `errored`，不會中斷其餘情境。情境檔本身若無法通過 schema 驗證，也不會讓整個 process 中止——會以該檔案的路徑當作 `id`，變成一筆 `errored` 報告紀錄。篩選後若沒有任何情境符合條件，CLI 會印出錯誤訊息，仍然照常輸出（空的）報告，並以非 0 結束；只要有任何情境 `failed` 或 `errored`，或整批一個情境都沒跑到，process 就以非 0 結束。

### JSON 報告格式

`--report-json <path>` 輸出的檔案符合 `src/schema/report.ts` 匯出的 `ReportSchema`（zod），即使沒有任何情境符合篩選條件、或每個情境檔都載入失敗，也一定會寫出這份報告（CI 的上線閘門不該找不到報告檔）：

```jsonc
{
  "schemaVersion": 1,
  "mode": "verify", // 或 "record"
  "target": "http://localhost:8080",
  "startedAt": "2026-09-26T00:00:00.000Z",
  "finishedAt": "2026-09-26T00:00:05.000Z",
  "summary": { "total": 3, "passed": 1, "failed": 1, "errored": 1, "recorded": 0 },
  "scenarios": [
    {
      "id": "check-transaction-deposit-hit",
      "route": { "method": "POST", "path": "/v1/wallet/check-transaction" },
      "tags": ["wallet", "pilot", "deposit"],
      "status": "passed", // "passed" | "failed" | "errored" | "recorded"
      "differences": [
        { "layer": "inbound_response", "path": "body.data.amount", "expected": 100, "actual": 999 }
      ],
      "error": "..." // 只有 status === "errored" 時才有
    }
  ]
}
```

`status` 在 `verify` 模式下是 `"passed"` / `"failed"` / `"errored"`；在 `record` 模式下（沒有比對，只是錄製成功與否）是 `"recorded"` / `"errored"`——record 模式的成功不算 `"passed"`，避免和「跟 golden fixture 比對過」混淆。

`schemaVersion` 在這個形狀有不相容變更時才會遞增；StationHubNext 的 CI 上線閘門應該檢查 `schemaVersion`、`summary.failed === 0 && summary.errored === 0`，並且 `scenarios.length > 0`（一個情境都沒跑到——例如篩選條件打錯字——不該被當成「全部通過」）。

### 服務與連接埠配置

| 服務 | 內部連接埠 | 主機連接埠（預設） | 說明 |
| --- | --- | --- | --- |
| `legacy-app` | `8080` | `8080` | StationHub Legacy PHP 8.3 內建 Web Server |
| `mariadb` | `3306` | `33066` | MariaDB 10.11.6 (`stationhub_recording`) |
| `redis` | `6379` | `63799` | Redis 7.2-alpine |
| `mongo` | `27017` | `27018` | MongoDB 6.0 (`stationhub_recording`) |
| `mock-provider` | `8081` | `18081` | 線路／SMS 供應商 stub（Issue #8），控制 API 見下方 |

主機連接埠、docker network 子網段與 compose project name 都可由本機 `.env` 覆寫，見下一節。

### 同時跑多個隔離環境（例如多個 `git worktree`）

`docker-compose.yml`、`scripts/env-*.sh`、`src/config.ts` 都讀同一份設定：專案根目錄下的 `.env`（gitignored；docker compose 會自動載入做變數代入，Bun 執行 `bun test`／`bun run` 時也會自動載入到 `process.env`，腳本則在開頭手動 `source` 一次）。沒有 `.env` 時，各變數採用 `docker-compose.yml`／`src/config.ts` 裡寫的預設值（見上表）。

要在同一台機器上同時跑第二份錄製環境（例如另一個 issue 的 `git worktree`），複製 `.env.example` 成 `.env` 並調整：

```bash
cp .env.example .env
# 編輯 .env：COMPOSE_PROJECT_NAME、各服務的 *_PORT、SUBNET/GATEWAY、
# HUBCONTRACT_BASE_URL、HUBCONTRACT_STUB_URL 都要跟其他份環境不同，
# 避免 host port 衝突或 docker network 子網段重疊。
./scripts/env-up.sh
bun test
./scripts/env-down.sh
```

`HUB_MCP_ALLOWED_IPS`（Issue #7）會依 `GATEWAY` 由 `docker-compose.yml` 的 `legacy-app.environment` 注入，覆寫 `docker/.env.recording` 裡的預設值——Laravel 的 dotenv 不會覆寫已經存在的真實環境變數，所以這個注入是安全的（已於本機驗證：`docker exec <project>-legacy-app-1 printenv HUB_MCP_ALLOWED_IPS` 會顯示對應該專案 `GATEWAY` 的值，而不是 `.env.recording` 裡寫死的 `172.29.0.1`）。

### 線路 stub（Issue #8）

`mock-provider` 服務（`src/stub/server.ts`，node:http——`Bun.serve` 會丟掉 GET request 的 body）站在遊戲線路／SMS 供應商的位置，讓 `ContractRunner` 錄製並比對出站呼叫（契約第 3 層）。情境定義加上 `stub.script.matchers`（依 method、path、選填的 body 條件深層比對，見 `src/schema/scenario.ts`）即可描述線路該怎麼回應；method、path、query string、header、body 都會被記錄下來。

stub 是每個情境都必經的依賴，不論情境有沒有宣告 `stub` 欄位：`ContractRunner` 建構時如果沒給 `stubUrl` 會直接丟例外；`captureRun` 每次都會 reset 並載入腳本（沒有 `stub.script` 就載入空腳本），執行後一律檢查有沒有 unmatched 的出站呼叫。沒有任何 matcher 命中的請求會回 5xx，並讓 `record()`／`verify()` 直接判定情境失敗（Story 17），不論該情境原本在不在乎出站呼叫。

錄製進 golden fixture 時，出站呼叫只保留哪些 header 由情境自己宣告——`stub.outboundHeaderAllowlist`（預設 `["content-type","authorization"]`），而不是 runner 裡的全域寫死值；哪些 header 對契約有意義是隨情境而定的（例如某些平台靠 header 簽章）。

控制 API（`http://localhost:${MOCK_PROVIDER_PORT}`）：

| 端點 | 用途 |
| --- | --- |
| `PUT /__stub/script` | 載入這次情境的腳本（`ContractRunner` 在每次 record/verify 前呼叫） |
| `GET /__stub/requests` | 取回目標系統實際送出的出站呼叫，以及沒命中任何 matcher 的次數 |
| `POST /__stub/reset` | 清空腳本與已錄製的請求（`scripts/env-reset.sh` 每次重置都會呼叫） |

### 時區設定（Timezone）注意事項

> [!WARNING]
> 本錄製環境目前依據 local `.env` 預設設定時區為 `APP_TIMEZONE="Asia/Taipei"`。
> **正式生產環境的確切時區（UTC 或 Asia/Taipei）尚未完成實機查證**。
> 錄製資料時請留意時間戳記欄位（如 `created_at`、`updated_at`），待生產環境確認後若有差異需同步更新。

### 已知限制：`vendor/` 與 pinned commit 的 composer.lock 可能對不上

`legacy-app` 掛載的 `vendor/`（唯讀）來自 `STATIONHUB_REPO`（預設 `../StationHub`）工作區當下 `composer install` 產生的內容，**不是**從 `docker/legacy.commit` 記錄的 `LEGACY_COMMIT` 重新裝出來的。`scripts/env-up.sh` 只驗證「工作區已提交狀態（`HEAD`）的 `composer.lock`」與「pinned commit 的 `composer.lock`」是否一致（且要求工作區沒有未提交的 `composer.lock` 修改）；如果兩者不一致，`env-up.sh` 會大聲失敗並中止。

但即使這個檢查通過，也只保證「composer.lock 內容一致」，不保證 `vendor/` 目錄本身確實是依照那份 `composer.lock` 重新 `composer install` 出來的（例如工作區手動改過 `vendor/` 裡的檔案、或裝的時候用了不同的 composer 版本／平台）。這是已知限制：目前沒有自動化機制驗證 `vendor/` 本身的內容雜湊，只驗證了它「應該」對應的 lock 檔一致。若懷疑 `vendor/` 與 pinned commit 不符，最保險的做法是在 `STATIONHUB_REPO` 對著 pinned commit 的 `composer.lock` 重新執行一次 `composer install`。

### 本機流程：先 `verify` 再 `record`（2026-09-26 範圍調整）

> [!IMPORTANT]
> 原訂「CI 定期對 Legacy 錄製環境跑 `verify`」已取消（見 [HubRefactoring#12](https://github.com/CarlLee1983/HubRefactoring/issues/12) 的範圍調整）：Legacy 原始碼在私有 Azure DevOps，HubContract 是 public repo，在公開的 GitHub runner 上建置 Legacy 等於把公司程式碼搬上公開 runner。
>
> 因此這道防線改成**在本機、於 PR 提交前**手動執行：修改種子資料、normalizer 或情境後，先對 Legacy 執行 `bun run verify`（而不是直接 `bun run record` 覆蓋 fixture），確認目前的 fixture 仍然對得上 Legacy 的實際行為，再視需要用 `bun run record` 重新錄製並提交新的 fixture。CI（`.github/workflows/ci.yml`）只跑離線檢查（runner 單元測試、`scenarios/`／`fixtures/` 的 schema 驗證），不含 Docker、不需要任何 secrets，也不會碰錄製環境。代價：少了自動防線，改了種子卻忘記在本機重跑 `verify` 不會被 CI 擋下。

### CI（離線檢查）

`.github/workflows/ci.yml` 在 `push` 與 `pull_request` 時執行：安裝 Bun（`oven-sh/setup-bun`）、`bun install --frozen-lockfile`、`bun test`。預設（未設定 `HUB_CONTRACT_INTEGRATION=1`）只會跑離線的單元測試與 `scenarios/`／`fixtures/` 的 schema 驗證；需要錄製環境的整合測試（Walking Skeleton、pilot 情境、MCP 情境、DB/Redis probe）會被 `describe.skipIf` 跳過，只能在本機（`npm run env:up` 之後）用 `HUB_CONTRACT_INTEGRATION=1 bun test` 執行。

### 排程器（Scheduler）安全邊界

> [!IMPORTANT]
> 依據 ADR-0010 與 Issue #3 規格，**Legacy 排程器（`schedule:run`）絕對不常駐執行**。
> 如有特定測試情境需要觸發排程作業，必須在 runner 執行該情境時顯式手動觸發單次 Artisan command，不可掛載背景 daemon 避免造成非預期狀態副作用。

## 資料安全

這個 repo 是公開的。fixture 與種子資料一律遮罩後才能提交；站台 `secret_key`、帳號、手機號碼全部使用 100% 合成假資料（例如 `DEMO_STATION`、`synthetic_secret_key_...`、`synthetic_user_01`）。

`src/config.ts` 裡的 DB/Redis 連線預設值，以及 `docker/.env.recording` 的 `APP_KEY`，都是合成、非機密的本機錄製環境帳密（與 `docker-compose.yml` 定義一致），僅用於本機一次性、可拋棄的錄製環境，不對應任何真實環境的憑證。

## 狀態

建置中。進度追蹤在 [HubRefactoring 的 issues](https://github.com/CarlLee1983/HubRefactoring/issues)（#2–#21）。
