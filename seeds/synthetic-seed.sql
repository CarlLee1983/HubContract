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
TRUNCATE TABLE `platforms`;
INSERT INTO `platforms` (`id`, `name`, `is_original`, `api_settings`, `active`, `maintain`, `authorized`, `is_main`, `raw_log_sync`, `sort`, `currencies`, `regions`, `game_types`, `raw_index`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 'main', 1, NULL, 1, 0, 1, 1, 1, 0, '[]', '[]', '[]', NULL, NOW(), NOW(), NULL),
(2, 'cq9', 1, '{"url":"http://mock-provider:8081"}', 1, 0, 1, 0, 1, 1, '["TWD","USD"]', '[]', '[]', NULL, NOW(), NOW(), NULL);

TRUNCATE TABLE `game_types`;
INSERT INTO `game_types` (`id`, `name`, `active`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 'slots', 1, NOW(), NOW(), NULL),
(2, 'live', 1, NOW(), NOW(), NULL);

TRUNCATE TABLE `platform_game_type_map`;
INSERT INTO `platform_game_type_map` (`platform_id`, `game_type_id`, `active`, `cost_percent`) VALUES
(2, 1, 1, 1.0),
(2, 2, 1, 2.0);

-- 4. Platform Currencies
TRUNCATE TABLE `platform_currencies`;
INSERT INTO `platform_currencies` (`id`, `platform_id`, `currency`, `vendor_currency_code`, `source`, `remark`, `created_at`, `updated_at`) VALUES
(1, 2, 'TWD', 'TWD', 'declared', 'Synthetic', NOW(), NOW()),
(2, 2, 'USD', 'USD', 'declared', 'Synthetic', NOW(), NOW());

-- 5. Users (Members)
TRUNCATE TABLE `users`;
INSERT INTO `users` (`id`, `station_id`, `account`, `last_deposit_at`, `last_betting_at`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 'synthetic_user_01', NOW(), NULL, NOW(), NOW(), NULL),
(2, 1, 'synthetic_user_02', NOW(), NULL, NOW(), NOW(), NULL);

-- 6. Wallets (Main Wallet for user 1 & 2)
TRUNCATE TABLE `wallets`;
INSERT INTO `wallets` (`id`, `user_id`, `platform_id`, `platform_name`, `player_id`, `in_use`, `currency`, `balance`, `freeze`, `check_at`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 1, 'main', 0, 1, 'TWD', 1000.0000, 0.0000, NOW(), NOW(), NOW(), NULL),
(2, 2, 1, 'main', 0, 1, 'TWD', 500.0000, 0.0000, NOW(), NOW(), NOW(), NULL);

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
(1, '合成管理員', 'super', 'synthetic_admin@cmg.test', 1, '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'en_us', NULL, '127.0.0.1', NOW(), NULL, NOW(), NOW(), NULL);

TRUNCATE TABLE `model_has_roles`;
TRUNCATE TABLE `roles`;
INSERT INTO `roles` (`id`, `name`, `guard_name`, `hierarchy`, `created_at`, `updated_at`) VALUES
(1, 'super', 'admin', 0, NOW(), NOW());
INSERT INTO `model_has_roles` (`role_id`, `model_type`, `model_id`) VALUES
(1, 'App\\Models\\Administer', 1);

SET FOREIGN_KEY_CHECKS = 1;
