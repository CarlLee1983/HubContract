-- MariaDB dump 10.19  Distrib 10.11.6-MariaDB, for debian-linux-gnu (aarch64)
--
-- Host: localhost    Database: stationhub_recording
-- ------------------------------------------------------
-- Server version	10.11.6-MariaDB-1:10.11.6+maria~ubu2204

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activity_log`
--

DROP TABLE IF EXISTS `activity_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `activity_log` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `log_name` varchar(255) DEFAULT NULL,
  `description` text NOT NULL,
  `memo` text DEFAULT NULL,
  `subject_type` varchar(255) DEFAULT NULL,
  `event` varchar(255) DEFAULT NULL,
  `subject_id` bigint(20) DEFAULT NULL,
  `causer_type` varchar(255) DEFAULT NULL,
  `causer_id` bigint(20) DEFAULT NULL,
  `properties` longtext DEFAULT NULL,
  `batch_uuid` char(36) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `subject` (`subject_type`,`subject_id`),
  KEY `causer` (`causer_type`,`causer_id`),
  KEY `activity_log_log_name_index` (`log_name`),
  KEY `activity_log_log_name_created_at_index` (`log_name`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `administers`
--

DROP TABLE IF EXISTS `administers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `administers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '姓名',
  `account` varchar(255) NOT NULL COMMENT 'å¸³è™Ÿ',
  `email` varchar(255) NOT NULL COMMENT 'ä¿¡ç®±',
  `active` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'å•Ÿç”¨ç‹€æ…‹',
  `password` varchar(255) NOT NULL COMMENT 'å¯†ç¢¼',
  `language` varchar(50) DEFAULT NULL COMMENT '語言',
  `remember_token` varchar(255) DEFAULT NULL COMMENT 'è¨˜ä½æˆ‘ token',
  `last_login_ip` varchar(255) DEFAULT NULL COMMENT 'æœ€å¾Œç™»å…¥ ip',
  `last_login_at` datetime DEFAULT NULL COMMENT 'æœ€å¾Œç™»å…¥æ™‚é–“',
  `last_login_token` varchar(255) DEFAULT NULL COMMENT '最後登入 token (後踢前登入 token)',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `advance_deposits`
--

DROP TABLE IF EXISTS `advance_deposits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `advance_deposits` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `no` varchar(255) NOT NULL COMMENT '單號',
  `amount` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '儲值額度',
  `accumulation` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '總累積額度',
  `status` varchar(255) NOT NULL DEFAULT 'pending' COMMENT '狀態：新建單(pending)、已付款(paid)、處理中(processing)、拒絕(reject)、已完成(completed)、失敗(failed)',
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成時間',
  `note` varchar(255) DEFAULT NULL COMMENT '交易備註',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商戶預儲金';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `banners`
--

DROP TABLE IF EXISTS `banners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `banners` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(50) NOT NULL COMMENT '隨機檔名 uuid',
  `active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '發佈狀態',
  `open_window` tinyint(1) NOT NULL DEFAULT 0 COMMENT '另開視窗',
  `sort` int(11) NOT NULL DEFAULT 1 COMMENT '排序',
  `uri` varchar(255) DEFAULT NULL COMMENT '網址',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `betting_log_temps`
--

DROP TABLE IF EXISTS `betting_log_temps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `betting_log_temps` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `platform_name` varchar(255) DEFAULT NULL,
  `game_at` timestamp NULL DEFAULT NULL COMMENT '實際遊戲時間 YmdHi',
  `settled_at` timestamp NULL DEFAULT NULL COMMENT '遊戲結算時間 YmdHi',
  `data_count` smallint(6) DEFAULT NULL COMMENT '資料筆數',
  `is_log` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否已寫回 betting_logs',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `betting_log_temps_platform_name_settled_at_unique` (`platform_name`,`settled_at`) USING BTREE,
  KEY `betting_log_temps_platform_name_index` (`platform_name`),
  KEY `betting_log_temps_settled_at_IDX` (`settled_at`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `betting_logs`
--

DROP TABLE IF EXISTS `betting_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `betting_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `no` varchar(255) DEFAULT NULL COMMENT '投注單號',
  `version` varchar(100) DEFAULT NULL COMMENT '注單版號',
  `user_id` int(11) DEFAULT NULL,
  `platform_id` int(11) DEFAULT NULL,
  `player_id` int(11) DEFAULT NULL,
  `game_type` varchar(100) DEFAULT NULL COMMENT '遊戲類型，捕魚(fish),電子(slot),彩票(lottery),棋牌(chess),體育(sport),真人(live),實時彩票(lottery-live)',
  `game_id` int(11) DEFAULT NULL,
  `wallet_id` int(11) DEFAULT NULL COMMENT '需帳變遊戲錢包',
  `rollover_log_id` bigint(20) DEFAULT NULL COMMENT '流水歸屬',
  `status` varchar(20) DEFAULT NULL COMMENT '狀態：等待中(waiting)、進行中(running)、已結算(settled)',
  `result` varchar(20) DEFAULT NULL COMMENT '結果：贏(won)、輸(lose)、和局(draw)、作廢(void)、退款(refund)、取消(reject)、其他(other)',
  `bet` decimal(15,4) DEFAULT NULL COMMENT '投注額',
  `win` decimal(15,4) DEFAULT NULL COMMENT '遊戲贏分，嬴正輸負',
  `total` decimal(15,4) DEFAULT NULL COMMENT '總盈虧，嬴正輸負',
  `valid_bet` decimal(15,4) DEFAULT NULL COMMENT '是否為有效投注，無輸贏或和局為無效投注',
  `rebate` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '是否為有效投注，無輸贏或和局為無效投注',
  `rebate_rate` float DEFAULT NULL COMMENT '返水抽佣百分比快照, EX: 0.5 = 0.5%',
  `type` varchar(255) DEFAULT NULL COMMENT '特別類型：jackpot(大獎)、gamble(賭一把)、NULL(一般投注為空)',
  `summary` text DEFAULT NULL COMMENT '投注摘要',
  `raw_data` text DEFAULT NULL COMMENT '完整記錄',
  `rebateable` tinyint(1) NOT NULL DEFAULT 1 COMMENT '可否返水，預設可返水',
  `betting_at` timestamp NULL DEFAULT NULL COMMENT '實際投注時間 2023-06-06 10:10:10',
  `settled_at` timestamp NULL DEFAULT NULL COMMENT '實際結算時間 2023-06-06 10:11:10',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `betting_logs_no_platform_id_unique` (`no`,`platform_id`),
  KEY `betting_logs_user_id_index` (`user_id`),
  KEY `betting_logs_platform_id_index` (`platform_id`),
  KEY `betting_logs_player_id_index` (`player_id`),
  KEY `betting_logs_game_id_index` (`game_id`),
  KEY `betting_logs_wallet_id_index` (`wallet_id`),
  KEY `betting_logs_game_type_index` (`game_type`) USING BTREE,
  KEY `betting_logs_rollover_log_id_index` (`rollover_log_id`) USING BTREE,
  CONSTRAINT `betting_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `betting_logs_ibfk_2` FOREIGN KEY (`platform_id`) REFERENCES `platforms` (`id`),
  CONSTRAINT `betting_logs_ibfk_3` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`),
  CONSTRAINT `betting_logs_ibfk_4` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`),
  CONSTRAINT `betting_logs_ibfk_5` FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `betting_reports`
--

DROP TABLE IF EXISTS `betting_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `betting_reports` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `report_type` varchar(255) DEFAULT NULL COMMENT '報表類型：daily、weekly、monthly',
  `report_at` timestamp NULL DEFAULT NULL COMMENT '報表時段：daily(每天 2023-07-08)、weekly(每週一 2023-07-03)、monthly(每月一號 2023-07-01)',
  `deposit` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '總儲值額度',
  `withdrawal` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '總提領額度',
  `payment_cost` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '金流成本(手續費)',
  `profit_loss` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '總盈虧（負數為負盈利）',
  `valid_bet` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '總有效投注',
  `bonus` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '總活動紅利，例如：首儲、二儲、流水返水...等活動',
  `commission` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '總活動紅利，例如：首儲、二儲、流水返水...等活動',
  `rebate` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '總活動紅利，例如：首儲、二儲、流水返水...等活動',
  `game_cost` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '遊戲成本（api費用：只需算負盈利 x N%）',
  `summary` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `betting_reports_user_id_report_type_report_at_unique` (`user_id`,`report_type`,`report_at`),
  KEY `betting_reports_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bonus_news`
--

DROP TABLE IF EXISTS `bonus_news`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bonus_news` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `bonus_tag_id` bigint(20) NOT NULL,
  `uuid` varchar(50) NOT NULL COMMENT '隨機檔名 uuid',
  `title` varchar(255) NOT NULL COMMENT '標題',
  `content` text NOT NULL COMMENT '內容',
  `cover_url` varchar(500) DEFAULT NULL COMMENT '標題',
  `sort` int(11) NOT NULL DEFAULT 1 COMMENT '排序',
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '啟用狀態',
  `start_at` datetime DEFAULT NULL COMMENT '公告期間/起',
  `end_at` datetime DEFAULT NULL COMMENT '公告期間/訖',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bonus_news_tags`
--

DROP TABLE IF EXISTS `bonus_news_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bonus_news_tags` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '名稱',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chat_room_announcements`
--

DROP TABLE IF EXISTS `chat_room_announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `chat_room_announcements` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `type` varchar(50) NOT NULL COMMENT 'message 的內容 (json)',
  `body` longtext NOT NULL COMMENT 'message 的內容 (json)',
  `updated_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chat_room_messages`
--

DROP TABLE IF EXISTS `chat_room_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `chat_room_messages` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `room_code` varchar(255) DEFAULT NULL COMMENT '頻道辨識碼',
  `room_type` varchar(255) DEFAULT NULL COMMENT '頻道類型 (ChatRoomTypeEnum)',
  `chattable_id` int(11) DEFAULT NULL COMMENT 'model id',
  `chattable_type` varchar(255) DEFAULT NULL COMMENT 'model type',
  `body` longtext NOT NULL COMMENT 'message 的內容 (json)',
  `admin_read_at` timestamp NULL DEFAULT NULL,
  `user_read_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL,
  PRIMARY KEY (`id`),
  KEY `chat_room_messages_chattable_id_index` (`chattable_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chat_room_privates`
--

DROP TABLE IF EXISTS `chat_room_privates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `chat_room_privates` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `chatter_id` int(11) DEFAULT NULL,
  `last_message_id` int(11) DEFAULT NULL COMMENT '最後一則訊息 id',
  `updated_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `chat_room_privates_user_id_chatter_id_unique` (`user_id`,`chatter_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `commission_checkouts`
--

DROP TABLE IF EXISTS `commission_checkouts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `commission_checkouts` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `active_users` int(11) NOT NULL DEFAULT 0 COMMENT '活躍直屬下線人數',
  `valid_bet_total` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '效投注總計',
  `profit_loss_total` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '盈虧總計',
  `commission_type` varchar(20) NOT NULL COMMENT '佣金模式 profit_and_loss:盈虧抽佣、valid_bet:流水抽佣、pl_with_vb:(盈虧＋流水)抽佣',
  `commission_total` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '結算佣金 valid_bet_total + profit_loss_total',
  `summaries` longtext DEFAULT NULL COMMENT '下線佣金摘要集合',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `commission_checkouts_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `commission_reports`
--

DROP TABLE IF EXISTS `commission_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `commission_reports` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `betting_report_id` int(11) DEFAULT NULL COMMENT '結算資料來源',
  `commission_checkout_id` bigint(20) DEFAULT NULL COMMENT '會員佣金提領記錄',
  `down_user_id` int(11) DEFAULT NULL COMMENT '下線會員 id',
  `layer` int(11) DEFAULT NULL COMMENT '下線層數',
  `valid_bet` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '原始總有效投注',
  `profit_loss` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '原始總盈虧',
  `cost` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '總成本 (payment_cost + game_cost)',
  `checkout_no` varchar(100) DEFAULT NULL COMMENT '隨機的單號，結算處理中時用來辨識是否同一批',
  `is_checkout` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否已結算到 commission_checkouts',
  `commission_percent` int(11) DEFAULT NULL COMMENT '已結算後快照佣金百分比, EX: 20 = 20%"',
  `rebate_percent` float DEFAULT NULL COMMENT '已結算後快照有效投注百分比(返水抽佣), EX: 0.5 = 0.5%',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `commission_reports_user_id_down_user_id_betting_report_id_unique` (`user_id`,`down_user_id`,`betting_report_id`),
  KEY `commission_reports_user_id_index` (`user_id`),
  KEY `commission_reports_down_user_id_index` (`down_user_id`),
  KEY `commission_reports_betting_report_id_index` (`betting_report_id`),
  KEY `commission_reports_commission_checkout_id_index` (`commission_checkout_id`),
  KEY `commission_reports_checkout_no_index` (`checkout_no`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `commission_withdraws`
--

DROP TABLE IF EXISTS `commission_withdraws`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `commission_withdraws` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `no` varchar(255) DEFAULT NULL COMMENT '單號',
  `receipt_type` varchar(255) DEFAULT NULL COMMENT '收款類型，例如：user_bank_cards、user_crypto_wallets、deposit_records',
  `receipt_id` int(11) DEFAULT NULL COMMENT '收款類型 id',
  `receipt_data` text DEFAULT NULL COMMENT '收款資訊快照 json，例如：收款帳號資訊',
  `trade_no` varchar(512) DEFAULT NULL COMMENT '交易單號（第三方交易單號）',
  `trade_response_data` text DEFAULT NULL COMMENT '第三方回傳內容',
  `trade_error_reason` longtext DEFAULT NULL COMMENT '第三方發生錯誤時的內容',
  `payment_id` bigint(20) DEFAULT NULL,
  `payment_withdrawal_option_id` int(11) DEFAULT NULL COMMENT '可支付項目 id',
  `type` varchar(255) DEFAULT NULL COMMENT '提款方式：銀行卡、虛擬貨幣、儲值',
  `is_third_party` tinyint(4) DEFAULT 0 COMMENT '是否為第三方支付',
  `user_id` int(11) DEFAULT NULL,
  `user_level` tinyint(1) NOT NULL DEFAULT 1 COMMENT '會員等級',
  `cash` decimal(15,4) DEFAULT 0.0000 COMMENT '實際金額',
  `amount` decimal(15,4) DEFAULT 0.0000 COMMENT '提領佣金',
  `txn_data` text DEFAULT NULL COMMENT '當時交易費率資料快照',
  `txn_fees` decimal(15,4) DEFAULT 0.0000 COMMENT '交易手續費： 點數(amount) x 交易費率(固定或浮動)',
  `status` varchar(255) DEFAULT NULL COMMENT '狀態：新建單(pending)、處理中(processing)、拒絕(reject)、已完成(completed)、失敗(failed)',
  `stage` varchar(20) DEFAULT NULL COMMENT '處理階段(不顯示)',
  `note` text DEFAULT NULL COMMENT '交易備註',
  `expired_at` timestamp NULL DEFAULT NULL COMMENT '查帳到期時間',
  `check_code` varchar(255) DEFAULT NULL COMMENT '核對碼，例如：銀行卡轉賬時需請備註此 code，以利雙方對帳',
  `error_code` varchar(255) DEFAULT NULL COMMENT '錯誤代碼',
  `error_message` varchar(255) DEFAULT NULL COMMENT '錯誤訊息',
  `administer_id` int(11) DEFAULT NULL COMMENT '批准者 user id',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `commission_withdraws_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `currencies`
--

DROP TABLE IF EXISTS `currencies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `currencies` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(16) NOT NULL COMMENT '幣別名稱',
  `rate` decimal(18,6) NOT NULL DEFAULT 1.000000 COMMENT '匯率：1美元可換多少法幣',
  `active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '狀態',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dashboard`
--

DROP TABLE IF EXISTS `dashboard`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `dashboard` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '報表名稱',
  `date` varchar(255) NOT NULL COMMENT '報表日期（非產檔日期）',
  `data` decimal(10,2) NOT NULL COMMENT '報表數據',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `dashborad_name_date_unique` (`name`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dashborad 數據';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `deposit_records`
--

DROP TABLE IF EXISTS `deposit_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `deposit_records` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `no` varchar(255) DEFAULT NULL COMMENT '單號',
  `trade_no` varchar(512) DEFAULT NULL COMMENT '交易單號（第三方交易單號）',
  `user_id` int(11) DEFAULT NULL COMMENT '存款人',
  `wallet_id` int(11) DEFAULT NULL COMMENT '存款入金錢包，限定主錢包',
  `currency` varchar(255) NOT NULL DEFAULT 'PHP',
  `amount` decimal(15,4) DEFAULT NULL COMMENT '存款金額',
  `status` varchar(255) DEFAULT NULL COMMENT '狀態：新建單(pending)、已付款(paid)、處理中(processing)、拒絕(reject)、已完成(completed)、失敗(failed)',
  `stage` varchar(20) DEFAULT NULL COMMENT '處理階段(不顯示)',
  `note` longtext DEFAULT NULL COMMENT '交易備註',
  `expired_at` timestamp NULL DEFAULT NULL COMMENT '查帳到期時間',
  `error_code` varchar(100) DEFAULT NULL COMMENT '錯誤代碼',
  `error_message` varchar(100) DEFAULT NULL COMMENT '錯誤訊息',
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成時間',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `deposit_records_user_id_index` (`user_id`),
  KEY `deposit_records_wallet_id_index` (`wallet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `earning_records`
--

DROP TABLE IF EXISTS `earning_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `earning_records` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `player_id` int(11) DEFAULT NULL,
  `wallet_id` int(11) DEFAULT NULL,
  `balance_original` decimal(15,4) DEFAULT NULL COMMENT '原始餘額',
  `balance` decimal(15,4) DEFAULT NULL COMMENT '錢包餘額',
  `balance_variable` decimal(15,4) DEFAULT NULL COMMENT '餘額變量，轉出或虧損為負值',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `earning_records_user_id_index` (`user_id`),
  KEY `earning_records_player_id_index` (`player_id`),
  KEY `earning_records_wallet_id_index` (`wallet_id`),
  CONSTRAINT `earning_records_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `earning_records_ibfk_2` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`),
  CONSTRAINT `earning_records_ibfk_3` FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='玩家錢包盈虧記錄';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `event_bonus_records`
--

DROP TABLE IF EXISTS `event_bonus_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `event_bonus_records` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `event_id` int(11) DEFAULT NULL,
  `user_event_id` bigint(20) DEFAULT NULL,
  `serial` varchar(255) DEFAULT NULL COMMENT '領取序號：user_event_id 結合 serial，用來判斷是否已領取紅利',
  `bonus` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '領取紅利:新增儲值單',
  `rollover_log_amount` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '流水需求',
  `ticket_id` int(11) DEFAULT NULL COMMENT '領取票券 id，若為 null 則該活動無領取票券',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '異動時間',
  `deleted_at` timestamp NULL DEFAULT NULL COMMENT '刪除時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_bonus_records_user_event_id_serial_unique` (`user_event_id`,`serial`),
  KEY `event_bonus_records_user_id_index` (`user_id`),
  KEY `event_bonus_records_event_id_index` (`event_id`),
  KEY `event_bonus_records_user_event_id_index` (`user_event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活動紅利領取記錄';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `events`
--

DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) NOT NULL COMMENT '隨機活動編號：網址變數',
  `code` varchar(255) NOT NULL COMMENT '活動代號：特定格式組合的代號，相同代號走期不能重疊',
  `name` varchar(255) NOT NULL COMMENT '活動名稱',
  `type` varchar(255) NOT NULL COMMENT '活動類型：儲值、簽到、完成任務(例如KYC)、返水、體驗金',
  `introduction` text DEFAULT NULL COMMENT '活動簡介',
  `description` text DEFAULT NULL COMMENT '活動詳細描述',
  `start_at` timestamp NULL DEFAULT NULL COMMENT '開始時間，例：2023-11-01 00:00:00',
  `end_at` timestamp NULL DEFAULT NULL COMMENT '結束時間，例：2023-11-30 23:59:59',
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '啟用狀態，停止：0、執行中：1',
  `rebateable` tinyint(1) NOT NULL DEFAULT 0 COMMENT '與此相關 betting_log 可否返水設定，預設不返水',
  `bonus_budget` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '紅利總預算：已發放 >= 總預算活動就會暫停，若設為 null 為無上限',
  `bonus_issued` decimal(15,4) NOT NULL COMMENT '已發放紅利：每次發放紅利時更新此欄位',
  `addons` text DEFAULT NULL COMMENT '依不同活動類別添加活動附加設定：參加條件、領取設定、流水設定',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '異動時間',
  `deleted_at` timestamp NULL DEFAULT NULL COMMENT '刪除時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `events_uuid_unique` (`uuid`),
  KEY `events_code_index` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活動';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `failed_jobs`
--

DROP TABLE IF EXISTS `failed_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `failed_jobs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) NOT NULL,
  `connection` text NOT NULL,
  `queue` text NOT NULL,
  `payload` longtext NOT NULL,
  `exception` longtext NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `flatten_rebate_reports`
--

DROP TABLE IF EXISTS `flatten_rebate_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `flatten_rebate_reports` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `reported_at` timestamp NULL DEFAULT NULL COMMENT '報表時段，EX: 2023-07-08',
  `data` text NOT NULL COMMENT '攤平後的資料(json)',
  `total` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '總計金額',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `flatten_rebate_reports_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `friends`
--

DROP TABLE IF EXISTS `friends`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `friends` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `target_id` int(11) DEFAULT NULL,
  `type` varchar(50) NOT NULL DEFAULT 'friends' COMMENT '狀態',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `friends_user_id_target_id_unique` (`user_id`,`target_id`),
  KEY `friends_user_id_index` (`user_id`),
  KEY `friends_target_id_index` (`target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `game_companies`
--

DROP TABLE IF EXISTS `game_companies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `game_companies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '遊戲公司名稱 gameCompanyEnum (例如: jdb, jili)',
  `platform_id` int(11) NOT NULL COMMENT '遊戲線路ID (例如: jdb線路1, jdb線路2, zf線路)',
  `platform_name` varchar(255) NOT NULL COMMENT '遊戲線路名稱(原廠：jdb,jili,ka 集成商：zf)',
  `currency` varchar(255) NOT NULL COMMENT '幣別 (例如: vnd)',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `game_companies_unique_constraint` (`name`,`platform_id`,`platform_name`,`currency`),
  KEY `game_companies_platform_id_foreign` (`platform_id`),
  CONSTRAINT `game_companies_platform_id_foreign` FOREIGN KEY (`platform_id`) REFERENCES `platforms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `game_currencies`
--

DROP TABLE IF EXISTS `game_currencies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `game_currencies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `game_id` int(11) NOT NULL COMMENT '遊戲ID',
  `currency` varchar(10) NOT NULL COMMENT '幣別 (例如: vnd)',
  `status` tinyint(4) NOT NULL DEFAULT 1 COMMENT '狀態',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `game_currencies_game_id_currency_unique` (`game_id`,`currency`),
  KEY `game_currencies_game_id_index` (`game_id`),
  KEY `game_currencies_currency_index` (`currency`),
  KEY `game_currencies_status_index` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `game_logo_histories`
--

DROP TABLE IF EXISTS `game_logo_histories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `game_logo_histories` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `game_id` bigint(20) unsigned NOT NULL,
  `path` varchar(255) NOT NULL,
  `original_path` varchar(255) DEFAULT NULL,
  `disk` varchar(255) NOT NULL DEFAULT 's3',
  `version` int(10) unsigned NOT NULL DEFAULT 1,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `game_logo_histories_game_id_index` (`game_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `game_name_translations`
--

DROP TABLE IF EXISTS `game_name_translations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `game_name_translations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `game_code` varchar(255) NOT NULL COMMENT '對應 games.code',
  `locale` varchar(10) NOT NULL COMMENT 'CMG 語系代碼 ex: zh_cn',
  `name` varchar(255) NOT NULL COMMENT '該語系的遊戲名稱',
  `source` varchar(16) NOT NULL DEFAULT 'import' COMMENT '名稱來源 ex: import, manual',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `game_name_translations_code_locale_unique` (`game_code`,`locale`),
  KEY `game_name_translations_locale_name_index` (`locale`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `game_types`
--

DROP TABLE IF EXISTS `game_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `game_types` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '遊戲類型 ( GameTypeEnum )',
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '商戶控制是否展示於前台',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `games`
--

DROP TABLE IF EXISTS `games`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `games` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(255) DEFAULT NULL COMMENT '自訂遊戲代碼 ex: 廠商＋廠商遊戲id JDB_7_7006',
  `signature` varchar(255) NOT NULL COMMENT '遊戲序號',
  `name` varchar(255) DEFAULT NULL COMMENT '遊戲名稱：獵龍高手 Dragon Master',
  `logo` varchar(255) DEFAULT NULL COMMENT 'logo url',
  `type` varchar(255) DEFAULT NULL COMMENT '遊戲類型，捕魚(fish),電子(slot),彩票(lottery),棋牌(chess),體育(sport),真人(live),實時彩票(lottery-live)',
  `platform_name` varchar(255) DEFAULT NULL COMMENT '遊戲線路名稱(原廠：jdb,jili,ka 集成商：zf)',
  `game_company_name` varchar(20) NOT NULL COMMENT '遊戲公司名稱 gameCompanyEnum (例如: jdb, jili)',
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '商戶控制是否展示於前台',
  `maintain` tinyint(1) NOT NULL DEFAULT 0 COMMENT '維護狀態',
  `orientation` char(3) DEFAULT NULL COMMENT '螢幕方向: H=橫向, V=直向, ALL=所有',
  `is_recommended` varchar(10) NOT NULL DEFAULT 'none' COMMENT '推薦狀態: rec=推薦, not=不推薦, none=未設定',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `games_code_unique` (`code`),
  KEY `games_serial_index` (`signature`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `genealogies`
--

DROP TABLE IF EXISTS `genealogies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `genealogies` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL COMMENT '會員 id',
  `up_user_id` int(11) NOT NULL COMMENT '上層會員 id',
  `layer` int(11) NOT NULL COMMENT '層數',
  PRIMARY KEY (`id`),
  KEY `genealogies_user_id_index` (`user_id`),
  KEY `genealogies_up_user_id_index` (`up_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `gross_profit_reports`
--

DROP TABLE IF EXISTS `gross_profit_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `gross_profit_reports` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `report_at` timestamp NOT NULL COMMENT '異動時間',
  `deposit_total` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '充值總額',
  `withdrawal_total` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '提領總額',
  `deposit_and_withdrawal_diff` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '充提差',
  `deposit_and_withdrawal_fees_total` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '充提手續費',
  `rebate_total` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '返水總額',
  `bonus_total` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '紅利總額',
  `commission_total` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '佣金總額',
  `game_cost` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '遊戲成本',
  `gross_profit` decimal(15,4) DEFAULT NULL COMMENT '每日毛利',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '異動時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `gross_profit_report_at_unique` (`report_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `guild_users`
--

DROP TABLE IF EXISTS `guild_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `guild_users` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `guild_id` bigint(20) NOT NULL,
  `role` varchar(50) NOT NULL DEFAULT 'member' COMMENT '角色（會長、副會長、成員）',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '更新時間',
  `deleted_at` timestamp NULL DEFAULT NULL COMMENT '刪除時間',
  PRIMARY KEY (`id`),
  KEY `guild_users_user_id_index` (`user_id`),
  KEY `guild_users_guild_id_index` (`guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `guilds`
--

DROP TABLE IF EXISTS `guilds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `guilds` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL COMMENT '名稱',
  `creator_id` bigint(20) NOT NULL COMMENT '創建者 user_id',
  `level` tinyint(1) NOT NULL DEFAULT 0 COMMENT '等級',
  `intro` text DEFAULT NULL COMMENT '簡介',
  `description` text DEFAULT NULL COMMENT '描述',
  `balance` int(11) DEFAULT 0 COMMENT '餘額',
  `settings` text DEFAULT NULL COMMENT '設定（json）',
  `deleted_reason` varchar(50) DEFAULT NULL COMMENT '解散原因',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '更新時間',
  `deleted_at` timestamp NULL DEFAULT NULL COMMENT '刪除時間',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `i18n_descriptions`
--

DROP TABLE IF EXISTS `i18n_descriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `i18n_descriptions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(520) NOT NULL COMMENT 'key',
  `tags` text DEFAULT NULL COMMENT 'tags',
  `description` text NOT NULL COMMENT '描述',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `i18n_languages`
--

DROP TABLE IF EXISTS `i18n_languages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `i18n_languages` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '語言名稱',
  `locale_code` varchar(255) NOT NULL COMMENT '語言區域標識符',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `i18n_translated`
--

DROP TABLE IF EXISTS `i18n_translated`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `i18n_translated` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `i18n_description_id` bigint(20) unsigned NOT NULL COMMENT '語言描述 id',
  `i18n_language_id` bigint(20) unsigned NOT NULL COMMENT '語言 id',
  `translated` text DEFAULT NULL COMMENT '譯文',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `i18n_translated_i18n_description_id_foreign` (`i18n_description_id`),
  KEY `i18n_translated_i18n_language_id_foreign` (`i18n_language_id`),
  CONSTRAINT `i18n_translated_i18n_description_id_foreign` FOREIGN KEY (`i18n_description_id`) REFERENCES `i18n_descriptions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `i18n_translated_i18n_language_id_foreign` FOREIGN KEY (`i18n_language_id`) REFERENCES `i18n_languages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `job_batches`
--

DROP TABLE IF EXISTS `job_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `job_batches` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `total_jobs` int(11) NOT NULL,
  `pending_jobs` int(11) NOT NULL,
  `failed_jobs` int(11) NOT NULL,
  `failed_job_ids` longtext NOT NULL,
  `options` mediumtext DEFAULT NULL,
  `cancelled_at` int(11) DEFAULT NULL,
  `created_at` int(11) NOT NULL,
  `finished_at` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `login_logs`
--

DROP TABLE IF EXISTS `login_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `login_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `subject_type` varchar(255) NOT NULL,
  `subject_id` int(10) unsigned NOT NULL,
  `use_remember_me` varchar(5) NOT NULL DEFAULT 'no' COMMENT '是否使用記住我 (yes, no)',
  `last_login_ip` varchar(255) DEFAULT NULL COMMENT '登入 IP',
  `last_login_use_of` varchar(255) DEFAULT NULL COMMENT '登入方式',
  `last_login_at` timestamp NOT NULL DEFAULT current_timestamp() COMMENT '建立時間',
  PRIMARY KEY (`id`),
  KEY `subject_type` (`subject_type`),
  KEY `subject_id` (`subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `maintain_schedules`
--

DROP TABLE IF EXISTS `maintain_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `maintain_schedules` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `model_type` varchar(255) DEFAULT NULL COMMENT '第三方類型',
  `model_id` int(11) DEFAULT NULL COMMENT '第三方 id',
  `start_at` timestamp NULL DEFAULT NULL COMMENT '開始時間，例：2023-11-01 00:00:00',
  `end_at` timestamp NULL DEFAULT NULL COMMENT '結束時間，例：2023-11-30 23:59:59',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='第三方服務維護排程，支援遊戲商、支付商、簡訊商...等等';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `medias`
--

DROP TABLE IF EXISTS `medias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medias` (
  `uuid` char(36) NOT NULL DEFAULT '',
  `mediable_id` bigint(20) unsigned NOT NULL COMMENT 'Model id',
  `mediable_type` varchar(255) NOT NULL COMMENT 'Model 類型',
  `name` varchar(255) NOT NULL COMMENT '檔案名稱',
  `path` varchar(255) DEFAULT NULL COMMENT '儲存路徑',
  `type` varchar(255) NOT NULL COMMENT '類型',
  `scope` varchar(255) NOT NULL COMMENT '種類/用途',
  `sort` mediumint(9) NOT NULL DEFAULT 0 COMMENT '排序',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `migrations`
--

DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `migrations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) NOT NULL,
  `batch` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=172 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `model_has_permissions`
--

DROP TABLE IF EXISTS `model_has_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `model_has_permissions` (
  `permission_id` bigint(20) NOT NULL,
  `model_type` varchar(255) NOT NULL,
  `model_id` bigint(20) NOT NULL,
  PRIMARY KEY (`permission_id`,`model_id`,`model_type`),
  KEY `model_has_permissions_model_id_model_type_index` (`model_id`,`model_type`),
  CONSTRAINT `model_has_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `model_has_roles`
--

DROP TABLE IF EXISTS `model_has_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `model_has_roles` (
  `role_id` bigint(20) NOT NULL,
  `model_type` varchar(255) NOT NULL,
  `model_id` bigint(20) NOT NULL,
  PRIMARY KEY (`role_id`,`model_id`,`model_type`),
  KEY `model_has_roles_model_id_model_type_index` (`model_id`,`model_type`),
  CONSTRAINT `model_has_roles_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `news`
--

DROP TABLE IF EXISTS `news`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `news` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `news_tag_id` bigint(20) NOT NULL,
  `uuid` varchar(50) NOT NULL COMMENT '隨機檔名 uuid',
  `title` varchar(255) NOT NULL COMMENT '標題',
  `content` text NOT NULL COMMENT '內容',
  `sort` int(11) NOT NULL DEFAULT 1 COMMENT '排序',
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '啟用狀態',
  `start_at` timestamp NULL DEFAULT NULL COMMENT '公告期間/起',
  `end_at` timestamp NULL DEFAULT NULL COMMENT '公告期間/訖',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `news_tags`
--

DROP TABLE IF EXISTS `news_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `news_tags` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '名稱',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `orders` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) DEFAULT NULL COMMENT '產品 ID',
  `deposit_record_id` bigint(20) DEFAULT NULL COMMENT '儲值 ID',
  `user_id` int(11) DEFAULT NULL COMMENT '購買人',
  `price` int(11) NOT NULL DEFAULT 0 COMMENT '價格',
  `point` int(11) NOT NULL DEFAULT 0 COMMENT '點數',
  `tickets` text DEFAULT NULL COMMENT '禮包票券資料',
  `status` varchar(255) DEFAULT NULL COMMENT '狀態：新建單(pending)、處理中(processing)、拒絕(reject)、已完成(completed)、失敗(failed)',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '異動時間',
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `orders_product_id_index` (`product_id`),
  KEY `orders_deposit_record_id_index` (`deposit_record_id`),
  KEY `orders_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='產品包訂單';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pages`
--

DROP TABLE IF EXISTS `pages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pages` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL COMMENT '標題',
  `content` longtext DEFAULT NULL COMMENT '內文',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `password_reset_tokens`
--

DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `password_reset_tokens` (
  `email` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payment_deposit_options`
--

DROP TABLE IF EXISTS `payment_deposit_options`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_deposit_options` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payment_id` int(11) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '啟用狀態',
  `mode` varchar(255) NOT NULL COMMENT '收付種類 PaymentModeEnum (bank、crypto、ewallet)',
  `option_type` varchar(255) NOT NULL COMMENT 'PaymentTypeEnum',
  `min` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '儲值下限',
  `max` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '儲值上限',
  `txn_data` text DEFAULT NULL COMMENT '提領交易費率設定, fixed、fee、rate',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_deposit_payment_id_mode_option_type_unique` (`payment_id`,`mode`,`option_type`),
  KEY `payment_deposit_payment_id_index` (`payment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=' 可支付項目（儲值）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payment_history_records`
--

DROP TABLE IF EXISTS `payment_history_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_history_records` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `no` varchar(255) NOT NULL,
  `model_type` varchar(255) NOT NULL,
  `model_id` bigint(20) NOT NULL,
  `payment_id` int(11) DEFAULT NULL,
  `gateway_provider` varchar(50) NOT NULL,
  `response_data` longtext DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payment_logs`
--

DROP TABLE IF EXISTS `payment_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `payment_id` int(11) DEFAULT NULL,
  `model_type` varchar(255) DEFAULT NULL COMMENT '收支來源類型，例如：deposit_records、withdrawal_records、commission_withdraws',
  `model_id` int(11) DEFAULT NULL COMMENT '收支來源 id',
  `type` varchar(255) NOT NULL COMMENT '收支類型（ PaymentLogTypeEnum )',
  `variable` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '收款上限',
  `amount` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '當前已收款',
  `note` varchar(255) DEFAULT NULL COMMENT '備註（必填）',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payment_withdrawal_options`
--

DROP TABLE IF EXISTS `payment_withdrawal_options`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_withdrawal_options` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payment_id` int(11) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '啟用狀態',
  `mode` varchar(255) NOT NULL COMMENT '收付種類 PaymentModeEnum (bank、crypto、ewallet)',
  `option_type` varchar(255) NOT NULL COMMENT 'PaymentTypeGroupEnum',
  `min` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '儲值下限',
  `max` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '儲值上限',
  `txn_data` text DEFAULT NULL COMMENT '儲值交易費率設定, fixed、fee、rate',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_withdrawal_payment_id_mode_option_type_unique` (`payment_id`,`mode`,`option_type`),
  KEY `payment_withdrawal_payment_id_index` (`payment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=' 可支付項目（提款）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `active` tinyint(1) DEFAULT 0,
  `platform_kind` varchar(255) NOT NULL,
  `currency` varchar(100) DEFAULT NULL COMMENT '貨幣別',
  `merchant` varchar(100) DEFAULT NULL COMMENT 'This column is the entry point of the code, and its value is from PaymentMerchantEnum.',
  `maximum_amount` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `current_amount` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `maximum_trades` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '交易次數上限' CHECK (json_valid(`maximum_trades`)),
  `current_trades` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '當前已交易次數' CHECK (json_valid(`current_trades`)),
  `period` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '24 小時可服務時段' CHECK (json_valid(`period`)),
  `api_url` text DEFAULT NULL,
  `api_tokens` longtext DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `permissions`
--

DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `permissions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `guard_name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `permissions_name_guard_name_unique` (`name`,`guard_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `personal_access_tokens`
--

DROP TABLE IF EXISTS `personal_access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `personal_access_tokens` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tokenable_type` varchar(255) NOT NULL,
  `tokenable_id` bigint(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `token` varchar(64) NOT NULL,
  `abilities` text DEFAULT NULL,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `personal_access_tokens_token_unique` (`token`),
  KEY `personal_access_tokens_tokenable_type_tokenable_id_index` (`tokenable_type`,`tokenable_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `platform_currencies`
--

DROP TABLE IF EXISTS `platform_currencies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `platform_currencies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `platform_id` bigint(20) unsigned NOT NULL COMMENT 'platforms.id，線路級設定',
  `currency` varchar(8) NOT NULL COMMENT 'CMG 幣別代碼',
  `vendor_currency_code` varchar(32) NOT NULL COMMENT '這條線送給廠商的幣別代碼，對應幣別策略 config 的鍵',
  `source` varchar(16) NOT NULL COMMENT 'declared＝線路自己宣告；derived＝由策略 config 唯一推導；manual＝人工補',
  `remark` varchar(255) DEFAULT NULL COMMENT '值的來源或人工補列的理由',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_currencies_platform_currency_unique` (`platform_id`,`currency`),
  KEY `platform_currencies_vendor_currency_code_index` (`vendor_currency_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `platform_game_type_map`
--

DROP TABLE IF EXISTS `platform_game_type_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `platform_game_type_map` (
  `platform_id` int(10) unsigned NOT NULL,
  `game_type_id` int(10) unsigned NOT NULL,
  `active` tinyint(4) NOT NULL DEFAULT 0,
  `cost_percent` float DEFAULT NULL,
  UNIQUE KEY `platform_id_type_id_unique` (`platform_id`,`game_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `platform_maintenance_schedules`
--

DROP TABLE IF EXISTS `platform_maintenance_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `platform_maintenance_schedules` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `platform` varchar(32) NOT NULL COMMENT 'PlatformEnum value ex: rsg',
  `weekday` tinyint(3) unsigned NOT NULL COMMENT '0=週日 ~ 6=週六，與 Carbon dayOfWeek 一致',
  `start_time` time NOT NULL COMMENT '廠商公告的維護開始時間',
  `duration_minutes` smallint(5) unsigned NOT NULL COMMENT '廠商公告的維護時長，1~1440',
  `lead_minutes` tinyint(3) unsigned NOT NULL DEFAULT 2 COMMENT '提前生效分鐘數，0~120',
  `trail_minutes` tinyint(3) unsigned NOT NULL DEFAULT 0 COMMENT '延後解除分鐘數，0~120',
  `reason` varchar(255) DEFAULT NULL COMMENT '維護原因，空值時由 runner 自動組字',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '停用後不產生窗口，但規則保留',
  `effective_from` date DEFAULT NULL COMMENT '生效起日，含當日',
  `effective_until` date DEFAULT NULL COMMENT '生效迄日，含當日',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `pms_enabled_weekday_index` (`enabled`,`weekday`),
  KEY `pms_platform_index` (`platform`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `platforms`
--

DROP TABLE IF EXISTS `platforms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `platforms` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL COMMENT '遊戲線路名稱（原廠：jdb,jili,ka 集成商：zf）',
  `is_original` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否為原廠線路',
  `api_settings` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '遊戲線路API設定' CHECK (json_valid(`api_settings`)),
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'å•†æˆ¶æŽ§åˆ¶æ˜¯å¦å±•ç¤ºæ–¼å‰å°',
  `maintain` tinyint(1) DEFAULT 0 COMMENT '商戶是否維護中',
  `authorized` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'æœªæŽˆæ¬Šæ–¼å•†æˆ¶ authorized å‰‡ç‚º 0',
  `is_main` int(11) DEFAULT NULL COMMENT 'æ˜¯å¦ç‚ºç¶²ç«™è‡ªå·±çš„éŠæˆ²å¹³å°çš„éŒ¢åŒ… MAIN',
  `raw_log_sync` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否參與注單同步輪詢；共用同一組廠商帳號的多筆記錄只應保留一筆',
  `sort` int(11) DEFAULT 0,
  `currencies` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '支援的幣別列表',
  `regions` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '支援的地區列表',
  `game_types` text DEFAULT NULL COMMENT '擁有的遊戲類型(json)',
  `raw_index` varchar(255) DEFAULT NULL COMMENT 'betLog目前版本/時間的紀錄',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sort` (`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `play_logs`
--

DROP TABLE IF EXISTS `play_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `play_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `station_id` bigint(20) unsigned NOT NULL COMMENT '站台ID',
  `platform_id` int(11) DEFAULT NULL,
  `user_id` int(11) NOT NULL,
  `player_id` int(11) DEFAULT NULL,
  `game_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `play_logs_platform_id_index` (`platform_id`),
  KEY `play_logs_player_id_index` (`player_id`),
  KEY `play_logs_station_id_index` (`station_id`),
  KEY `play_logs_user_id_foreign` (`user_id`),
  CONSTRAINT `play_logs_ibfk_2` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`),
  CONSTRAINT `play_logs_ibfk_3` FOREIGN KEY (`platform_id`) REFERENCES `platforms` (`id`),
  CONSTRAINT `play_logs_station_id_foreign` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`),
  CONSTRAINT `play_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `players`
--

DROP TABLE IF EXISTS `players`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `players` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `station_id` bigint(20) unsigned NOT NULL COMMENT '站台ID',
  `platform_id` int(11) DEFAULT NULL,
  `user_id` int(11) NOT NULL,
  `account` varchar(255) DEFAULT NULL COMMENT 'ç™»å…¥éŠæˆ²å¹³å°çš„çŽ©å®¶å¸³è™Ÿï¼ŒåŸºæœ¬æ ¼å¼ï¼šåŒ…ç¶²è‹±æ–‡åç¨±ç¸®å¯«ï¼‹user_nameï¼Œä¾‹å¦‚ï¼šwincash + player1234 = wincashplayer1234',
  `vendor_player_id` varchar(255) DEFAULT NULL COMMENT '遊戲供應商提供的玩家識別碼',
  `playing` int(11) DEFAULT NULL COMMENT 'æ˜¯å¦æ­£åœ¨è©²éŠæˆ²å¹³å°çŽ©',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `players_station_platform_account_unique` (`station_id`,`platform_id`,`account`),
  UNIQUE KEY `players_vendor_player_id_unique` (`vendor_player_id`),
  KEY `players_platform_id_index` (`platform_id`),
  KEY `players_station_id_index` (`station_id`),
  KEY `players_user_id_foreign` (`user_id`),
  CONSTRAINT `players_ibfk_2` FOREIGN KEY (`platform_id`) REFERENCES `platforms` (`id`),
  CONSTRAINT `players_station_id_foreign` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`),
  CONSTRAINT `players_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_packages`
--

DROP TABLE IF EXISTS `product_packages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_packages` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) DEFAULT NULL COMMENT '產品 ID',
  `user_id` int(11) DEFAULT NULL COMMENT '購買人',
  `serial_number` varchar(255) DEFAULT NULL COMMENT '產品包序號 product_code + 10 ~ 12碼大寫英文數字 + 1驗證碼，共16碼且不可重複',
  `price` int(11) NOT NULL DEFAULT 0 COMMENT '價格',
  `point` int(11) NOT NULL DEFAULT 0 COMMENT '點數',
  `tickets` text DEFAULT NULL COMMENT '禮包票券資料',
  `status` varchar(255) DEFAULT NULL COMMENT '兌換狀態：未兌換(pending)、處理中(processing)、已完成(completed)',
  `expires_at` timestamp NULL DEFAULT NULL COMMENT '有效日期，NULL 為無期限',
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成時間',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '異動時間',
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_packages_serial_number_unique` (`serial_number`),
  KEY `product_packages_product_id_index` (`product_id`),
  KEY `product_packages_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='實體產品包';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_serials`
--

DROP TABLE IF EXISTS `product_serials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_serials` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) DEFAULT NULL COMMENT '產品 ID',
  `user_id` int(11) DEFAULT NULL COMMENT '購買人',
  `serial_number` varchar(255) DEFAULT NULL COMMENT '產品包序號 product_code + 10 ~ 12碼大寫英文數字 + 1驗證碼，共16碼且不可重複',
  `price` int(11) NOT NULL DEFAULT 0 COMMENT '價格',
  `point` int(11) NOT NULL DEFAULT 0 COMMENT '點數',
  `tickets` text DEFAULT NULL COMMENT '禮包票券資料',
  `status` varchar(255) DEFAULT NULL COMMENT '兌換狀態：未兌換(pending)、處理中(processing)、已完成(completed)',
  `expires_at` timestamp NULL DEFAULT NULL COMMENT '有效日期，NULL 為無期限',
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成時間',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '異動時間',
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_serials_serial_number_unique` (`serial_number`),
  KEY `product_serials_product_id_index` (`product_id`),
  KEY `product_serials_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='產品包序號';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '產品名稱',
  `code` varchar(255) NOT NULL COMMENT '產品編號，3~5碼 大寫英文數字，例如：',
  `type` varchar(255) NOT NULL COMMENT '產品類型，單選(快速購點 fast、優惠包 discount、序號 serial_number)',
  `price` int(11) NOT NULL DEFAULT 0 COMMENT '價格',
  `point` int(11) NOT NULL DEFAULT 0 COMMENT '點數',
  `logo` varchar(255) DEFAULT NULL COMMENT '產品圖片',
  `quantity` int(11) DEFAULT NULL COMMENT '發行量，null 為無限制',
  `tickets` text DEFAULT NULL COMMENT '禮包票券資料',
  `description` text DEFAULT NULL COMMENT '商品描述',
  `status` varchar(100) DEFAULT NULL COMMENT '上架狀態：銷售中(on_sale)、補貨中(restocking)、已停售(discontinued)',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '異動時間',
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `products_code_unique` (`code`),
  KEY `products_name_index` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='產品包';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `promotion_tags`
--

DROP TABLE IF EXISTS `promotion_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `promotion_tags` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '名稱',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `promotions`
--

DROP TABLE IF EXISTS `promotions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `promotions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `promotion_tag_id` bigint(20) NOT NULL,
  `uuid` varchar(50) NOT NULL COMMENT '隨機檔名 uuid',
  `title` varchar(255) NOT NULL COMMENT '標題',
  `content` text NOT NULL COMMENT '內容',
  `cover_url` varchar(500) DEFAULT NULL COMMENT '標題',
  `sort` int(11) NOT NULL DEFAULT 1 COMMENT '排序',
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '啟用狀態',
  `start_at` datetime DEFAULT NULL COMMENT '公告期間/起',
  `end_at` datetime DEFAULT NULL COMMENT '公告期間/訖',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pulse_aggregates`
--

DROP TABLE IF EXISTS `pulse_aggregates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pulse_aggregates` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `bucket` int(10) unsigned NOT NULL,
  `period` mediumint(8) unsigned NOT NULL,
  `type` varchar(255) NOT NULL,
  `key` mediumtext NOT NULL,
  `key_hash` binary(16) GENERATED ALWAYS AS (unhex(md5(`key`))) VIRTUAL,
  `aggregate` varchar(255) NOT NULL,
  `value` decimal(20,2) NOT NULL,
  `count` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_aggregates_bucket_period_type_aggregate_key_hash_unique` (`bucket`,`period`,`type`,`aggregate`,`key_hash`),
  KEY `pulse_aggregates_period_bucket_index` (`period`,`bucket`),
  KEY `pulse_aggregates_type_index` (`type`),
  KEY `pulse_aggregates_period_type_aggregate_bucket_index` (`period`,`type`,`aggregate`,`bucket`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pulse_entries`
--

DROP TABLE IF EXISTS `pulse_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pulse_entries` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `timestamp` int(10) unsigned NOT NULL,
  `type` varchar(255) NOT NULL,
  `key` mediumtext NOT NULL,
  `key_hash` binary(16) GENERATED ALWAYS AS (unhex(md5(`key`))) VIRTUAL,
  `value` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `pulse_entries_timestamp_index` (`timestamp`),
  KEY `pulse_entries_type_index` (`type`),
  KEY `pulse_entries_key_hash_index` (`key_hash`),
  KEY `pulse_entries_timestamp_type_key_hash_value_index` (`timestamp`,`type`,`key_hash`,`value`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pulse_values`
--

DROP TABLE IF EXISTS `pulse_values`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pulse_values` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `timestamp` int(10) unsigned NOT NULL,
  `type` varchar(255) NOT NULL,
  `key` mediumtext NOT NULL,
  `key_hash` binary(16) GENERATED ALWAYS AS (unhex(md5(`key`))) VIRTUAL,
  `value` mediumtext NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pulse_values_type_key_hash_unique` (`type`,`key_hash`),
  KEY `pulse_values_timestamp_index` (`timestamp`),
  KEY `pulse_values_type_index` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `qa_tags`
--

DROP TABLE IF EXISTS `qa_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `qa_tags` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '名稱',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `qas`
--

DROP TABLE IF EXISTS `qas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `qas` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `qa_tag_id` bigint(20) unsigned NOT NULL,
  `title` varchar(255) NOT NULL COMMENT '標題',
  `content` text NOT NULL COMMENT '內文',
  `active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '發佈狀態',
  `active_home` int(11) NOT NULL DEFAULT 0 COMMENT '是否顯示於首頁',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `qas_qa_tag_id_index` (`qa_tag_id`),
  CONSTRAINT `qas_ibfk_1` FOREIGN KEY (`qa_tag_id`) REFERENCES `qa_tags` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rebate_records`
--

DROP TABLE IF EXISTS `rebate_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rebate_records` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `report_at` timestamp NULL DEFAULT NULL COMMENT '報表時段：daily(每天 2023-07-08)、weekly(每週一 2023-07-03)、monthly(每月一號 2023-07-01)',
  `amount` decimal(10,3) DEFAULT NULL COMMENT '返水總金額',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rebate_records_user_id_report_at_unique` (`user_id`,`report_at`),
  KEY `rebate_records_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='返水紀錄總表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rebate_reports`
--

DROP TABLE IF EXISTS `rebate_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rebate_reports` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `report_at` timestamp NULL DEFAULT NULL COMMENT '報表時段，EX: 2023-07-08',
  `game_type` varchar(255) DEFAULT NULL COMMENT '遊戲類型，捕魚(fish),電子(slot),彩票(lottery),棋牌(chess),體育(sport),真人(live),實時彩票(lottery-live)',
  `percent` float DEFAULT NULL COMMENT '返水抽佣百分比快照, EX: 0.5 = 0.5%',
  `valid_bet` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '總有效投注',
  `amount` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '分類總返水',
  `rebate_record_id` bigint(20) DEFAULT NULL COMMENT '返水紀錄總表 id',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rebate_reports_user_id_report_at_game_type_unique` (`user_id`,`report_at`,`game_type`),
  KEY `rebate_reports_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='返水記錄分類表（每日）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `remittance_records`
--

DROP TABLE IF EXISTS `remittance_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `remittance_records` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `platform_id` bigint(20) unsigned DEFAULT NULL COMMENT '平台ID',
  `station_id` bigint(20) unsigned DEFAULT NULL COMMENT '站台ID',
  `user_id` int(11) NOT NULL,
  `no` varchar(255) DEFAULT NULL COMMENT '平台加值紀錄編號',
  `txn_no` varchar(255) DEFAULT NULL COMMENT '遊戲商交易編號',
  `type` varchar(255) DEFAULT NULL COMMENT '加值類型',
  `wallet_id` int(11) DEFAULT NULL,
  `receipt_wallet_id` int(11) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL COMMENT '幣別',
  `amount` decimal(15,4) DEFAULT NULL COMMENT '加值金額',
  `status` varchar(255) DEFAULT NULL COMMENT '加值狀態',
  `stage` varchar(20) DEFAULT NULL COMMENT '處理階段(不顯示)',
  `note` text DEFAULT NULL COMMENT '備註',
  `error_code` varchar(100) DEFAULT NULL COMMENT '錯誤代碼',
  `error_message` varchar(100) DEFAULT NULL COMMENT '錯誤訊息',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `remittance_records_user_id_foreign` (`user_id`),
  KEY `remittance_records_wallet_id_foreign` (`wallet_id`),
  KEY `remittance_records_receipt_wallet_id_foreign` (`receipt_wallet_id`),
  KEY `remittance_records_user_id_type_stage_status_index` (`user_id`,`type`,`stage`,`status`),
  KEY `remittance_records_type_status_stage_created_at_index` (`type`,`status`,`stage`,`created_at`),
  CONSTRAINT `remittance_records_receipt_wallet_id_foreign` FOREIGN KEY (`receipt_wallet_id`) REFERENCES `wallets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `remittance_records_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `remittance_records_wallet_id_foreign` FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `report_logs`
--

DROP TABLE IF EXISTS `report_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `report_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '報表名稱',
  `file_uri` text DEFAULT NULL COMMENT '報表檔案 (uri)',
  `status` varchar(255) NOT NULL DEFAULT 'pending' COMMENT '狀態 (pending, success, fail)',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `risk_event_user_map`
--

DROP TABLE IF EXISTS `risk_event_user_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `risk_event_user_map` (
  `risk_event_id` bigint(20) unsigned NOT NULL,
  `user_id` int(11) NOT NULL,
  `detaching_at` timestamp NULL DEFAULT NULL,
  UNIQUE KEY `risk_event_id_user_id_unique` (`risk_event_id`,`user_id`),
  KEY `risk_event_user_map_risk_user_id_foreign` (`user_id`),
  CONSTRAINT `risk_event_user_map_risk_event_id_foreign` FOREIGN KEY (`risk_event_id`) REFERENCES `risk_events` (`id`),
  CONSTRAINT `risk_event_user_map_risk_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `risk_event_withdrawal_map`
--

DROP TABLE IF EXISTS `risk_event_withdrawal_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `risk_event_withdrawal_map` (
  `risk_event_id` bigint(20) unsigned NOT NULL,
  `withdrawal_record_id` bigint(20) unsigned NOT NULL,
  `detaching_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  UNIQUE KEY `unique_risk_event_withdrawal` (`risk_event_id`,`withdrawal_record_id`),
  KEY `risk_event_withdrawal_map_risk_event_id_index` (`risk_event_id`),
  KEY `risk_event_withdrawal_map_withdrawal_record_id_index` (`withdrawal_record_id`),
  CONSTRAINT `risk_event_withdrawal_map_ibfk_1` FOREIGN KEY (`risk_event_id`) REFERENCES `risk_events` (`id`),
  CONSTRAINT `risk_event_withdrawal_map_ibfk_2` FOREIGN KEY (`withdrawal_record_id`) REFERENCES `withdrawal_records` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `risk_events`
--

DROP TABLE IF EXISTS `risk_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `risk_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `hashtag` varchar(250) NOT NULL COMMENT '事件標籤, 利用風控條件進行 hash 而成的, 用來檢索的索引',
  `type` varchar(100) NOT NULL COMMENT '風控類型 (RiskTypeEnum)',
  `note` longtext DEFAULT NULL,
  `status` varchar(100) NOT NULL DEFAULT 'pending' COMMENT '狀態 (RiskStatusTypeEnum)',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `risk_events_hashtag_unique` (`hashtag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `role_has_permissions`
--

DROP TABLE IF EXISTS `role_has_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `role_has_permissions` (
  `permission_id` bigint(20) NOT NULL,
  `role_id` bigint(20) NOT NULL,
  `can_edit` tinyint(4) NOT NULL DEFAULT 0 COMMENT '是否可編輯',
  PRIMARY KEY (`permission_id`,`role_id`),
  KEY `role_has_permissions_role_id_foreign` (`role_id`),
  CONSTRAINT `role_has_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `role_has_permissions_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `roles` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `guard_name` varchar(255) NOT NULL,
  `hierarchy` int(11) NOT NULL DEFAULT 10 COMMENT '階級',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `roles_name_guard_name_unique` (`name`,`guard_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rollover_logs`
--

DROP TABLE IF EXISTS `rollover_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rollover_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `no` varchar(255) NOT NULL COMMENT '流水編號',
  `user_id` int(11) DEFAULT NULL,
  `model_type` varchar(255) DEFAULT NULL COMMENT '流水來源類型，例如：deposit_records、event_bonus_records、ticket_bonus_records、rebate_records',
  `model_id` int(11) DEFAULT NULL COMMENT '流水來源 id',
  `amount` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '流水額度（有可能是單筆或多筆合計，例如儲值活動，儲值＋紅利）',
  `origin_amount` decimal(15,4) DEFAULT 0.0000 COMMENT '無倍數原始交易額度（有可能是單筆或多筆合計，例如儲值活動，儲值＋紅利）',
  `game` text DEFAULT NULL COMMENT '遊戲流水限制，驗證 betting_log 會依據此條件，例如：{''allow'': {''column'': ''platform'',''list'': [''jdb'',''ag'']},''block'': {''column'': ''game_type'',''list'': [''fish'',''slots'']}}',
  `rebateable` tinyint(1) NOT NULL DEFAULT 0 COMMENT '與此相關 betting_log 可否返水設定，預設不返水',
  `note` text DEFAULT NULL COMMENT '備註',
  `filled_at` timestamp NULL DEFAULT NULL COMMENT '滿足流水時間（手動終止也算）',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rollover_logs_user_id_model_type_model_id_unique` (`user_id`,`model_type`,`model_id`),
  KEY `rollover_logs_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='流水記錄';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rollover_map`
--

DROP TABLE IF EXISTS `rollover_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rollover_map` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `rollover_log_id` bigint(20) DEFAULT NULL COMMENT '流水歸屬',
  `dependable_type` varchar(255) DEFAULT NULL COMMENT '流水來源類型，例如：deposit_records',
  `dependable_id` int(11) DEFAULT NULL COMMENT '流水來源 id',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rollover_map_rollover_log_id_dependable_unique` (`rollover_log_id`,`dependable_type`,`dependable_id`),
  KEY `rollover_map_rollover_log_id_index` (`rollover_log_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='流水歸屬關聯';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `schedule_logs`
--

DROP TABLE IF EXISTS `schedule_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `schedule_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `task_name` varchar(255) NOT NULL,
  `status` varchar(50) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `service_issue_categories`
--

DROP TABLE IF EXISTS `service_issue_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `service_issue_categories` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '類型名稱',
  `description` text DEFAULT NULL COMMENT '類型描述',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `service_issues`
--

DROP TABLE IF EXISTS `service_issues`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `service_issues` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `issueable_type` varchar(255) NOT NULL COMMENT 'Model type',
  `service_issue_category_id` bigint(20) unsigned NOT NULL COMMENT '問題類型 id',
  `issueable_id` int(11) NOT NULL,
  `closed_by_administer_id` int(11) DEFAULT NULL COMMENT '關閉者 id',
  `last_message_id` int(11) DEFAULT NULL COMMENT '關閉者 id',
  `type` varchar(255) DEFAULT NULL COMMENT '問題類型 (IssueTypeEnum)',
  `summaries` text DEFAULT NULL COMMENT '問題內容摘要',
  `answer` text DEFAULT NULL COMMENT '問題回覆',
  `closed_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL,
  PRIMARY KEY (`id`),
  KEY `issues_closed_by_administer_id_index` (`closed_by_administer_id`),
  KEY `last_message_id_index` (`last_message_id`),
  KEY `service_issues_issueable_type_issueable_id_index` (`issueable_type`,`issueable_id`),
  KEY `service_issues_service_issue_category_id_foreign` (`service_issue_category_id`),
  CONSTRAINT `service_issues_service_issue_category_id_foreign` FOREIGN KEY (`service_issue_category_id`) REFERENCES `service_issue_categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `service_issues_administer_map`
--

DROP TABLE IF EXISTS `service_issues_administer_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `service_issues_administer_map` (
  `service_issue_id` int(11) NOT NULL,
  `administer_id` int(11) NOT NULL,
  UNIQUE KEY `issues_id_administer_id_unique` (`service_issue_id`,`administer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sessions` (
  `id` varchar(255) NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `payload` longtext NOT NULL,
  `last_activity` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `settings`
--

DROP TABLE IF EXISTS `settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `settings` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `val` text DEFAULT NULL,
  `group` varchar(255) NOT NULL DEFAULT 'default',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `site_bank_cards`
--

DROP TABLE IF EXISTS `site_bank_cards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `site_bank_cards` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL COMMENT '銀行名稱',
  `code` varchar(255) DEFAULT NULL COMMENT '銀行代碼',
  `account` varchar(255) DEFAULT NULL COMMENT '帳號',
  `account_name` varchar(255) DEFAULT NULL COMMENT '帳號姓名（須實名）',
  `maximum_amount` decimal(15,4) DEFAULT 0.0000 COMMENT '收款上限',
  `current_amount` decimal(15,4) DEFAULT 0.0000 COMMENT '當前已收款',
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '啟用狀態',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `site_bank_cards_name_code_account_unique` (`name`,`code`,`account`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='平台收款銀行卡';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `site_crypto_wallets`
--

DROP TABLE IF EXISTS `site_crypto_wallets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `site_crypto_wallets` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `unique_id` varchar(255) NOT NULL COMMENT '唯一識別碼',
  `address` varchar(255) DEFAULT NULL COMMENT '錢包地址',
  `maximum_amount` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '收款上限',
  `current_amount` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '當前已收款',
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '啟用狀態',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `site_crypto_wallets_unique_id_address_unique` (`unique_id`,`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='平台收款銀行卡';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `site_spends`
--

DROP TABLE IF EXISTS `site_spends`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `site_spends` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `platform_id` int(10) unsigned DEFAULT NULL,
  `game_type_id` int(10) unsigned DEFAULT NULL,
  `report_at` timestamp NULL DEFAULT NULL COMMENT '報表時段，EX: 2023-07-08 01:00:00',
  `amount` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '用量數據',
  `cost_percent` float DEFAULT NULL COMMENT '當時成本百分比快照, EX: 0.5 = 0.5%',
  `spend` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '實際費用',
  `spend_accumulation` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '總累積費用',
  `alert` varchar(255) DEFAULT NULL COMMENT '示警訊息，例：餘額即將不足，請儘速儲值',
  `is_settled` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否已結算',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `site_spends_platform_id_game_type_id_report_at_unique` (`platform_id`,`game_type_id`,`report_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='網站花費表（每小時）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sms`
--

DROP TABLE IF EXISTS `sms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sms` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `station_id` bigint(20) unsigned NOT NULL COMMENT '站點ID',
  `code` varchar(50) NOT NULL COMMENT '國際電話冠碼',
  `name` varchar(255) NOT NULL COMMENT '名稱',
  `supplier` varchar(50) NOT NULL COMMENT '簡訊商供應商',
  `active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '發佈狀態',
  `amount` int(11) NOT NULL DEFAULT 0 COMMENT '剩餘數量',
  `settings` text NOT NULL COMMENT '參數設定',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sms_station_id_foreign` (`station_id`),
  CONSTRAINT `sms_station_id_foreign` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sms_logs`
--

DROP TABLE IF EXISTS `sms_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sms_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sms_id` bigint(20) unsigned NOT NULL,
  `phone` varchar(20) NOT NULL COMMENT '接收電話',
  `smbody` text NOT NULL COMMENT '發送內容',
  `request_id` varchar(50) DEFAULT NULL COMMENT '通知訊息要求編號 (用於查詢 API)',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '回應狀態(pending, success, fail, unknown)',
  `request_raw` longtext NOT NULL COMMENT '請求的原始內容',
  `response_raw` longtext DEFAULT NULL COMMENT '回傳的原始內容',
  `response_status_code` varchar(20) DEFAULT NULL COMMENT '回傳的狀態碼',
  `status_code` varchar(20) DEFAULT NULL COMMENT '系統處理後回傳的狀態碼',
  `status_desc` text DEFAULT NULL COMMENT '系統處理後回傳的狀態描述',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sms_logs_sms_id_index` (`sms_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `station_currencies`
--

DROP TABLE IF EXISTS `station_currencies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `station_currencies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `station_id` bigint(20) unsigned NOT NULL COMMENT '站台ID',
  `currency` varchar(10) NOT NULL COMMENT '幣別 (例如: vnd, php, pkr...)',
  `status` tinyint(4) NOT NULL DEFAULT 1 COMMENT '狀態',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `station_currencies_station_id_currency_unique` (`station_id`,`currency`),
  KEY `station_currencies_station_id_index` (`station_id`),
  KEY `station_currencies_currency_index` (`currency`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `station_game_companies`
--

DROP TABLE IF EXISTS `station_game_companies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `station_game_companies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `station_id` bigint(20) unsigned NOT NULL COMMENT '站台ID',
  `game_company_id` bigint(20) unsigned DEFAULT NULL,
  `game_company_name` varchar(255) DEFAULT NULL,
  `currency` varchar(255) NOT NULL COMMENT '幣別 (例如: vnd)',
  `active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '狀態',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_station_game_company_currency` (`station_id`,`game_company_id`,`currency`),
  KEY `station_game_companies_station_id_index` (`station_id`),
  KEY `station_game_companies_status_index` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stations`
--

DROP TABLE IF EXISTS `stations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `stations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '站點名稱',
  `code` varchar(255) NOT NULL COMMENT '站點代碼',
  `secret_key` varchar(255) NOT NULL COMMENT '站點密鑰',
  `cost_percent` text NOT NULL COMMENT '遊戲成本百分比',
  `callback_domain` varchar(100) DEFAULT NULL COMMENT '第三方回傳結果給站台的 API 網域',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stations_code_unique` (`code`),
  UNIQUE KEY `stations_secret_key_unique` (`secret_key`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ticket_bonus_records`
--

DROP TABLE IF EXISTS `ticket_bonus_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ticket_bonus_records` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `ticket_id` int(11) NOT NULL COMMENT '抽獎票券 id',
  `user_ticket_id` bigint(20) DEFAULT NULL,
  `bonus` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '領取紅利:新增儲值單',
  `rollover_log_amount` decimal(15,4) NOT NULL DEFAULT 0.0000 COMMENT '流水需求',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '異動時間',
  `deleted_at` timestamp NULL DEFAULT NULL COMMENT '刪除時間',
  PRIMARY KEY (`id`),
  KEY `ticket_bonus_records_user_id_index` (`user_id`),
  KEY `ticket_bonus_records_ticket_id_index` (`ticket_id`),
  KEY `ticket_bonus_records_user_ticket_id_index` (`user_ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽獎票券使用記錄';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tickets`
--

DROP TABLE IF EXISTS `tickets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tickets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) NOT NULL COMMENT '隨機票券編號：網址變數',
  `code` varchar(255) NOT NULL COMMENT '票券代號：特定格式組合的代號，相同代號走期不能重疊',
  `name` varchar(255) NOT NULL COMMENT '票券名稱',
  `type` varchar(255) NOT NULL COMMENT '票券類型：抽紅包、大輪盤、砸金蛋、九宮格、老虎機',
  `introduction` text DEFAULT NULL COMMENT '票券簡介',
  `description` text DEFAULT NULL COMMENT '票券詳細描述',
  `start_at` timestamp NULL DEFAULT NULL COMMENT '開始時間，例：2023-11-01 00:00:00',
  `end_at` timestamp NULL DEFAULT NULL COMMENT '結束時間，例：2023-11-30 23:59:59',
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '啟用狀態，停止：0、執行中：1',
  `rebateable` tinyint(1) NOT NULL DEFAULT 0 COMMENT '與此相關 betting_log 可否返水設定，預設不返水',
  `addons` text DEFAULT NULL COMMENT '依不同票券類別添加票券附加設定的集合，例如：獎項名稱、紅利、機率',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '異動時間',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `deleted_at` timestamp NULL DEFAULT NULL COMMENT '刪除時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `tickets_uuid_unique` (`uuid`),
  KEY `tickets_code_index` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽獎票券';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `transactions`
--

DROP TABLE IF EXISTS `transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `transactions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `model_type` varchar(255) DEFAULT NULL COMMENT 'äº¤æ˜“æ¨¡åž‹é¡žåž‹ï¼Œä¾‹å¦‚ï¼šdeposit_recordsã€withdrawal_recordsã€remittance_recordsã€rebate_records...',
  `model_id` int(11) DEFAULT NULL COMMENT 'äº¤æ˜“æ¨¡åž‹ id',
  `model_no` varchar(255) DEFAULT NULL COMMENT 'äº¤æ˜“å–®è™Ÿ',
  `wallet_id` int(11) DEFAULT NULL COMMENT 'åŒ¯æ¬¾éŒ¢åŒ…',
  `platform_name` varchar(255) DEFAULT NULL COMMENT 'éŒ¢åŒ…åç¨±',
  `type` varchar(50) DEFAULT NULL COMMENT '交易類型',
  `trade_type` varchar(255) DEFAULT NULL COMMENT '交易類型：轉入(wallet_in)、轉出(wallet_out)、遊戲收入(game_profit)、遊戲虧損(game_loss)',
  `currency` varchar(10) NOT NULL COMMENT '交易幣別',
  `balance_original` decimal(15,4) DEFAULT NULL COMMENT 'åŽŸå§‹é¤˜é¡',
  `balance_variable` decimal(15,4) DEFAULT NULL COMMENT 'é¤˜é¡è®Šé‡ï¼Œè½‰å‡ºæˆ–è™§æç‚ºè² å€¼',
  `balance_complete` decimal(15,4) DEFAULT NULL COMMENT 'å®Œæˆé¤˜é¡',
  `withdrawal_threshold_original` decimal(15,4) DEFAULT NULL COMMENT 'åŽŸå§‹æé ˜é–€æª»',
  `withdrawal_threshold_variable` decimal(15,4) DEFAULT NULL COMMENT 'æé ˜é–€æª»è®Šé‡',
  `withdrawal_threshold_complete` decimal(15,4) DEFAULT NULL COMMENT 'å®Œæˆæé ˜é–€æª»',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `transactions_wallet_id_index` (`wallet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_bank_cards`
--

DROP TABLE IF EXISTS `user_bank_cards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_bank_cards` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL COMMENT '銀行名稱',
  `code` varchar(255) DEFAULT NULL COMMENT '銀行代碼',
  `account` varchar(255) DEFAULT NULL COMMENT '帳號',
  `account_name` varchar(255) DEFAULT NULL COMMENT '帳號姓名（須實名）',
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '啟用狀態',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_bank_cards_uuid_unique` (`uuid`),
  UNIQUE KEY `user_bank_cards_code_account_unique` (`code`,`account`),
  KEY `user_bank_cards_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='會員收款銀行卡';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_crypto_wallets`
--

DROP TABLE IF EXISTS `user_crypto_wallets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_crypto_wallets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `option_type` varchar(100) DEFAULT NULL COMMENT '收付種類（ WithdrawalOptionTypeEnum )',
  `name` varchar(255) NOT NULL COMMENT '錢包名稱',
  `address` varchar(255) NOT NULL COMMENT '錢包地址',
  `public_chain` varchar(255) NOT NULL COMMENT '主網/公鏈類型',
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '啟用狀態',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_crypto_wallets_uuid_unique` (`uuid`),
  UNIQUE KEY `user_crypto_wallets_option_type_address_unique` (`option_type`,`address`),
  KEY `user_crypto_wallets_user_id_index` (`user_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='會員收款銀行卡';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_events`
--

DROP TABLE IF EXISTS `user_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_events` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `event_id` int(11) DEFAULT NULL,
  `checkpoint` varchar(100) DEFAULT NULL COMMENT '查核點： 可作為條件判斷的任意字串',
  `eventable_type` varchar(255) DEFAULT NULL COMMENT '活動相依模型，例如：deposit_records...',
  `eventable_id` int(11) DEFAULT NULL COMMENT '活動相依模型 id',
  `status` varchar(50) NOT NULL DEFAULT 'pending' COMMENT '獎勵狀態',
  `note_user` varchar(255) DEFAULT NULL COMMENT '備註（玩家）',
  `note_inner` varchar(255) DEFAULT NULL COMMENT '備註（內部）',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '異動時間',
  `deleted_at` timestamp NULL DEFAULT NULL COMMENT '刪除時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_events_user_id_event_id_checkpoint_unique` (`user_id`,`event_id`,`checkpoint`),
  KEY `user_events_user_id_index` (`user_id`),
  KEY `user_events_event_id_index` (`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_ewallets`
--

DROP TABLE IF EXISTS `user_ewallets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_ewallets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `option_type` varchar(100) DEFAULT NULL COMMENT '收付種類的群組（ WithdrawalOptionTypeEnum )',
  `account` varchar(255) DEFAULT NULL COMMENT '帳號',
  `account_name` varchar(255) DEFAULT NULL COMMENT '帳號姓名（須實名）',
  `active` tinyint(1) NOT NULL DEFAULT 0 COMMENT '啟用狀態',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_ewallets_uuid_unique` (`uuid`),
  UNIQUE KEY `user_ewallets_option_type_account_unique` (`option_type`,`account`),
  KEY `user_ewallets_user_id_index` (`user_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='會員收款銀行卡';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_guests`
--

DROP TABLE IF EXISTS `user_guests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_guests` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `account` varchar(255) NOT NULL COMMENT '訪客編號',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_level_records`
--

DROP TABLE IF EXISTS `user_level_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_level_records` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `user_level_setting_id` bigint(20) unsigned NOT NULL,
  `rank` int(10) unsigned NOT NULL DEFAULT 1 COMMENT '級別',
  `type` varchar(255) NOT NULL COMMENT '升續類型 (UserLevelRecordTypeEnum)',
  `settings` text NOT NULL COMMENT 'Settings 的快照資料 (JSON)',
  `upgrade_condition` text NOT NULL COMMENT '升級條件/快照資料 (UserLevelUpgradeConditionData)',
  `renewal_condition` text NOT NULL COMMENT '續等條件/快照資料 (UserLevelUpgradeConditionData)',
  `rebates` text NOT NULL COMMENT '返水設定/快照資料 (JSON)',
  `caculation_start_at` timestamp NULL DEFAULT NULL,
  `caculation_end_at` timestamp NULL DEFAULT NULL,
  `valid_start_at` timestamp NULL DEFAULT NULL,
  `valid_end_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `user_level_setting_id` (`user_level_setting_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_level_settings`
--

DROP TABLE IF EXISTS `user_level_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_level_settings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '級別名稱',
  `rank` int(10) unsigned NOT NULL COMMENT '級別',
  `type` varchar(100) DEFAULT NULL,
  `upgrade_condition` text DEFAULT NULL COMMENT '升級條件 (UserLevelUpgradeConditionData)',
  `renewal_condition` text DEFAULT NULL COMMENT '續會條件 (UserLevelRenewalConditionData)',
  `rebates` text NOT NULL COMMENT '返水設定 (JSON)',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_login_logs`
--

DROP TABLE IF EXISTS `user_login_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_login_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_login_logs_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_tickets`
--

DROP TABLE IF EXISTS `user_tickets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_tickets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `ticket_id` int(11) NOT NULL COMMENT '抽獎票券 id',
  `amount` int(11) NOT NULL DEFAULT 0 COMMENT '持有票券數量',
  `updated_at` timestamp NULL DEFAULT NULL COMMENT '異動時間',
  `created_at` timestamp NULL DEFAULT NULL COMMENT '建立時間',
  `deleted_at` timestamp NULL DEFAULT NULL COMMENT '刪除時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_tickets_user_id_ticket_id_unique` (`user_id`,`ticket_id`),
  KEY `user_tickets_user_id_index` (`user_id`),
  KEY `user_tickets_ticket_id_index` (`ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='會員持有抽獎票券的票券數';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `station_id` bigint(20) unsigned DEFAULT NULL COMMENT '站台ID',
  `account` varchar(255) NOT NULL COMMENT '帳號',
  `last_deposit_at` timestamp NULL DEFAULT NULL COMMENT '最後充值時間',
  `last_betting_at` timestamp NULL DEFAULT NULL COMMENT '最後投注時間',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_station_id_account_unique` (`station_id`,`account`),
  CONSTRAINT `users_station_id_foreign` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wallets`
--

DROP TABLE IF EXISTS `wallets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `wallets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `platform_id` int(11) DEFAULT NULL,
  `platform_name` varchar(255) DEFAULT NULL,
  `player_id` int(11) DEFAULT NULL,
  `in_use` tinyint(4) NOT NULL DEFAULT 0,
  `currency` varchar(10) NOT NULL,
  `balance` decimal(15,4) DEFAULT NULL COMMENT '錢包餘額',
  `freeze` decimal(15,4) DEFAULT 0.0000,
  `check_at` timestamp NULL DEFAULT NULL COMMENT '最後檢查時間',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `wallets_user_id_index` (`user_id`),
  KEY `wallets_platform_id_index` (`platform_id`),
  KEY `wallets_player_id_index` (`player_id`),
  CONSTRAINT `wallets_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `wallets_ibfk_2` FOREIGN KEY (`platform_id`) REFERENCES `platforms` (`id`),
  CONSTRAINT `wallets_ibfk_3` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `withdrawal_records`
--

DROP TABLE IF EXISTS `withdrawal_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `withdrawal_records` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `no` varchar(255) DEFAULT NULL COMMENT '單號',
  `trade_no` varchar(512) DEFAULT NULL COMMENT '交易單號（第三方交易單號）',
  `user_id` int(11) DEFAULT NULL COMMENT '提款人',
  `wallet_id` int(11) DEFAULT NULL COMMENT '提款銷帳錢包，限定主錢包',
  `currency` varchar(255) DEFAULT NULL COMMENT '幣別 (例如: vnd)',
  `amount` decimal(15,4) DEFAULT NULL COMMENT '提款金額',
  `status` varchar(255) DEFAULT NULL COMMENT '狀態：新建單(pending)、處理中(processing)、拒絕(reject)、已完成(completed)、失敗(failed)',
  `stage` varchar(20) DEFAULT NULL COMMENT '處理階段(不顯示)',
  `note` text DEFAULT NULL COMMENT '交易備註',
  `expired_at` timestamp NULL DEFAULT NULL COMMENT '查帳到期時間',
  `error_code` varchar(255) DEFAULT NULL COMMENT '錯誤代碼',
  `error_message` varchar(255) DEFAULT NULL COMMENT '錯誤訊息',
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成時間',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `withdrawal_records_user_id_index` (`user_id`),
  KEY `withdrawal_records_wallet_id_index` (`wallet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提款單';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-25 14:15:08
-- MariaDB dump 10.19  Distrib 10.11.6-MariaDB, for debian-linux-gnu (aarch64)
--
-- Host: localhost    Database: stationhub_recording
-- ------------------------------------------------------
-- Server version	10.11.6-MariaDB-1:10.11.6+maria~ubu2204

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `migrations`
--

DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `migrations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) NOT NULL,
  `batch` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=172 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `migrations`
--

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` VALUES
(1,'2014_10_12_000000_create_users_table',1),
(2,'2014_10_12_100000_create_password_reset_tokens_table',1),
(3,'2014_10_12_200000_add_two_factor_columns_to_users_table',1),
(4,'2019_08_19_000000_create_failed_jobs_table',1),
(5,'2019_12_14_000001_create_personal_access_tokens_table',1),
(6,'2020_05_21_100000_create_teams_table',1),
(7,'2020_05_21_200000_create_team_user_table',1),
(8,'2020_05_21_300000_create_team_invitations_table',1),
(9,'2023_05_16_060945_create_sessions_table',1),
(10,'2023_05_18_075750_create_permission_tables',1),
(11,'2023_07_03_105428_create_job_batches_table',2),
(12,'2014_10_00_000000_create_settings_table',3),
(13,'2014_10_00_000001_add_group_column_on_settings_table',3),
(14,'2023_11_14_140828_create_banners_table',4),
(16,'2023_12_14_101644_create_user_login_logs_table',5),
(18,'2024_01_12_113417_add_column_maintain_to_games_table',6),
(20,'2024_01_15_145727_create_sms_table',7),
(21,'2024_01_15_143237_create_sms_logs_table',8),
(22,'2024_01_25_170720_create_qas_table',9),
(23,'2024_01_29_113218_create_qa_tags_table',10),
(29,'2024_01_29_113927_add_column_qa_tag_id_to_qas_table',11),
(31,'2024_02_07_120403_create_pages_table',12),
(35,'2024_03_07_100456_create_advance_deposits_table',13),
(42,'2024_03_08_115308_create_languages_table',14),
(45,'2024_04_11_091643_create_risk_event_withdrawal_map_table',15),
(52,'2024_06_27_164936_create_flatten_rebate_reports_table',16),
(53,'2024_12_18_140847_create_user_guests_table',17),
(54,'2024_12_18_140848_rename_chat_room_service_issues_table',17),
(55,'2024_12_18_140849_rename_chat_room_service_issues_administer_map_table',17),
(56,'2024_12_18_140850_drop_chat_rooms_table',17),
(57,'2024_12_18_140851_drop_chat_room_id_from_chat_room_messages_table',17),
(58,'2024_12_18_140852_modify_user_id_to_morphs_in_service_issues_table',17),
(59,'2024_12_19_000006_rename_uuid_to_account_in_user_guests_table',17),
(60,'2024_12_25_000000_create_service_issue_categories_table',17),
(61,'2024_12_25_102301_modify_service_issues_table',17),
(62,'2024_12_25_114000_add_description_to_service_issue_categories_table',17),
(63,'2025_01_02_183131_rename_job_name_to_task_name_in_schedule_logs',17),
(64,'2025_01_06_184600_add_code_to_sms_table',17),
(65,'2025_01_09_113809_remove_identity_columns_from_users_table',17),
(66,'2025_01_10_164450_remove_deleted_at_from_user_level_settings_table',17),
(67,'2025_01_13_150420_remove_resource_from_site_bank_cards_and_crypto_wallets_table',17),
(68,'2025_02_24_143942_add_language_column_in_users_table',17),
(69,'2025_03_04_144303_add_local_column_in_administers_table',17),
(70,'2025_03_18_105305_add_type_column_in_transactions_table',17),
(71,'2025_03_27_134113_add_expires_at_to_deposit_records_table',17),
(72,'2025_03_27_135242_add_expires_at_to_withdrawal_records_table',17),
(73,'2025_03_27_135544_add_expires_at_to_commission_withdraws_table',17),
(74,'2025_03_28_094849_add_no_column_in_rollover_logs_table',17),
(75,'2025_04_02_113000_add_stage_to_commission_withdraws_table',17),
(76,'2025_04_02_113000_add_stage_to_deposit_records_table',17),
(77,'2025_04_02_113000_add_stage_to_remittance_records_table',17),
(78,'2025_04_02_113000_add_stage_to_withdrawal_records_table',17),
(79,'2025_04_24_103201_create_languages_table',18),
(80,'2025_04_24_134837_create_language_descriptions_table',18),
(81,'2025_04_24_135042_modify_languages_table',18),
(82,'2025_04_24_141226_modify_language_descriptions_table',18),
(83,'2025_04_24_141235_modify_languages_table',18),
(84,'2025_04_24_143937_rename_language_tables_to_i18n',18),
(85,'2025_04_25_103235_create_i18n_languages_table',18),
(86,'2025_04_25_103256_modify_i18n_translated_table',18),
(87,'2025_04_26_134954_modify_translated_column_in_i18n_translated_table',18),
(90,'2025_04_29_174624_create_stations_table',19),
(91,'2025_05_01_000001_create_station_currencies_table',20),
(92,'2025_05_02_000002_add_columns_to_platforms_table',21),
(93,'2025_05_02_000003_create_game_company_platforms_table',22),
(95,'2025_05_02_000004_create_station_game_companies_table',23),
(96,'2025_05_02_000005_modify_games_table',24),
(97,'2025_05_02_000006_create_game_currencies_table',25),
(98,'2025_05_03_000001_create_currencies_table',26),
(99,'2025_05_05_151649_remove_unused_columns_from_games_table',27),
(100,'2025_05_06_000001_modify_players_table_add_station_id_and_remove_user_id',28),
(101,'2025_05_06_000002_add_station_account_to_players_table',29),
(102,'2025_05_06_000003_modify_play_logs_table_add_station_id_and_remove_user_id',30),
(103,'2025_05_06_000004_modify_players_table_station_account_to_station_user_account',30),
(104,'2025_05_06_000005_modify_remittance_records_table',31),
(105,'2025_05_08_003419_modify_players_table_remove_station_user_account_add_user_id',32),
(106,'2025_05_08_100726_add_user_id_to_play_logs_table',33),
(107,'2025_05_08_101804_modify_remittance_records_table_add_user_id_remove_station_user_account',34),
(108,'2025_05_08_142332_add_wallet_fields_to_remittance_records_table',35),
(109,'2025_05_08_144635_add_station_id_to_users_table',36),
(110,'2025_05_08_152014_remove_currency_and_game_company_from_station_game_companies_table',37),
(111,'2025_05_08_153223_create_platform_currencies_table',38),
(112,'2025_05_09_144154_add_in_use_and_currency_to_wallets_table',38),
(113,'2025_05_09_215314_drop_game_company_platforms_table',39),
(114,'2025_05_09_220223_create_game_companies_table',40),
(115,'2025_05_10_012511_update_station_game_companies_table_add_game_company_id_and_name_remove_game_company_platform_id',41),
(116,'2025_05_11_000001_rename_game_company_to_game_company_name_in_games_table',42),
(117,'2025_05_11_000002_remove_currency_from_platforms_table',43),
(118,'2025_05_12_105710_add_currency_to_deposit_records_table',44),
(119,'2025_05_12_115622_add_currency_to_withdrawal_records_table',45),
(120,'2025_05_13_134853_update_users_table_structure',46),
(121,'2025_05_14_104409_rename_status_to_active_in_currencies_table',47),
(124,'2025_05_14_104339_add_currency_column_in_station_game_companies_table',48),
(128,'2025_05_14_110817_modify_unique_column_in_station_game_companies_table',49),
(135,'2025_05_14_162817_add_game_cost_column_in_stations_table',50),
(136,'2025_05_21_013833_add_serial_to_games_table',51),
(137,'2025_05_21_105128_rename_serial_to_signature_in_games_table',52),
(140,'2025_05_21_143123_update_players_table_unique_key',53),
(141,'2025_05_21_175541_update_users_table_unique_key',53),
(142,'2025_05_22_160151_modify_players_table_change_unique_key',54),
(143,'2025_05_26_110956_drop_unused_columns_from_deposit_records_table',55),
(144,'2025_05_26_112120_drop_unnecessary_columns_from_withdrawal_records_table',56),
(145,'2025_05_26_155100_add_currency_to_transactions_table',57),
(147,'2025_05_27_174454_modify_status_column_in_station_game_companies_table',58),
(148,'2025_06_26_161715_add_last_login_token_to_administers_table',59),
(149,'2025_07_01_111731_add_deleted_at_to_i18n_languages_table',60),
(150,'2025_07_04_102952_remove_unique_constraints_from_sms_table',61),
(151,'2025_07_04_110546_add_supplier_column_to_sms_table',61),
(152,'2025_07_04_110805_add_station_id_column_to_sms_table',61),
(153,'2025_08_26_145246_add_callback_domain_to_stations_table',62),
(154,'2025_09_09_112903_add_platform_name_to_platform_currencies_table',63),
(155,'2025_09_26_143217_drop_platform_currencies_table',64),
(156,'2025_09_26_143840_add_currencies_and_regions_to_platforms_table',64),
(157,'2025_09_30_112734_add_unique_constraint_to_game_companies_table',65),
(158,'2026_09_08_120000_create_platform_currencies_table',75),
(159,'2026_09_10_100000_create_platform_maintenance_schedules_table',76),
(160,'2023_06_07_000001_create_pulse_tables',77),
(161,'2025_11_11_035650_add_log_name_created_at_index_to_activity_log_table',77),
(162,'2025_11_13_000001_add_vendor_player_id_to_players_table',77),
(163,'2025_12_24_143033_add_orientation_and_is_recommended_to_games_table',77),
(164,'2026_01_09_091628_add_is_custom_logo_to_games_table',77),
(165,'2026_01_12_103754_create_game_logo_histories_table',77),
(166,'2026_01_14_224311_remove_is_custom_logo_from_games_table',77),
(167,'2026_01_22_153710_change_orientation_column_length_to_3_in_games_table',77),
(168,'2026_07_31_210000_add_unique_index_to_vendor_player_id_on_players_table',77),
(169,'2026_08_03_140000_create_game_name_translations_table',77),
(170,'2026_08_08_010000_add_raw_log_sync_to_platforms_table',77),
(171,'2026_09_03_100000_add_stranded_scan_indexes_to_remittance_records_table',77);
/*!40000 ALTER TABLE `migrations` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-25 14:15:10
