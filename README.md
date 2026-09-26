# HubContract

StationHub 翻新的**可執行契約**。同一組情境（scenario）可以分別對 Legacy StationHub（Laravel）與 StationHubNext（Node）執行，用逐字比對判定兩者是否相容。

決策依據見 HubRefactoring 的 [ADR-0010](https://github.com/CarlLee1983/HubRefactoring/blob/main/docs/adr/0010-executable-contract-in-hubcontract.md)，規格見 [HubRefactoring#1](https://github.com/CarlLee1983/HubRefactoring/issues/1)。

## 契約涵蓋的四層

1. **入站回應**：HTTP status 與 body。
2. **DB 狀態變化**：寫入或更新了哪些資料列與欄位。
3. **出站呼叫**：送往遊戲線路與 SMS 供應商的 request，由 stub server 攔截並錄製。
4. **共享資源**：Redis key 與 TTL、Mongo `httplog_*` 等。Queue 不比對 payload，只比對 job 執行後的最終效果。

對外的 30 條路由具備四層觀測能力：HTTP 情境一律錄製入站回應、宣告的 DB 查詢結果，以及出站呼叫層（沒有呼叫時為空陣列）；Redis 只比對情境指定的 key，Mongo 只比對情境指定的 `httplog_*` 集合或 pattern。未宣告的 DB 表與 Redis key 不在該情境的比對範圍。內部動作與排程情境不錄製入站 HTTP 回應。

## 運作方式

- **Runner**：用 Bun 加 TypeScript 寫，只依賴受測系統的 base URL。
  - `record`：對 Legacy 錄製預期結果。
  - `verify`：對任一受測目標比對預期結果。
- **錄製環境**：docker compose，內含 Legacy PHP (8.3 CLI)、MariaDB 10.11.6、Redis 7.2、Mongo 6.0。每個情境執行前都重置為固定的種子資料。
- **非同步效果**：Runner 預設等待 `HubWalletSync`、`HttpLogging` 的待處理、執行中及延遲工作歸零，再讀出站呼叫和 DB／Redis／Mongo 最終狀態；情境可用 `queueDrain` 改指定 queue 與逾時。外部目標須提供自己的 queue adapter。逾時回報 `errored` 與 queue 計數。錄製環境啟動這兩個 worker。

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

# 內部動作：情境只寫 Platform／Game Type 與目標 active；Legacy adapter 負責後台登入
bun run verify scenarios/internal/platform-game-type-deactivate.json --adapter legacy
bun run record scenarios/internal/platform-game-type-deactivate.json --adapter legacy

# 客服聊天室：管理員加入／結案／訊息及 service 訪客訊息
bun run verify scenarios/internal/chatroom-admin-join.json --adapter legacy
bun run verify scenarios/internal/chatroom-admin-close.json --adapter legacy
bun run verify scenarios/internal/chatroom-admin-message.json --adapter legacy
bun run verify scenarios/internal/chatroom-service-message.json --adapter legacy

# 入金後等待 wallet sync／HTTP logging，並比對新增的 httplog_deposit
bun run verify scenarios/wallet/deposit-queued-sync.json

# 驗證整個 scenarios/ 目錄（預設路徑），輸出人類可讀報告到 stdout
bun run verify -t http://localhost:8080 --adapter legacy

# 只跑符合條件的情境：--route 與 --tag 皆可重複帶入多次（OR），兩者併用時是 AND；
# 不支援逗號分隔（例如 --tag a,b 會被當成單一 tag "a,b"）
bun run verify --route /v1/wallet/check-transaction --tag deposit --tag withdrawal

# 額外輸出機器可讀的 JSON 報告（見下方「JSON 報告格式」），可接進 StationHubNext CI 當上線閘門
bun run verify --report-json report.json
```

目錄、幣別與健康檢查的 Legacy 契約情境分別在 `scenarios/catalog/`、`scenarios/currency/`、`scenarios/server/`，可用 `--tag CAP-09`、`--tag CAP-14`、`--tag CAP-17` 只跑單一 Capability。這批情境使用 `HUB_SEED=synthetic` 的固定邊界資料：目錄包含 JDB 的 DB 維護旗標與 CQ9 的 Redis 維護 gate（`platformMaintenance` 前置條件由目標 adapter 建立）、孤兒 StationGameCompany、`game_type` 空陣列與非空物件；幣別包含已停用的全域匯率列。每個情境的 DB probe 只擷取列出的表與欄位；共享資源 probe 觀察 `httplog_*` 的新增文件，目錄情境另觀察指定平台的 Redis gate。`GET /v1/server/status` 本身不驗證簽章或必填欄位，但若請求提供未知 `station_code`，全域初始化仍會先回錯誤。

這 39 個情境的整合測試在每次重置後先 `record` 並比對 golden fixture，再重置並 `verify`；遊戲目錄與匯率列表另各做兩次重置錄製，檢查結果可重現。Redis gate 的 TTL 允許情境宣告的秒數誤差。新增或修改情境時仍需在本機 Legacy 環境重新錄製 fixture，並執行整合測試。

內部動作 fixture 只記錄 DB 與共享資源，不記錄後台 HTTP 回應。此情境比對 `platforms`、`platform_game_type_map`、`activity_log` 及宣告的 Redis key；`platform_game_type_map` 的前置查詢必須列出該 Platform 的**全部**關聯，Legacy adapter 才能在 `sync` 時保留未切換的 Game Type。目前固定 Legacy schema 沒有 `games.platform_id`／`games.authorized`，因此不以切換 `platforms.active` 作為錄製動作。後台登入使用公開合成種子的 `super` 管理員；Legacy HTTP 埠只綁定本機 loopback。

客服聊天室的四個內部動作情境只宣告 issue ID 與訊息內容，Legacy adapter 將其轉成後台或 `POST /service/chatroom/messages` 的呼叫。錄製環境啟動固定 Legacy 套件的 GatewayWorker，讓 join 和訊息送出能走完原路徑；GatewayWorker 群組／傳送狀態是否納入契約由 [HubRefactoring#43](https://github.com/CarlLee1983/HubRefactoring/issues/43) 決定。固定 Legacy 的 service 建立 issue handler 缺少被呼叫的方法，且凍結的 `users` 表沒有登入密碼欄位，因此合成 seed 預先建立訪客 issue；錄製專用 helper 透過 Laravel session 設定 `user_guest`，動作仍由 Legacy HTTP handler 執行。四個情境皆宣告 `service_issues_administer_map`、`service_issues`、`chat_room_messages`、`activity_log` 與 Redis／Mongo probe；管理員登入會在 `activity_log` 留下一筆紀錄，訪客訊息則無紀錄。

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
| `gateway-worker` | `6001` | `6001`（僅本機 loopback） | 客服聊天室動作的 Legacy GatewayWorker 錄製服務 |
| `hub-wallet-sync-worker` | — | — | 消化 `HubWalletSync` queue |
| `http-logging-worker` | — | — | 消化 `HttpLogging` queue，寫入 Mongo `httplog_*` |

本機 Legacy 的 `queueDrain` 使用 Redis DB 1 與 `REDIS_PREFIX`（預設 `hub_recording:`）。驗證其他受測目標時，`-t` 必須搭配 `--queue-drain-adapter ./path/to/adapter.ts`；該模組匯出 `createQueueDrain({ targetUrl })`，回傳有 `waitForIdle(queues, timeoutMs)` 與 `close()` 的物件。程式呼叫 runner 時也可直接傳入 `queueDrain`。這讓等待訊號來自實際受測目標，不會因本機 Legacy queue 為空而提前比對。`mongoProbe.pattern: "httplog_*"` 會觀察所有符合的集合，只記錄情境期間新增的文件；fixture 不包含 Mongo `_id` 與 queue payload。

Redis 探針可為會隨執行時間減少的 key 宣告 `ttlExpectedSeconds`，讓 `record` 的 fixture 固定寫入該秒數；錄製時若實際 TTL 超出 `ttlToleranceSeconds` 範圍便報錯。`verify` 仍讀取實際 TTL 並檢查同一範圍，key 是否存在、型別和值仍逐項比對。

Queue 等待失敗後，runner 會把同批後續情境標成 `errored`，停止重置錄製環境；先停止仍在執行的 worker，再重置後重新執行。

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

後台登入頁需要 Vite manifest；錄製環境唯讀掛載 `docker/admin-build/manifest.json` 供 Laravel 渲染登入頁。adapter 不載入前端資產，內部動作的前端畫面與 HTTP 回應不在契約內。

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

### 排程情境：`remittance.retry`（Issue #10）

`scenarios/schedule/remittance-retry.json` 使用 `trigger: {"kind":"schedule","name":"remittance.retry"}`，不含 Artisan 指令。情境的 `setup.statements` 由目標 adapter 在每次重置後加入一筆合成的未完成匯款；runner 先擷取 DB 與 stub 狀態，再交給目標 adapter 觸發一次排程，最後擷取匯款單、錢包、交易與出站呼叫。排程情境沒有 HTTP 回應層。Golden fixture 是在 Legacy 錄製環境實際執行後產生的。

Legacy adapter 只接受已映射的名稱，並以單次 `docker compose exec -T legacy-app php artisan remittance:retry` 執行；不呼叫 `schedule:run`。CLI 只在沒有指定 `--target`、且最終目標 URL 等於本機 `http://localhost:${LEGACY_PORT:-8080}` 時自動選擇 Legacy adapter。因此預設本機錄製環境可直接跑 `bun run verify`；若 `HUBCONTRACT_BASE_URL` 指向 StationHubNext 或其他目標，即使沒有 `--target` 也不會觸發本機 Legacy。明確指定 `--target` 時，排程情境須用 `--adapter legacy` 指向本機錄製環境；Legacy adapter 與其他 URL 的組合會拒絕執行：

```bash
bun run verify scenarios/schedule/remittance-retry.json
bun run record scenarios/schedule/remittance-retry.json
# 明確指定 Legacy target 時：
bun run verify scenarios/schedule/remittance-retry.json --target http://localhost:8080 --adapter legacy
HUB_CONTRACT_INTEGRATION=1 bun test tests/schedule.test.ts
```

新目標需在程式端提供實作 `TargetAdapter.triggerSchedule(name)` 的 adapter，並保持同一個中立名稱；在此之前，指向新目標的排程情境會明確報錯。`activity_log` 探針從每次重置後的空表擷取本次排程產生的紀錄，只選穩定的事件欄位與 JSON scalar，不錄製自動遞增 ID、時間戳或原始 JSON 字串。排程 fixture 一律宣告出站呼叫層（即使呼叫清單為空），讓新增的出站呼叫也能被比對。此情境目前使用 synthetic seed 的固定錢包 ID；snapshot 模式需要另外核對其前置資料。

## 資料安全

### SMS 契約情境（Issue #18）

`scenarios/sms/` 涵蓋列表、更新、發送、餘額四條路由，各路由包含驗證失敗、簽章失敗與未知站台；餘額另涵蓋 Chuanx、Asmsc、AboSend 的成功及供應商故障。錄製環境的 `SMS_TEST=false` 只用於本機 Legacy 容器；種子資料中的供應商 URL 全部指向 `mock-provider:8081`，憑證和電話都是合成值。可用 `bun run record scenarios/sms` 錄製，並以 `bun run verify scenarios/sms` 驗證。

Legacy 實際錄製顯示：一般 `/v1/sms/send` 請求未帶 `currency` 時，`siteCurrency()` 為 null，解析電話先產生 500，尚未走到供應商；對應 `send-without-currency`。另外三個發送情境在簽章請求中帶 `currency=TWD`，讓路由初始化幣別以觀察更深的流程：inactive SMS 未被拒絕、供應商建 log 時的未初始化屬性 500、Asmsc 在該 500 前先呼叫 `GetSenderIDList`，以及預先佔用 Redis DB1 的 cache lock 時回傳重送錯誤。這些是錄製環境的現行行為，並非建議新版維持缺陷。`/amount` 的供應商 500 則被 Legacy 吞掉，回應餘額 0。

SMS fixture 含合成供應商憑證，因 Legacy 的列表資源和出站呼叫原樣帶出設定。鎖定情境只宣告手機的 national number，由 Legacy 前置條件 adapter 依錄製環境的 cache prefix 建立 Redis lock。500 回應的 `file` 和 `trace` 以逐欄位 normalizer 遮罩，錯誤訊息和其他欄位仍逐字比對。

指定其他目標的 `-t` 時，鎖定情境需同時提供 `--precondition-adapter ./path/to/adapter.ts`；該模組匯出 `createPreconditionAdapter({ targetUrl })`，回傳有 `apply(preconditions)` 方法的 adapter。未提供時會明確失敗，不會替其他目標寫入 Legacy 的 Redis key。AboSend 的動態 `rand` 和 `sign` 由 stub 重新計算 MD5 驗證後才套用欄位 normalizer。

這個 repo 是公開的。fixture 與種子資料一律遮罩後才能提交；站台 `secret_key`、帳號、手機號碼全部使用 100% 合成假資料（例如 `DEMO_STATION`、`synthetic_secret_key_...`、`synthetic_user_01`）。

`src/config.ts` 裡的 DB/Redis 連線預設值，以及 `docker/.env.recording` 的 `APP_KEY`，都是合成、非機密的本機錄製環境帳密（與 `docker-compose.yml` 定義一致），僅用於本機一次性、可拋棄的錄製環境，不對應任何真實環境的憑證。

### 從測試站快照產生基準種子（Issue #13）

手寫的 `seeds/synthetic-seed.sql` 涵蓋 Pilot 與目前的合成契約情境。要涵蓋更多真實資料組合時，改用「真實測試站快照經過遮罩」產生的基準種子。

#### 為什麼是「起一個真的資料庫」而不是自己寫 SQL parser，為什麼是白名單而不是黑名單

這是這個功能第三次被 code review 打回票，前三輪都在同一種地方找到漏網：自己寫的 mysqldump 語法解析器有某種寫法沒認出來（不加引號的表名、`db`.`table`、`ON DUPLICATE KEY UPDATE`、`#` 註解……），或是「哪些表/欄位要遮」的清單漏了某一個（`note`、`settings.val`、fixture 裡寫死的 id）。SQL 語法的變化型態跟一份 100+ 張表的 schema 有多少個敏感欄位一樣，都是「幾乎數不完，只能不斷追著已知漏洞跑」的黑名單問題。

現在的做法反過來解決兩件事：
1. **解析交給真正的 MariaDB**：腳本起一個拋棄式 MariaDB 容器（`src/seed/dockerMariaDb.ts`，image/tag 跟 `docker-compose.yml` 的 `mariadb` service 釘死同一版本），把快照的原始 bytes 直接灌進容器內的 `mariadb` CLI，不在 Node/Bun 這邊解析或改寫任何一行 SQL。合法的 SQL，不管是什麼語法變體，MariaDB 都認得；我們只在資料庫「裡面」用 `SELECT`/`UPDATE`/`TRUNCATE` 做遮罩，最後用固定參數的 `mysqldump` 匯出。容器名稱、連接埠都跟錄製環境分開，兩者互不影響；跑完（不管成功或失敗）一定 `docker stop` 清掉，不留孤兒容器——包含腳本執行中按 Ctrl+C（`SIGINT`）或被 `SIGTERM`（例如 CI 逾時砍行程）的情況，也會先清掉容器再結束；`docker stop` 本身失敗時會直接拋錯，不會默默吞掉讓你以為清乾淨了。
2. **白名單，不是黑名單**：`src/seed/maskConfig.ts` 的 `TABLE_CONFIG` 對照 `seeds/mysql-schema.sql`（112 張表、1075 個欄位）逐一分類成 `keep`/`mask:<category>`/`null`/`fixed`/`mask_json`/`derive_player_account`，或整表 `truncate`。遮罩前會先查「載入後的資料庫」的 `information_schema`（不是凍結的 schema 檔——這樣測試站快照如果比 `seeds/mysql-schema.sql` 多出表或欄位，也會被抓到），任何一個表或欄位在 `TABLE_CONFIG` 裡找不到分類，就列出全部後直接 throw、不遮罩任何東西。漏分類一個欄位，遮罩腳本會拒絕執行；黑名單漏一個欄位，遮罩腳本會「成功」但外洩。JSON 欄位內部的鍵名判斷也是同一個原則的白名單版本（見下方）——鍵名黑名單/敏感字集合一樣列不完，第四輪 review 已經在這裡踩到跟 SQL parser 一樣的坑（`appkey`/`md5key`/`mch_id`/`pin` 這些真正的憑證/個資鍵名沒被黑名單抓到而外洩）。

除了「哪些欄位安全」，資料庫裡「有沒有會在遮罩過程中被觸發、或讓輸出跟實際內容對不上」的東西也要檢查：載入後如果發現有 trigger／stored procedure／function／event／view，或是快照帶了 `CREATE DATABASE`/`USE` 切到別的 schema，一律直接 throw（第四輪 code review 用探針證實過：trigger 可以在遮罩用的 `UPDATE` 執行時被觸發，把 `OLD.account` 這類原始值寫進另一張表；`USE` 切換後資料實際上沒寫進目標資料庫，遮罩腳本卻會「成功」跑完產出一份空種子）。這些狀況沒辦法自動判斷安全與否，需要人工處理，不會嘗試繞過或警告了事。

1. **取得快照**：由人（不是 agent）用 `mysqldump` 對測試站資料庫產生快照，存成 `.sql` 或 `.sql.gz`。**這份原始檔含真實的站台 `secret_key`、帳號、手機號碼、姓名、email 等個資，絕對不能放進這個公開 repo**——建議存在 repo 目錄外（例如自己的 `~/Downloads` 或任何 scratch 目錄），只把路徑傳給下一步的腳本。
2. **設定 `MASK_HMAC_KEY`**：遮罩用 HMAC-SHA256 把原值決定性地轉成合成值，key 從環境變數 `MASK_HMAC_KEY` 讀，沒設就直接 throw（不提供預設值）。這把 key 本身不是遮罩後資料的機密（遮罩後的種子已經公開），但如果外流，別人可以拿一個「已知的原始值」自己算出遮罩後長怎樣，等於能反查特定帳號/手機是否在快照裡出現過——所以不要寫死在程式碼或提交進 repo，本機留著（例如 shell profile 或不會進版控的 `.env`）就好。**同一份快照要重跑出「同樣」的種子，前提是每次都用同一把 key**，換 key 等於重新生成一套完全不同的合成值。
   ```bash
   export MASK_HMAC_KEY="<自己挑一個固定字串，不要提交進 repo>"
   ```
3. **跑遮罩腳本**（需要本機有 `docker`）：
   ```bash
   bun run seed:mask <你的快照路徑.sql|.sql.gz> seeds/snapshot-seed.sql
   ```
   腳本依 `src/seed/maskConfig.ts` 的 `TABLE_CONFIG` 做幾件事：
   - **換成合成值**：站台 `secret_key`、各表的帳號欄位（含 `players.account`——這欄位常見格式是 `使用者帳號 + 站台代碼 + p + 平台 id` 組出來的，遮罩時只換使用者帳號那一段、站台代碼與平台 id 保留明文，才不會破壞這個推導關係，見 `LobbyAbstract::getFormattedPlayerAccount()`；不符合這個格式的（主平台直接存 `users.account`、Mg/Pinnacle 之類直接存供應商值、Sa 是小寫化再接雜湊後綴）退回當一般帳號字串整串遮罩，不會 throw）、需實名登記的姓名欄位、`administers.email`、加密貨幣錢包地址。合成值由原值做 keyed hash 決定性推得（見 `src/seed/maskValue.ts`）——同一份快照重跑會得到逐位元組相同的輸出，同一個原值不管出現在哪張表都會映射到同一個合成值，藉此保留資料間的關聯。**目前沒有手機號碼欄位被遮罩**——原本設想遮 `sms_logs.phone`，但 `sms_logs` 整表都清空了（見下方），`phone` 這個遮罩類別已經沒有任何欄位在用，直接從程式碼移除，不留死碼。
   - **換成固定值 / 清成 NULL**：`administers.password` 統一換成 `seeds/synthetic-seed.sql` 用的那組合成 bcrypt 雜湊；`administers.remember_token`／`last_login_token`／`last_login_ip`、`players.vendor_player_id`、`betting_logs.raw_data` 清 `NULL`；`payments.api_url` 換成 stub 位址。
   - **JSON 欄位**（`platforms.api_settings`、`payments.api_tokens`、`sms.settings`、`settings.val` 這四個——情境/stub 實際會依內容組出對外請求，或是內容結構完全不固定，遮罩後仍要是合法 JSON）：**白名單**，不是鍵名黑名單。每個欄位在 `TABLE_CONFIG` 裡自己宣告一份「可以原樣保留的鍵名」清單（`keep`，依 `.legacy-src` 實際讀取的非敏感鍵，例如 `platforms.api_settings` 的 `lang`/`dc`），或是「要換成 stub 的 URL 鍵」（`url`，例如 `api_url`）；**沒列在白名單裡的鍵，不管值是字串還是數字，一律遮罩**（字串換成合成字串、數字換成合成數字，型別不變），只有布林值和 `null` 原樣保留。`payments.api_tokens`、`settings.val` 這兩個欄位整欄都是憑證或無固定 schema 的任意內容，白名單是空的（等於全遮）。陣列元素繼承父鍵名脈絡（`{"token":["A","B"]}` 兩個元素都當 token 處理）；字串值本身又能解析成 JSON 物件/陣列就遞迴處理（雙重編碼，不因為外層鍵在白名單裡就整段信任，遞迴進去後看到的鍵名脈絡歸零）。白名單只認 JSON 結構的**頂層**鍵名，巢狀同名鍵不會被誤判成頂層的白名單鍵。**字串值只要長得像 `http(s)://` URL，不管鍵名有沒有在白名單裡（連標成 `keep` 的鍵都一樣），一律換成 stub**——每個平台/供應商叫端點的鍵名不一樣（`api_url`、`backoffice_api_url`……），要求每一個都手動列進白名單容易漏，用值的形狀判斷更不容易漏掉。
   - **純回應／紀錄用的 blob 欄位清成 NULL**（不是「設定」、是 Legacy 存下來的第三方回應原文或使用者自由輸入內容，遮罩內部結構沒意義）：任何欄名符合 `note`/`memo`/`remark`/`summary`/`content`/`body`/`description`/`reason`/`message`/`comment`/`raw`/`response`/`request`/`payload`/`log`/`receipt`/`snapshot`/`reply`/`answer` 這類自由文字樣式的欄位（例如 `withdrawal_records.note`、`deposit_records.note`、`remittance_records.note`、`risk_events.note`、`user_events.note_user`/`note_inner`、`commission_withdraws.{receipt_data,trade_response_data,trade_error_reason,txn_data}`、`payment_history_records.response_data`、`payment_deposit_options.txn_data`、`payment_withdrawal_options.txn_data`、`service_issues.{summaries,answer}`），一律清成 `NULL`（這幾欄在 schema 裡都是 `DEFAULT NULL`，不需要用 `'{}'`/`''` 代替）。使用者自己填的顯示名稱/簡介（`guilds.name`/`intro`、`user_crypto_wallets.name`）也不算業務代碼，`name` 是 `NOT NULL` 換成合成名稱、`intro`/使用者自訂的錢包暱稱直接清 `NULL`。
   - **整表清空**（`sessions`、`personal_access_tokens`、`password_reset_tokens`、`failed_jobs`、`activity_log`、`sms_logs`、`chat_room_messages`、`login_logs`、`user_login_logs`、`pulse_aggregates`、`pulse_entries`、`pulse_values`、`job_batches`、`schedule_logs`、`report_logs`、`migrations`）：情境不會用到，內容又可能夾帶使用者敏感資料、內部堆疊資訊，或是格式完全不受控的遙測資料（Laravel Pulse），乾脆不把這些表的資料列寫進遮罩後的種子。`migrations` 是第四輪 code review 才發現的必要項目：凍結的 `seeds/mysql-schema.sql` 本身已經內建一份完整的 128 列 migrations 資料（`env-reset.sh` 第一步就會載入），遮罩後的種子如果還帶自己的一份，載入時會撞主鍵 duplicate entry。
   - **白名單完整性檢查**：資料庫裡（依 `information_schema`，不是凍結的 schema 檔）的每一張表、每一個欄位都必須在 `TABLE_CONFIG` 裡有分類，找不到就列出全部後直接 throw；`_binary`/`0x...` 之類無法安全解析成字串字面值的值也會擋下來，不會猜測著繼續跑。`players.account` 是唯一的例外：格式對不上「使用者帳號 + 站台代碼 + p + 平台 id」的推導公式時**不會 throw**，退回當一般帳號字串整串遮罩（主平台直接存 `users.account`、部分廠商直接存供應商值，本來就有好幾種合法格式）。
   - **每一句 INSERT 輸出時都帶明確欄位列表**：`mysqldump --complete-insert` 保證的，不用自己重組 SQL。這樣測試站實際的欄位物理順序跟凍結 schema 不一樣時，MySQL 靠欄位名稱對齊值，不會把值插進錯的欄位。
   - **輸出不含 `CREATE TABLE`/trigger**：`mysqldump --no-create-info --skip-triggers`，schema 一律以凍結的 `seeds/mysql-schema.sql` 為準（`env-reset.sh` 一定先載入它）。
   - `TABLE_CONFIG` 裡沒有列出來的表/欄位——不存在這種狀態：白名單完整性檢查會在遮罩前就 throw，逼你先幫新表/新欄位分類，不會有「沒處理過的欄位就當作安全放行」的空隙。
   - **每一筆遮罩 UPDATE 都斷言剛好改到一列**：全程用同一條專屬連線（不走 pool），連線開 `supportBigNumbers`/`bigNumberStrings`，主鍵是超出 JS number 安全整數範圍的 `BIGINT` 時也不會因為精度捨入而配不到列、悄悄變成 no-op（已用探針證實）；連線也強制設成嚴格 `sql_mode`，快照如果帶了 `SET GLOBAL sql_mode=''` 也不會讓遮罩值被靜默截斷。`ON UPDATE CURRENT_TIMESTAMP` 的欄位遮罩時會一併設回自己原本的值，不會被 UPDATE 悄悄改成現在時間。
4. **輸出位置**：遮罩後的種子固定寫到 `seeds/snapshot-seed.sql`（已遮罩，可以提交）。
5. **切換 `env-reset.sh` 使用的種子**：用 `HUB_SEED` 環境變數明確指定，不是自動偵測（兩個 checkout 用同一個 commit，卻因為「誰本機有沒有跑過 seed:mask」重置出不同資料，會讓錄製結果不可靠）：
   ```bash
   # 預設，跟原本行為一樣：
   npm run env:reset
   # 或明確指定：
   HUB_SEED=synthetic npm run env:reset

   # 改用遮罩後的快照（seeds/snapshot-seed.sql 不存在就直接失敗，不會默默 fallback）：
   HUB_SEED=snapshot npm run env:reset
   ```
   `HUB_SEED=snapshot` 時，`env-reset.sh` 會在載入 `seeds/snapshot-seed.sql` 之後，再疊上 `seeds/scenario-baseline.sql`——這份 overlay 用 `INSERT ... ON DUPLICATE KEY UPDATE`（不 TRUNCATE）補回 `scenarios/*.json`、`fixtures/*.json` 依賴的固定業務資料（`DEMO_STATION`、`TRADE_DEP_001` 之類），id 統一落在 `900000000` 以上以避開真實快照的資料列，細節見該檔案開頭的註解。

   關於 overlay 的 `platforms`：這張表沒有 `name` 的 unique key，真實快照如果本來就有一列 `name='cq9'`，遮罩後會跟 overlay 自己的 `cq9` 並存（兩個 id 都存在）。查過 `.legacy-src` 目前唯一有實作、且這個 repo 的情境會用到的兩條路由——`POST /v1/wallet/check-transaction`（`WalletController::checkTransaction()`，只查 `stations`、`deposit_records`/`withdrawal_records`）與 MCP `platform-maintenance`（`McpPlatformMaintenanceController` -> `TemporaryPlatformMaintenanceService`，用 `PlatformEnum` 常數 + Redis，不查 DB）——**都不會依 `name` 或 `is_main` 查 `platforms` 表**，`wallets.platform_id` 是我們 overlay 自己控制的固定值，不受並存的 `cq9` 影響。之後如果加了會查 `Platform::where('name', ...)` 或 `where('is_main', 1)->first()` 的內部路由情境，需要重新評估這個假設。

### 不遮罩的欄位（查過 `.legacy-src`，不是漏掉）

- **`stations.callback_domain`**：一開始猜是「打給站台的回呼網域」該換成 stub，查證後發現 Legacy 自己的 ADR-0040（`.legacy-src/docs/adr/0040-game-wallet-balance-single-authority.md`）明講：「`stations.callback_domain` 存在於 `Station::$fillable`，但全 codebase 沒有任何地方讀它」——不是出站呼叫的目標，Legacy 根本不會打這個網域，不需要換成 stub。維持原樣。
- **`settings.val`**：翻了 `app/Http/Resources/Settings*Resource.php` 一輪（`SettingsWithdrawalBasicResource`、`SettingsCommissionResource`、`SettingsRiskWinRateResource`、`SettingsPlatformGeneralResource`⋯），大部分 `name` 存的是提款限額、佣金比例、風控閾值這類業務設定，但也有 `site_google_recaptcha`（`server_token`）、`site_contact`（`email`/`tel`）這種明確含機密/個資的 `name`，而且 `val` 沒有固定 schema、無法針對每個 `name` 個別設定——改成 `mask_json`（見上方），白名單是空的，所以**每一個 `name` 底下的每一個值都會被遮罩**，不是原樣保留。這代表如果之後有情境要依賴某個 `settings.val` 裡的實際數值（例如某個提款限額常數），需要先把那個 `name`／鍵名加進 `platforms.api_settings`/`payments.api_tokens`/`sms.settings`/`settings.val` 的白名單（`src/seed/maskConfig.ts` 的 `maskJson({...})`），不會自動被放行。
- **guild/user_level 相關的 JSON 快照欄位**（`guilds.settings`、`user_level_records.{settings,upgrade_condition,renewal_condition,rebates}`、`user_level_settings.{upgrade_condition,renewal_condition,rebates}`、`payments.{maximum_trades,current_trades,period}`、`platforms.{currencies,regions,game_types}`、`flatten_rebate_reports.data`）：翻過對應的 schema comment，都是遊戲規則/等級條件/報表聚合這類業務設定快照，不是個資或第三方回應原文，分類為 `keep`。這批是自動化分類規則沒攔到、人工複查後確認安全的項目，跟上面明確查證過 Legacy 程式碼的兩項不同等級，列在這裡是為了讓後續複查者知道「已經看過、不是漏掉」。

### snapshot 模式的已知限制：哪些 fixture 需要重新 `record`、哪些情境目前不能用

`fixtures/*.fixture.json` 目前是對 **synthetic 模式**（`HUB_SEED=synthetic`，`seeds/synthetic-seed.sql` 的固定 id）錄製的。`scenario-baseline.sql` overlay 為了不跟真實快照的資料列衝突，id 統一落在 `900000000` 以上，所以任何 fixture 裡直接寫死數字 id 的欄位，在 `HUB_SEED=snapshot` 模式下對得上的機率是零。目前有以下兩種限制：

- **只是 fixture 裡的 golden 結果寫死了 id，情境本身用業務代碼查資料**：`check-transaction-both-hit`、`check-transaction-deposit-hit`、`check-transaction-duplicate-trade-no`、`check-transaction-withdrawal-hit` 這四個 fixture 的 `dbProbe` 結果裡有 `user_id: 1`；情境的 `request`/`dbProbe.sql` 本身查的是 `station_code`/`trade_no` 這類業務值（不是數字 id），所以 `scenario-baseline.sql` overlay 補的資料列在 snapshot 模式下查得到、`verify` 會拿新的 id 跑，只是跟這些寫死 `user_id: 1` 的舊 fixture 對不起來。Issue #16 的十七個 `funds-write` fixture 也錄下交易的 `model_id`、`wallet_id` 與 `activity_log.subject_id`，這些數字會隨 seed 改變，需重新錄製。真的要在 snapshot 模式下驗證，需要先有真實快照、跑過 `bun run seed:mask`、`HUB_SEED=snapshot` 重置環境，再對 Legacy 重新 `record` 一次，產生對應 `900000000+` id 的新 fixture。這次沒有真實快照可以錄，所以現有 fixture 沒有被動過，synthetic 模式的驗證行為也完全不變。
- **情境本身（不只是 fixture）就寫死了數字 id，snapshot 模式下重新 `record` 也沒用**：Issue #8 的 `scenarios/player/player-balance-outbound-{success,error,timeout}.json` 的 `dbProbe.sql` 直接寫 `platform_id = 3`、`user_id = 1`。Issue #15 新增的 `player-create-*.json` 查詢固定 `station_id = 1`、`platform_id = 1`；`player-query-*.json` 查詢固定 `user_id = 1`、`station_id = 1`、`platform_id = 3`；`player-balance-no-play-log.json` 查詢固定 `station_id = 1`、`user_id = 2`。Issue #16 新增的十個 `balance-difference-*.json` 情境以 `user_id=1` 查 `play_logs`，十個 `check-transaction-for-test-*.json` 情境也以 `user_id=1` 查 `transactions`；這些 read 情境要先改成業務識別查詢，才能在 snapshot 模式重新錄製。`player-create-*.json` 還依賴 synthetic seed 的完整既有會員資料：overlay 雖有 `synthetic_user_02` 的 user 和 TWD 主錢包，卻沒有它的 MAIN Player、USD/PHP 主錢包；`synthetic_user_03` 及其兩筆 MAIN Player 也未加入 overlay。其餘 Issue #15 的 `player-balance-{signature-failed,unknown-station,validation-failed}.json` 雖無固定 id 的 dbProbe，fixture 仍是 synthetic 模式的錄製結果，尚未在 snapshot 模式驗收。`scenario-baseline.sql` 補回的資料列使用 `900000000+` id；例如 sbo 的 `platform_id` 是 `900000003`，上述固定 id 查不到對應資料。目前沒有真實快照可用來重新錄製並驗收 Issue #15 的 Player 情境，因此這些情境**不宣稱支援 snapshot 模式**；需在取得快照後調整查詢、補足基準資料並重新 `record`、`verify`。

## 狀態

建置中。進度追蹤在 [HubRefactoring 的 issues](https://github.com/CarlLee1983/HubRefactoring/issues)（#2–#21）。
