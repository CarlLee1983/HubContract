-- Synthetic Minimal Seed for StationHub Legacy Recording Environment
-- All sensitive data (secret_key, accounts, phone numbers) are 100% synthetic.

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Stations
TRUNCATE TABLE `stations`;
INSERT INTO `stations` (`id`, `name`, `code`, `secret_key`, `cost_percent`, `callback_domain`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, '合成測試站台', 'DEMO_STATION', 'synthetic_secret_key_for_contract_testing_only_1234567890', 0.00, 'http://localhost:8080', NOW(), NOW(), NULL);

-- 2. Station Currencies
TRUNCATE TABLE `station_currencies`;
INSERT INTO `station_currencies` (`id`, `station_id`, `currency`, `status`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 'TWD', 1, NOW(), NOW(), NULL),
(2, 1, 'USD', 1, NOW(), NOW(), NULL),
(3, 1, 'PHP', 1, NOW(), NOW(), NULL);

-- 3. Platforms
-- Note (Issue #8): the `cq9` row's api_settings uses the wrong key names —
-- Cq9::getApiRequiredSettings() reads `api_url`/`api_token`, not `url`. Any
-- scenario that actually drives cq9's findAccount would hit
-- `Undefined array key "api_url"`. Left as-is here: no existing scenario
-- exercises cq9's outbound call, and fixing it is outside this issue's scope.
TRUNCATE TABLE `platforms`;
INSERT INTO `platforms` (`id`, `name`, `is_original`, `api_settings`, `active`, `maintain`, `authorized`, `is_main`, `raw_log_sync`, `sort`, `currencies`, `regions`, `game_types`, `raw_index`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 'main', 1, NULL, 1, 0, 1, 1, 1, 0, '[]', '[]', '[]', NULL, NOW(), NOW(), NULL),
(2, 'cq9', 1, '{"url":"http://mock-provider:8081"}', 1, 0, 1, 0, 1, 1, '["TWD","USD"]', '[]', '[]', NULL, NOW(), NOW(), NULL),
-- sbo: the walking-skeleton outbound platform for GET /v1/player/balance (Issue #8).
-- api_settings keys per Sbo::getApiRequiredSettings(); api_url points at the
-- `mock-provider` compose service (stub) so findAccount() calls the stub, not
-- a real vendor.
(3, 'sbo', 1, '{"api_url":"http://mock-provider:8081","company_key":"synthetic_company_key","server_id":"synthetic-server-01","agent_id":"synthetic_agent","portfolio":"SportsBook","lang":"en"}', 1, 0, 1, 0, 1, 2, '["TWD"]', '[]', '[]', NULL, NOW(), NOW(), NULL);

-- 4. Platform Currencies
TRUNCATE TABLE `platform_currencies`;
INSERT INTO `platform_currencies` (`id`, `platform_id`, `currency`, `vendor_currency_code`, `source`, `remark`, `created_at`, `updated_at`) VALUES
(1, 2, 'TWD', 'TWD', 'declared', 'Synthetic', NOW(), NOW()),
(2, 2, 'USD', 'USD', 'declared', 'Synthetic', NOW(), NOW());

-- 5. Users (Members)
TRUNCATE TABLE `users`;
INSERT INTO `users` (`id`, `station_id`, `account`, `last_deposit_at`, `last_betting_at`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 'synthetic_user_01', NOW(), NULL, NOW(), NOW(), NULL),
(2, 1, 'synthetic_user_02', NOW(), NULL, NOW(), NOW(), NULL),
(3, 1, 'synthetic_user_03', NOW(), NULL, NOW(), NOW(), NULL);

-- 6a. Players (Issue #8): pre-created so GET /v1/player/balance's findAccount()
-- doesn't take the createAccount() branch (an extra outbound call + INSERT) —
-- that path is exercised separately, not by the walking-skeleton scenarios.
-- account format is LobbyAbstract::getFormattedPlayerAccount(): {user.account}{station.code}p{platform.id}.
TRUNCATE TABLE `players`;
INSERT INTO `players` (`id`, `station_id`, `platform_id`, `user_id`, `account`, `vendor_player_id`, `playing`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 3, 1, 'synthetic_user_01DEMO_STATIONp3', NULL, 0, NOW(), NOW(), NULL),
-- Existing complete member; a repeated POST /v1/player must not add rows.
(2, 1, 1, 2, 'synthetic_user_02DEMO_STATION', NULL, 0, NOW(), NOW(), NULL),
-- D-40: same member/platform, distinct account strings satisfy the schema's unique key.
(3, 1, 1, 3, 'synthetic_user_03DEMO_STATION', NULL, 0, NOW(), NOW(), NULL),
(4, 1, 1, 3, 'synthetic_user_03DEMO_STATION_duplicate', NULL, 0, NOW(), NOW(), NULL);

-- 6b. Wallets (Main Wallet for user 1 & 2, plus a pre-created sbo wallet for
-- the Issue #8 player above so checkWalletByPlayer() doesn't INSERT one).
TRUNCATE TABLE `wallets`;
INSERT INTO `wallets` (`id`, `user_id`, `platform_id`, `platform_name`, `player_id`, `in_use`, `currency`, `balance`, `freeze`, `check_at`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 1, 'main', 0, 1, 'TWD', 1000.0000, 0.0000, NOW(), NOW(), NOW(), NULL),
(2, 2, 1, 'main', 0, 1, 'TWD', 500.0000, 0.0000, NOW(), NOW(), NOW(), NULL),
(3, 1, 3, 'sbo', 1, 0, 'TWD', 0.0000, 0.0000, NOW(), NOW(), NOW(), NULL),
(4, 2, 1, 'main', 2, 0, 'USD', 0.0000, 0.0000, NOW(), NOW(), NOW(), NULL),
(5, 2, 1, 'main', 2, 0, 'PHP', 0.0000, 0.0000, NOW(), NOW(), NOW(), NULL);

-- 6c. Play logs (Issue #8): PlayerService::getPlayBalance() picks the platform
-- from the user's most recent play_log row, not from the request.
-- Issue #9: queued wallet sync follows this game and station mapping.
TRUNCATE TABLE `games`;
INSERT INTO `games` (`id`, `code`, `signature`, `name`, `type`, `platform_name`, `game_company_name`, `active`, `maintain`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 'SBO_SYNTHETIC', 'sbo_synthetic_game', 'Synthetic SBO Game', 'sport', 'sbo', 'sbo', 1, 0, NOW(), NOW(), NULL);
TRUNCATE TABLE `game_companies`;
INSERT INTO `game_companies` (`id`, `name`, `platform_id`, `platform_name`, `currency`, `created_at`, `updated_at`) VALUES
(1, 'sbo', 3, 'sbo', 'TWD', NOW(), NOW());
TRUNCATE TABLE `station_game_companies`;
INSERT INTO `station_game_companies` (`id`, `station_id`, `game_company_id`, `game_company_name`, `currency`, `active`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 1, 'sbo', 'TWD', 1, NOW(), NOW(), NULL);
TRUNCATE TABLE `play_logs`;
INSERT INTO `play_logs` (`id`, `station_id`, `platform_id`, `user_id`, `player_id`, `game_id`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 3, 1, 1, 1, NOW(), NOW(), NULL);

-- 7. Deposit Records
TRUNCATE TABLE `deposit_records`;
INSERT INTO `deposit_records` (`id`, `no`, `trade_no`, `user_id`, `wallet_id`, `currency`, `amount`, `status`, `stage`, `note`, `expired_at`, `error_code`, `error_message`, `completed_at`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 'DE_SYNTHETIC_001', 'TRADE_DEP_001', 1, 1, 'TWD', 100.0000, 'completed', 'finished', 'Synthetic deposit note', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), NULL),
(2, 'DE_SYNTHETIC_002', 'TRADE_DEP_SOFT_DELETED', 1, 1, 'TWD', 200.0000, 'completed', 'finished', 'Soft deleted deposit', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), '2025-01-01 00:00:00'),
(3, 'DE_SYNTHETIC_003', 'TRADE_BOTH_001', 1, 1, 'TWD', 300.0000, 'completed', 'finished', 'Synthetic deposit for both hit', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), NULL),
(4, 'DE_SYNTHETIC_004', 'TRADE_DUP_DEP_001', 1, 1, 'TWD', 400.0000, 'completed', 'finished', 'Synthetic deposit duplicate first', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), NULL),
(5, 'DE_SYNTHETIC_005', 'TRADE_DUP_DEP_001', 1, 1, 'TWD', 450.0000, 'processing', 'ongoing', 'Synthetic deposit duplicate second', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), NULL);

-- 8. Withdrawal Records
TRUNCATE TABLE `withdrawal_records`;
INSERT INTO `withdrawal_records` (`id`, `no`, `trade_no`, `user_id`, `wallet_id`, `currency`, `amount`, `status`, `stage`, `note`, `expired_at`, `error_code`, `error_message`, `completed_at`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 'WI_SYNTHETIC_001', 'TRADE_WITHDRAW_001', 1, 1, 'TWD', 50.0000, 'completed', 'finished', 'Synthetic withdrawal note', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), NULL),
(2, 'WI_SYNTHETIC_002', 'TRADE_BOTH_001', 1, 1, 'TWD', 350.0000, 'completed', 'finished', 'Synthetic withdrawal for both hit', DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL, NULL, NOW(), NOW(), NOW(), NULL);

-- 9. Administers & Roles
TRUNCATE TABLE `administers`;
INSERT INTO `administers` (`id`, `name`, `account`, `email`, `active`, `password`, `language`, `remember_token`, `last_login_ip`, `last_login_at`, `last_login_token`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, '合成管理員', 'super', 'synthetic_admin@cmg.test', 1, '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'en', NULL, '127.0.0.1', NOW(), NULL, NOW(), NOW(), NULL);

-- 10. SMS suppliers. Every URL is the local mock-provider; credentials and
-- phone numbers used by SMS scenarios are synthetic.
TRUNCATE TABLE `sms_logs`;
TRUNCATE TABLE `sms`;
INSERT INTO `sms` (`id`, `station_id`, `code`, `name`, `supplier`, `active`, `amount`, `settings`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, '84', 'Synthetic Chuanx', 'chuanx', 1, 5, '{"url":"http://mock-provider:8081","appkey":"synthetic_appkey","appcode":"synthetic_appcode","appsecret":"synthetic_appsecret"}', '2025-01-01 00:00:00', '2025-01-01 00:00:00', NULL),
(2, 1, '84', 'Synthetic Inactive Chuanx', 'chuanx', 0, 5, '{"url":"http://mock-provider:8081","appkey":"synthetic_appkey","appcode":"synthetic_appcode","appsecret":"synthetic_appsecret"}', '2025-01-01 00:00:00', '2025-01-01 00:00:00', NULL),
(3, 1, '63', 'Synthetic Asmsc', 'asmsc', 1, 0, '{"url":"http://mock-provider:8081","api_id":"synthetic_api_id","api_password":"synthetic_api_password","smsCost":2}', '2025-01-01 00:00:00', '2025-01-01 00:00:00', NULL),
(4, 1, '63', 'Synthetic Send Asmsc', 'asmsc', 1, 5, '{"url":"http://mock-provider:8081","api_id":"synthetic_api_id","api_password":"synthetic_api_password","smsCost":2}', '2025-01-01 00:00:00', '2025-01-01 00:00:00', NULL),
(5, 1, '63', 'Synthetic AboSend', 'abo_send', 1, 5, '{"url":"http://mock-provider:8081","orgCode":"synthetic_org_code","MD5":"synthetic_md5_key","smsCost":2}', '2025-01-01 00:00:00', '2025-01-01 00:00:00', NULL);

SET FOREIGN_KEY_CHECKS = 1;
