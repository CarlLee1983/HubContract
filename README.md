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
# 執行所有單元與整合測試（含 Walking Skeleton 端到端驗證）
bun test

# 錄製單一情境（對 Legacy 執行並產出 golden fixture）
bun run record scenarios/wallet/check-transaction-deposit-hit.json

# 驗證受測目標是否符合契約（可對 Legacy 或 StationHubNext 執行）
bun run verify scenarios/wallet/check-transaction-deposit-hit.json
```

### 服務與連接埠配置

| 服務 | 內部連接埠 | 主機連接埠 | 說明 |
| --- | --- | --- | --- |
| `legacy-app` | `8080` | `8080` | StationHub Legacy PHP 8.3 內建 Web Server |
| `mariadb` | `3306` | `33066` | MariaDB 10.11.6 (`stationhub_recording`) |
| `redis` | `6379` | `63799` | Redis 7.2-alpine |
| `mongo` | `27017` | `27018` | MongoDB 6.0 (`stationhub_recording`) |

### 時區設定（Timezone）注意事項

> [!WARNING]
> 本錄製環境目前依據 local `.env` 預設設定時區為 `APP_TIMEZONE="Asia/Taipei"`。
> **正式生產環境的確切時區（UTC 或 Asia/Taipei）尚未完成實機查證**。
> 錄製資料時請留意時間戳記欄位（如 `created_at`、`updated_at`），待生產環境確認後若有差異需同步更新。

### 已知限制：`vendor/` 與 pinned commit 的 composer.lock 可能對不上

`legacy-app` 掛載的 `vendor/`（唯讀）來自 `STATIONHUB_REPO`（預設 `../StationHub`）工作區當下 `composer install` 產生的內容，**不是**從 `docker/legacy.commit` 記錄的 `LEGACY_COMMIT` 重新裝出來的。`scripts/env-up.sh` 只驗證「工作區已提交狀態（`HEAD`）的 `composer.lock`」與「pinned commit 的 `composer.lock`」是否一致（且要求工作區沒有未提交的 `composer.lock` 修改）；如果兩者不一致，`env-up.sh` 會大聲失敗並中止。

但即使這個檢查通過，也只保證「composer.lock 內容一致」，不保證 `vendor/` 目錄本身確實是依照那份 `composer.lock` 重新 `composer install` 出來的（例如工作區手動改過 `vendor/` 裡的檔案、或裝的時候用了不同的 composer 版本／平台）。這是已知限制：目前沒有自動化機制驗證 `vendor/` 本身的內容雜湊，只驗證了它「應該」對應的 lock 檔一致。若懷疑 `vendor/` 與 pinned commit 不符，最保險的做法是在 `STATIONHUB_REPO` 對著 pinned commit 的 `composer.lock` 重新執行一次 `composer install`。

### 排程器（Scheduler）安全邊界

> [!IMPORTANT]
> 依據 ADR-0010 與 Issue #3 規格，**Legacy 排程器（`schedule:run`）絕對不常駐執行**。
> 如有特定測試情境需要觸發排程作業，必須在 runner 執行該情境時顯式手動觸發單次 Artisan command，不可掛載背景 daemon 避免造成非預期狀態副作用。

## 資料安全

這個 repo 是公開的。fixture 與種子資料一律遮罩後才能提交；站台 `secret_key`、帳號、手機號碼全部使用 100% 合成假資料（例如 `DEMO_STATION`、`synthetic_secret_key_...`、`synthetic_user_01`）。

`src/config.ts` 裡的 DB/Redis 連線預設值，以及 `docker/.env.recording` 的 `APP_KEY`，都是合成、非機密的本機錄製環境帳密（與 `docker-compose.yml` 定義一致），僅用於本機一次性、可拋棄的錄製環境，不對應任何真實環境的憑證。

### 從測試站快照產生基準種子（Issue #13）

手寫的 `seeds/synthetic-seed.sql` 只夠撐 Pilot 的 8 種情境。要涵蓋更多路由時，改用「真實測試站快照經過遮罩」產生的基準種子：

1. **取得快照**：由人（不是 agent）用 `mysqldump` 對測試站資料庫產生快照，存成 `.sql` 或 `.sql.gz`。**這份原始檔含真實的站台 `secret_key`、帳號、手機號碼、姓名、email 等個資，絕對不能放進這個公開 repo**——建議存在 repo 目錄外（例如自己的 `~/Downloads` 或任何 scratch 目錄），只把路徑傳給下一步的腳本。
2. **設定 `MASK_HMAC_KEY`**：遮罩用 HMAC-SHA256 把原值決定性地轉成合成值，key 從環境變數 `MASK_HMAC_KEY` 讀，沒設就直接 throw（不提供預設值）。這把 key 本身不是遮罩後資料的機密（遮罩後的種子已經公開），但如果外流，別人可以拿一個「已知的原始值」自己算出遮罩後長怎樣，等於能反查特定帳號/手機是否在快照裡出現過——所以不要寫死在程式碼或提交進 repo，本機留著（例如 shell profile 或不會進版控的 `.env`）就好。**同一份快照要重跑出「同樣」的種子，前提是每次都用同一把 key**，換 key 等於重新生成一套完全不同的合成值。
   ```bash
   export MASK_HMAC_KEY="<自己挑一個固定字串，不要提交進 repo>"
   ```
3. **跑遮罩腳本**：
   ```bash
   bun run seed:mask <你的快照路徑.sql|.sql.gz> seeds/snapshot-seed.sql
   ```
   腳本依 `src/seed/maskConfig.ts` 的設定做三件事：
   - **換成合成值**：站台 `secret_key`、各表的帳號欄位（含 `players.account`——這欄位是 `使用者帳號 + 站台代碼 + p + 平台 id` 組出來的，遮罩時只換使用者帳號那一段，站台代碼與平台 id 保留明文，才不會破壞這個推導關係，見 `LobbyAbstract::getFormattedPlayerAccount()`）、`sms_logs.phone`、需實名登記的姓名欄位、`administers.email`、加密貨幣錢包地址。合成值由原值做 keyed hash 決定性推得（見 `src/seed/maskValue.ts`）——同一份快照重跑會得到逐位元組相同的輸出，同一個原值不管出現在哪張表都會映射到同一個合成值，藉此保留資料間的關聯。
   - **換成固定值 / 清成 NULL**：`administers.password` 統一換成 `seeds/synthetic-seed.sql` 用的那組合成 bcrypt 雜湊；`administers.remember_token`／`last_login_token`／`last_login_ip`、`betting_logs.raw_data` 清成 `NULL`。
   - **JSON 欄位**（`platforms.api_settings`、`payments.api_tokens`、`sms.settings`、`commission_withdraws.receipt_data`）：鍵名符合 `key`/`secret`/`token`/`password`/`sign` 的字串值換成合成值；值本身是 `http(s)` URL 就換成錄製環境的線路 stub 位址 `http://mock-provider:8081`（parent spec [#1](https://github.com/CarlLee1983/HubRefactoring/issues/1) 第 18 點）。
   - **整表清空**（`sessions`、`personal_access_tokens`、`password_reset_tokens`、`failed_jobs`、`activity_log`、`sms_logs`、`chat_room_messages`、`login_logs`、`user_login_logs`）：情境不會用到，內容又可能夾帶使用者敏感資料或內部堆疊資訊，乾脆不把這些表的資料列寫進遮罩後的種子。
   - **安全原則**：上面任何一步只要遇到無法安全解析的狀況（INSERT 沒帶欄位列表又找不到對應的 `CREATE TABLE`、欄位數與值數不符、該處理的欄位值不是字串字面值也不是 `NULL`、`players.account` 不符合預期的推導格式、JSON 欄位內容不是合法 JSON），一律直接 throw、腳本失敗退出——不會猜測欄位順序、不會把看起來奇怪的值原樣放行。
   - 沒列在設定裡的欄位／資料表原樣保留。
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

## 狀態

建置中。進度追蹤在 [HubRefactoring 的 issues](https://github.com/CarlLee1983/HubRefactoring/issues)（#2–#21）。
