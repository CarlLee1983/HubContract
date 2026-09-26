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

### 從測試站快照產生基準種子（Issue #13）

手寫的 `seeds/synthetic-seed.sql` 只夠撐 Pilot 的 8 種情境。要涵蓋更多路由時，改用「真實測試站快照經過遮罩」產生的基準種子。

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
   - **JSON 欄位**（`platforms.api_settings`、`payments.api_tokens`、`sms.settings`、`settings.val` 這四個——情境/stub 實際會依內容組出對外請求，或是內容結構完全不固定，遮罩後仍要是合法 JSON）：**白名單**，不是鍵名黑名單。每個欄位在 `TABLE_CONFIG` 裡自己宣告一份「可以原樣保留的鍵名」清單（`keep`，依 `.legacy-src` 實際讀取的非敏感鍵，例如 `platforms.api_settings` 的 `lang`/`dc`），或是「要換成 stub 的 URL 鍵」（`url`，例如 `api_url`）；**沒列在白名單裡的鍵，不管值是字串還是數字，一律遮罩**（字串換成合成字串、數字換成合成數字，型別不變），只有布林值和 `null` 原樣保留。`payments.api_tokens`、`settings.val` 這兩個欄位整欄都是憑證或無固定 schema 的任意內容，白名單是空的（等於全遮）。陣列元素繼承父鍵名脈絡（`{"token":["A","B"]}` 兩個元素都當 token 處理）；字串值本身又能解析成 JSON 物件/陣列就遞迴處理（雙重編碼，不因為外層鍵在白名單裡就整段信任，遞迴進去後看到的鍵名脈絡歸零）。白名單只認 JSON 結構的**頂層**鍵名，巢狀同名鍵不會被誤判成頂層的白名單鍵。
   - **純回應／紀錄用的 blob 欄位清成 NULL**（不是「設定」、是 Legacy 存下來的第三方回應原文或使用者自由輸入內容，遮罩內部結構沒意義）：任何欄名符合 `note`/`memo`/`remark`/`summary`/`content`/`body`/`description`/`reason`/`message`/`comment`/`raw`/`response`/`request`/`payload`/`log`/`receipt`/`snapshot`/`reply`/`answer` 這類自由文字樣式的欄位（例如 `withdrawal_records.note`、`deposit_records.note`、`remittance_records.note`、`risk_events.note`、`user_events.note_user`/`note_inner`、`commission_withdraws.{receipt_data,trade_response_data,trade_error_reason,txn_data}`、`payment_history_records.response_data`、`payment_deposit_options.txn_data`、`payment_withdrawal_options.txn_data`、`service_issues.{summaries,answer}`），一律清成 `NULL`（這幾欄在 schema 裡都是 `DEFAULT NULL`，不需要用 `'{}'`/`''` 代替）。使用者自己填的顯示名稱/簡介（`guilds.name`/`intro`、`user_crypto_wallets.name`）也不算業務代碼，`name` 是 `NOT NULL` 換成合成名稱、`intro`/使用者自訂的錢包暱稱直接清 `NULL`。
   - **整表清空**（`sessions`、`personal_access_tokens`、`password_reset_tokens`、`failed_jobs`、`activity_log`、`sms_logs`、`chat_room_messages`、`login_logs`、`user_login_logs`、`pulse_aggregates`、`pulse_entries`、`pulse_values`、`job_batches`、`schedule_logs`、`report_logs`、`migrations`）：情境不會用到，內容又可能夾帶使用者敏感資料、內部堆疊資訊，或是格式完全不受控的遙測資料（Laravel Pulse），乾脆不把這些表的資料列寫進遮罩後的種子。`migrations` 是第四輪 code review 才發現的必要項目：凍結的 `seeds/mysql-schema.sql` 本身已經內建一份完整的 128 列 migrations 資料（`env-reset.sh` 第一步就會載入），遮罩後的種子如果還帶自己的一份，載入時會撞主鍵 duplicate entry。
   - **白名單完整性檢查**：資料庫裡（依 `information_schema`，不是凍結的 schema 檔）的每一張表、每一個欄位都必須在 `TABLE_CONFIG` 裡有分類，找不到就列出全部後直接 throw；`_binary`/`0x...` 之類無法安全解析成字串字面值的值也會擋下來，不會猜測著繼續跑。`players.account` 是唯一的例外：格式對不上「使用者帳號 + 站台代碼 + p + 平台 id」的推導公式時**不會 throw**，退回當一般帳號字串整串遮罩（主平台直接存 `users.account`、部分廠商直接存供應商值，本來就有好幾種合法格式）。
   - **每一句 INSERT 輸出時都帶明確欄位列表**：`mysqldump --complete-insert` 保證的，不用自己重組 SQL。這樣測試站實際的欄位物理順序跟凍結 schema 不一樣時，MySQL 靠欄位名稱對齊值，不會把值插進錯的欄位。
   - **輸出不含 `CREATE TABLE`/trigger**：`mysqldump --no-create-info --skip-triggers`，schema 一律以凍結的 `seeds/mysql-schema.sql` 為準（`env-reset.sh` 一定先載入它）。
   - `TABLE_CONFIG` 裡沒有列出來的表/欄位——不存在這種狀態：白名單完整性檢查會在遮罩前就 throw，逼你先幫新表/新欄位分類，不會有「沒處理過的欄位就當作安全放行」的空隙。
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
- **`settings.val`**：翻了 `app/Http/Resources/Settings*Resource.php` 一輪（`SettingsWithdrawalBasicResource`、`SettingsCommissionResource`、`SettingsRiskWinRateResource`、`SettingsPlatformGeneralResource`⋯），大部分 `name` 存的是提款限額、佣金比例、風控閾值這類業務設定，但也有 `site_google_recaptcha`（`server_token`）、`site_contact`（`email`/`tel`）這種明確含機密/個資的 `name`，而且 `val` 沒有固定 schema、無法針對每個 `name` 個別設定——改成 `mask_json`（見上方），統一用鍵名規則遞迴處理，不是原樣保留。
- **guild/user_level 相關的 JSON 快照欄位**（`guilds.settings`、`user_level_records.{settings,upgrade_condition,renewal_condition,rebates}`、`user_level_settings.{upgrade_condition,renewal_condition,rebates}`、`payments.{maximum_trades,current_trades,period}`、`platforms.{currencies,regions,game_types}`、`flatten_rebate_reports.data`）：翻過對應的 schema comment，都是遊戲規則/等級條件/報表聚合這類業務設定快照，不是個資或第三方回應原文，分類為 `keep`。這批是自動化分類規則沒攔到、人工複查後確認安全的項目，跟上面明確查證過 Legacy 程式碼的兩項不同等級，列在這裡是為了讓後續複查者知道「已經看過、不是漏掉」。

### snapshot 模式的已知限制：哪些 fixture 需要重新 `record`、哪些情境目前不能用

`fixtures/*.fixture.json` 目前是對 **synthetic 模式**（`HUB_SEED=synthetic`，`seeds/synthetic-seed.sql` 的固定 id）錄製的。`scenario-baseline.sql` overlay 為了不跟真實快照的資料列衝突，id 統一落在 `900000000` 以上，所以任何 fixture 裡直接寫死數字 id 的欄位，在 `HUB_SEED=snapshot` 模式下對得上的機率是零。逐一對照 `scenarios/**` 全部情境後，分兩種情況：

- **只是 fixture 裡的 golden 結果寫死了 id，情境本身用業務代碼查資料**：`check-transaction-both-hit`、`check-transaction-deposit-hit`、`check-transaction-duplicate-trade-no`、`check-transaction-withdrawal-hit` 這四個 fixture 的 `dbProbe` 結果裡有 `user_id: 1`；情境的 `request`/`dbProbe.sql` 本身查的是 `station_code`/`trade_no` 這類業務值（不是數字 id），所以 `scenario-baseline.sql` overlay 補的資料列在 snapshot 模式下查得到、`verify` 會拿新的 id 跑，只是跟這些寫死 `user_id: 1` 的舊 fixture 對不起來。真的要在 snapshot 模式下驗證，需要先有真實快照、跑過 `bun run seed:mask`、`HUB_SEED=snapshot` 重置環境，再對 Legacy 重新 `record` 一次，產生對應 `900000000+` id 的新 fixture。這次沒有真實快照可以錄，所以現有 fixture 沒有被動過，synthetic 模式的驗證行為也完全不變。
- **情境本身（不只是 fixture）就寫死了數字 id，snapshot 模式下重新 `record` 也沒用**：`scenarios/player/player-balance-outbound-{success,error,timeout}.json` 的 `dbProbe.sql` 直接寫 `platform_id = 3`、`user_id = 1`（Issue #8 的 walking skeleton，dbProbe 目前還沒做成用業務代碼查詢）——這三個情境檔**本 PR 沒有修改**，因為改這三個檔案屬於 spec 的驗收條件三（等真的有快照、需要讓所有情境都能在兩種模式下跑時再處理），不是 Issue #13 遮罩腳本的範圍。`scenario-baseline.sql` 仍然照樣補了 `players`/`play_logs`/`platforms`(`sbo`)/`wallets`(`sbo` 錢包) 這幾張表的資料列（保持跟 `synthetic-seed.sql` 同步），只是因為 overlay 用的是 `900000003` 而不是 synthetic 模式的 `3`，這三個情境的 dbProbe 在 snapshot 模式下查不到列——這是已知、暫時無法避免的落差，不是遮罩腳本或 overlay 的 bug。

## 狀態

建置中。進度追蹤在 [HubRefactoring 的 issues](https://github.com/CarlLee1983/HubRefactoring/issues)（#2–#21）。
