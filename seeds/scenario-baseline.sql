-- Issue #13 code review 驗收條件三鋪路：情境基準列 overlay。
--
-- `seeds/synthetic-seed.sql` 手寫給 Pilot 8 種情境用，但真實測試站快照不會有
-- `DEMO_STATION`、`TRADE_DEP_001` 這些寫死在 scenarios/*.json、fixtures/*.json
-- 裡的業務代號。改用快照當基準種子（`HUB_SEED=snapshot`，見 env-reset.sh）時，
-- 光有遮罩後的快照，情境會全部找不到資料而失敗。
--
-- 這份檔案疊加在遮罩後的快照之上，補回情境需要的固定列：
--   - 不 TRUNCATE：快照本身的資料原封不動，只是「再加幾筆」。
--   - 用 `INSERT ... ON DUPLICATE KEY UPDATE`：可以重跑，重複套用同一份 overlay
--     不會報 id/unique key 衝突。
--   - id 一律落在 900000000 以上：這個區段實務上不可能被真實快照用到（一般
--     production 的 auto_increment 不會衝到這裡），用來確保不會蓋掉快照本身
--     的資料列。
--
-- scenarios/*.json 與 fixtures/*.json 目前只用業務代號（station_code、txn_no、
-- secretKey）識別資料，完全沒有直接引用數字 id（已逐一檢查過，見 PR 說明），
-- 所以這裡沿用跟 synthetic-seed.sql 完全相同的業務值，情境不需要另外修改。
-- 至於 fixtures 裡記錄下來的 `user_id: 1` 這類欄位，那是針對 synthetic 模式錄
-- 下的 golden 結果，synthetic 模式的行為與 id 都維持不變（見需求 #7），這份
-- overlay 只在 `HUB_SEED=snapshot` 時套用；真的要對 snapshot 模式驗證，需要用
-- 這份 overlay 重新對 Legacy 跑一次 `record`，屆時的 fixture 才會是
-- 900000000+ 的 id——這次沒有真實快照可以錄，所以沒有動既有的 fixtures。
--
-- 已知風險：`ON DUPLICATE KEY UPDATE` 是依 MySQL 規則，撞到「任何一個」unique
-- key 就觸發，不是只看 id。如果真實快照剛好已經有一列的 unique 欄位（例如
-- stations.code）跟這裡的固定值一樣（例如剛好也叫 'DEMO_STATION'），這筆
-- overlay 就會更新到快照那一列，而不是插入一筆 900000000+ 的新列。以這裡選的
-- 值（'DEMO_STATION'、'TRADE_DEP_001' 這類明顯的 placeholder）撞上真實快照的
-- 機率極低，但如果之後真的發生，第一個徵兆會是 stations 表沒有 900000001 這
-- 一列——請先查真實快照是不是剛好用了同樣的值。

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Stations
INSERT INTO `stations` (`id`, `name`, `code`, `secret_key`, `cost_percent`, `callback_domain`, `created_at`, `updated_at`, `deleted_at`) VALUES
(900000001, '合成測試站台', 'DEMO_STATION', 'synthetic_secret_key_for_contract_testing_only_1234567890', 0.00, 'http://localhost:8080', NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `secret_key` = VALUES(`secret_key`), `cost_percent` = VALUES(`cost_percent`), `callback_domain` = VALUES(`callback_domain`), `updated_at` = NOW(), `deleted_at` = NULL;

-- 2. Station Currencies
INSERT INTO `station_currencies` (`id`, `station_id`, `currency`, `status`, `created_at`, `updated_at`, `deleted_at`) VALUES
(900000001, 900000001, 'TWD', 1, NOW(), NOW(), NULL),
(900000002, 900000001, 'USD', 1, NOW(), NOW(), NULL),
(900000003, 900000001, 'PHP', 1, NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE `status` = VALUES(`status`), `updated_at` = NOW(), `deleted_at` = NULL;

-- 3. Platforms（含 Issue #8 的 sbo：GET /v1/player/balance 的 outbound 平台）
INSERT INTO `platforms` (`id`, `name`, `is_original`, `api_settings`, `active`, `maintain`, `authorized`, `is_main`, `raw_log_sync`, `sort`, `currencies`, `regions`, `game_types`, `raw_index`, `created_at`, `updated_at`, `deleted_at`) VALUES
(900000001, 'main', 1, NULL, 1, 0, 1, 1, 1, 0, '[]', '[]', '[]', NULL, NOW(), NOW(), NULL),
(900000002, 'cq9', 1, '{"url":"http://mock-provider:8081"}', 1, 0, 1, 0, 1, 1, '["TWD","USD"]', '[]', '[]', NULL, NOW(), NOW(), NULL),
(900000003, 'sbo', 1, '{"api_url":"http://mock-provider:8081","company_key":"synthetic_company_key","server_id":"synthetic-server-01","agent_id":"synthetic_agent","portfolio":"SportsBook","lang":"en"}', 1, 0, 1, 0, 1, 2, '["TWD"]', '[]', '[]', NULL, NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE `api_settings` = VALUES(`api_settings`), `active` = VALUES(`active`), `updated_at` = NOW(), `deleted_at` = NULL;

-- 4. Platform Currencies
INSERT INTO `platform_currencies` (`id`, `platform_id`, `currency`, `vendor_currency_code`, `source`, `remark`, `created_at`, `updated_at`) VALUES
(900000001, 900000002, 'TWD', 'TWD', 'declared', 'Synthetic', NOW(), NOW()),
(900000002, 900000002, 'USD', 'USD', 'declared', 'Synthetic', NOW(), NOW())
ON DUPLICATE KEY UPDATE `vendor_currency_code` = VALUES(`vendor_currency_code`), `updated_at` = NOW();

-- 5. Users (Members)
INSERT INTO `users` (`id`, `station_id`, `account`, `last_deposit_at`, `last_betting_at`, `created_at`, `updated_at`, `deleted_at`) VALUES
(900000001, 900000001, 'synthetic_user_01', NOW(), NULL, NOW(), NOW(), NULL),
(900000002, 900000001, 'synthetic_user_02', NOW(), NULL, NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE `last_deposit_at` = VALUES(`last_deposit_at`), `updated_at` = NOW(), `deleted_at` = NULL;

-- 5b. Players（Issue #8：sbo 的 findAccount() 需要事先建好的 player，見
-- synthetic-seed.sql 對應的註解）。account 值照 LobbyAbstract::getFormattedPlayerAccount()
-- 的公式組出來：{user.account}{station.code}p{platform.id}，這裡的 platform.id
-- 用的是這份 overlay 自己的 900000003，跟 synthetic 模式的 3 不同——這是
-- overlay 命名空間內部自洽的值，不代表 scenarios/player/*.json 的 dbProbe
-- （寫死 platform_id = 3、user_id = 1）能在 snapshot 模式下對得上，那兩個
-- 情境本來就還不能在 snapshot 模式下用，見 README「snapshot 模式的已知限制」。
INSERT INTO `players` (`id`, `station_id`, `platform_id`, `user_id`, `account`, `vendor_player_id`, `playing`, `created_at`, `updated_at`, `deleted_at`) VALUES
(900000001, 900000001, 900000003, 900000001, 'synthetic_user_01DEMO_STATIONp900000003', NULL, 0, NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE `account` = VALUES(`account`), `updated_at` = NOW(), `deleted_at` = NULL;

-- 6. Wallets (Main Wallet for user 1 & 2，加上 Issue #8 的 sbo 錢包)
INSERT INTO `wallets` (`id`, `user_id`, `platform_id`, `platform_name`, `player_id`, `in_use`, `currency`, `balance`, `freeze`, `check_at`, `created_at`, `updated_at`, `deleted_at`) VALUES
(900000001, 900000001, 900000001, 'main', 0, 1, 'TWD', 1000.0000, 0.0000, NOW(), NOW(), NOW(), NULL),
(900000002, 900000002, 900000001, 'main', 0, 1, 'TWD', 500.0000, 0.0000, NOW(), NOW(), NOW(), NULL),
(900000003, 900000001, 900000003, 'sbo', 900000001, 0, 'TWD', 0.0000, 0.0000, NOW(), NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE `balance` = VALUES(`balance`), `freeze` = VALUES(`freeze`), `check_at` = NOW(), `updated_at` = NOW(), `deleted_at` = NULL;

-- 6b. Play logs（Issue #8：PlayerService::getPlayBalance() 挑使用者最新一筆
-- play_log 的平台，不是從 request 挑）。
INSERT INTO `play_logs` (`id`, `station_id`, `platform_id`, `user_id`, `player_id`, `game_id`, `created_at`, `updated_at`, `deleted_at`) VALUES
(900000001, 900000001, 900000003, 900000001, 900000001, NULL, NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE `updated_at` = NOW(), `deleted_at` = NULL;

-- 7. Deposit Records
INSERT INTO `deposit_records` (`id`, `no`, `trade_no`, `user_id`, `wallet_id`, `currency`, `amount`, `status`, `stage`, `note`, `expired_at`, `error_code`, `error_message`, `completed_at`, `created_at`, `updated_at`, `deleted_at`) VALUES
(900000001, 'DE_SYNTHETIC_001', 'TRADE_DEP_001', 900000001, 900000001, 'TWD', 100.0000, 'completed', 'finished', 'Synthetic deposit note', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), NULL),
(900000002, 'DE_SYNTHETIC_002', 'TRADE_DEP_SOFT_DELETED', 900000001, 900000001, 'TWD', 200.0000, 'completed', 'finished', 'Soft deleted deposit', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), '2025-01-01 00:00:00'),
(900000003, 'DE_SYNTHETIC_003', 'TRADE_BOTH_001', 900000001, 900000001, 'TWD', 300.0000, 'completed', 'finished', 'Synthetic deposit for both hit', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), NULL),
(900000004, 'DE_SYNTHETIC_004', 'TRADE_DUP_DEP_001', 900000001, 900000001, 'TWD', 400.0000, 'completed', 'finished', 'Synthetic deposit duplicate first', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), NULL),
(900000005, 'DE_SYNTHETIC_005', 'TRADE_DUP_DEP_001', 900000001, 900000001, 'TWD', 450.0000, 'processing', 'ongoing', 'Synthetic deposit duplicate second', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE `status` = VALUES(`status`), `stage` = VALUES(`stage`), `amount` = VALUES(`amount`), `updated_at` = NOW(), `deleted_at` = VALUES(`deleted_at`);

-- 8. Withdrawal Records
INSERT INTO `withdrawal_records` (`id`, `no`, `trade_no`, `user_id`, `wallet_id`, `currency`, `amount`, `status`, `stage`, `note`, `expired_at`, `error_code`, `error_message`, `completed_at`, `created_at`, `updated_at`, `deleted_at`) VALUES
(900000001, 'WI_SYNTHETIC_001', 'TRADE_WITHDRAW_001', 900000001, 900000001, 'TWD', 50.0000, 'completed', 'finished', 'Synthetic withdrawal note', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), NULL),
(900000002, 'WI_SYNTHETIC_002', 'TRADE_BOTH_001', 900000001, 900000001, 'TWD', 350.0000, 'completed', 'finished', 'Synthetic withdrawal for both hit', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE `status` = VALUES(`status`), `stage` = VALUES(`stage`), `amount` = VALUES(`amount`), `updated_at` = NOW(), `deleted_at` = NULL;

-- 9. Administers
INSERT INTO `administers` (`id`, `name`, `account`, `email`, `active`, `password`, `language`, `remember_token`, `last_login_ip`, `last_login_at`, `last_login_token`, `created_at`, `updated_at`, `deleted_at`) VALUES
(900000001, '合成管理員', 'super', 'synthetic_admin@cmg.test', 1, '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'en', NULL, '127.0.0.1', NOW(), NULL, NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE `password` = VALUES(`password`), `active` = VALUES(`active`), `updated_at` = NOW(), `deleted_at` = NULL;

-- 10. SMS suppliers for the issue #18 scenarios. These rows stay in the
-- reserved overlay ID range and only target the local mock-provider.
INSERT INTO `sms` (`id`, `station_id`, `code`, `name`, `supplier`, `active`, `amount`, `settings`, `created_at`, `updated_at`, `deleted_at`) VALUES
(900000001, 900000001, '84', 'Synthetic Chuanx', 'chuanx', 1, 5, '{"url":"http://mock-provider:8081","appkey":"synthetic_appkey","appcode":"synthetic_appcode","appsecret":"synthetic_appsecret"}', '2025-01-01 00:00:00', '2025-01-01 00:00:00', NULL),
(900000002, 900000001, '84', 'Synthetic Inactive Chuanx', 'chuanx', 0, 5, '{"url":"http://mock-provider:8081","appkey":"synthetic_appkey","appcode":"synthetic_appcode","appsecret":"synthetic_appsecret"}', '2025-01-01 00:00:00', '2025-01-01 00:00:00', NULL),
(900000003, 900000001, '63', 'Synthetic Asmsc', 'asmsc', 1, 0, '{"url":"http://mock-provider:8081","api_id":"synthetic_api_id","api_password":"synthetic_api_password","smsCost":2}', '2025-01-01 00:00:00', '2025-01-01 00:00:00', NULL),
(900000004, 900000001, '63', 'Synthetic Send Asmsc', 'asmsc', 1, 5, '{"url":"http://mock-provider:8081","api_id":"synthetic_api_id","api_password":"synthetic_api_password","smsCost":2}', '2025-01-01 00:00:00', '2025-01-01 00:00:00', NULL)
ON DUPLICATE KEY UPDATE `active` = VALUES(`active`), `amount` = VALUES(`amount`), `settings` = VALUES(`settings`), `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;

SET FOREIGN_KEY_CHECKS = 1;
