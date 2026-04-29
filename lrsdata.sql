-- --------------------------------------------------------
-- Host:                         127.0.0.1
-- Server version:               10.4.30-MariaDB - mariadb.org binary distribution
-- Server OS:                    Win64
-- HeidiSQL Version:             12.6.0.6765
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Dumping database structure for fisheries_lrs
DROP DATABASE IF EXISTS `fisheries_lrs`;
CREATE DATABASE IF NOT EXISTS `fisheries_lrs` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;
USE `fisheries_lrs`;

-- Dumping structure for table fisheries_lrs.app_settings
DROP TABLE IF EXISTS `app_settings`;
CREATE TABLE IF NOT EXISTS `app_settings` (
  `setting_key` varchar(120) NOT NULL,
  `setting_value` text NOT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table fisheries_lrs.app_settings: ~2 rows (approximately)
DELETE FROM `app_settings`;
INSERT INTO `app_settings` (`setting_key`, `setting_value`) VALUES
	('site_description', 'School of Fisheries'),
	('site_title', 'Learning Resource System');

-- Dumping structure for table fisheries_lrs.audit_logs
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned DEFAULT NULL,
  `actor_name` varchar(140) NOT NULL,
  `actor_username` varchar(60) NOT NULL,
  `actor_role` varchar(40) NOT NULL,
  `action_type` varchar(80) NOT NULL,
  `entity_type` varchar(80) NOT NULL,
  `description` text NOT NULL,
  `target_id` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_created_at` (`created_at`),
  KEY `idx_audit_logs_user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table fisheries_lrs.audit_logs: ~0 rows (approximately)
DELETE FROM `audit_logs`;
INSERT INTO `audit_logs` (`id`, `user_id`, `actor_name`, `actor_username`, `actor_role`, `action_type`, `entity_type`, `description`, `target_id`, `created_at`) VALUES
	(1, 1, 'Marina Santos', 'admin', 'Administrator', 'login', 'account', 'Signed in to the system.', NULL, '2026-04-23 06:32:05'),
	(2, 1, 'Marina Santos', 'admin', 'Administrator', 'login', 'account', 'Signed in to the system.', NULL, '2026-04-24 09:27:17');

-- Dumping structure for table fisheries_lrs.categories
DROP TABLE IF EXISTS `categories`;
CREATE TABLE IF NOT EXISTS `categories` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(120) NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table fisheries_lrs.categories: ~5 rows (approximately)
DELETE FROM `categories`;
INSERT INTO `categories` (`id`, `slug`, `name`, `description`, `created_at`) VALUES
	(1, 'aquaculture', 'Aquaculture', 'Culture systems, hatchery methods, and sustainable fish production.', '2026-04-07 13:54:47'),
	(2, 'marine-ecology', 'Marine Ecology', 'Ecosystems, biodiversity, habitats, and fisheries conservation studies.', '2026-04-07 13:54:47'),
	(3, 'post-harvest', 'Post-Harvest', 'Handling, storage, processing, safety, and product quality practices.', '2026-04-07 13:54:47'),
	(4, 'fishing-technology', 'Fishing Technology', 'Gear systems, vessel operations, navigation, and fish finding methods.', '2026-04-07 13:54:47'),
	(5, 'fisheries-policy', 'Fisheries Policy', 'Regulations, coastal governance, management plans, and community programs.', '2026-04-07 13:54:47');

-- Dumping structure for table fisheries_lrs.resources
DROP TABLE IF EXISTS `resources`;
CREATE TABLE IF NOT EXISTS `resources` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `category_id` int(10) unsigned NOT NULL,
  `file_type` enum('PDF','Video','Data') NOT NULL,
  `keywords_json` longtext NOT NULL,
  `author_source` varchar(255) NOT NULL,
  `upload_date` date NOT NULL,
  `status` enum('Pending Review','Active','Inactive') NOT NULL DEFAULT 'Active',
  `views` int(10) unsigned NOT NULL DEFAULT 0,
  `source_mode` enum('url','upload','text') NOT NULL DEFAULT 'url',
  `resource_url` text DEFAULT NULL,
  `data_text` longtext DEFAULT NULL,
  `stored_filename` varchar(255) DEFAULT NULL,
  `original_filename` varchar(255) DEFAULT NULL,
  `mime_type` varchar(120) DEFAULT NULL,
  `attachments_json` longtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_resources_category` (`category_id`),
  CONSTRAINT `fk_resources_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table fisheries_lrs.resources: ~5 rows (approximately)
DELETE FROM `resources`;
INSERT INTO `resources` (`id`, `title`, `description`, `category_id`, `file_type`, `keywords_json`, `author_source`, `upload_date`, `status`, `views`, `source_mode`, `resource_url`, `data_text`, `stored_filename`, `original_filename`, `mime_type`, `attachments_json`, `created_at`) VALUES
	(1, 'Milkfish Hatchery Operations Manual', 'A practical PDF manual covering broodstock management, larval rearing, water quality, and nursery protocols for bangus hatcheries.', 1, 'PDF', '["milkfish","hatchery","broodstock","water quality"]', 'School of Fisheries Extension Unit', '2026-03-20', 'Active', 131, 'url', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', NULL, NULL, NULL, NULL, NULL, '2026-04-07 13:54:48'),
	(2, 'Coral Reef Fisheries Monitoring Basics', 'An introductory video lecture on reef fish assessment, transect recording, and community-based monitoring practices.', 2, 'Video', '["reef","monitoring","transect","assessment"]', 'Dean L. Mercado', '2026-03-28', 'Active', 234, 'upload', 'uploads/upload_69d75828d83c72.98354351.pdf', NULL, 'upload_69d75828d83c72.98354351.pdf', 'enc-0909142_1760086960297.pdf', 'application/pdf', NULL, '2026-04-07 13:54:48'),
	(3, 'Municipal Catch Composition Dataset', 'CSV-ready fisheries landing data showing species composition, catch volume, and landing site summary for instructional analysis.', 5, 'Data', '["dataset","catch","landing","species"]', 'Provincial Fisheries Office', '2026-04-01', 'Active', 99, 'text', NULL, 'landing_site,species,volume_kg\nNorth Port,Tuna,420\nNorth Port,Mackerel,180\nEast Bay,Rabbitfish,95\nEast Bay,Squid,130', NULL, NULL, 'text/plain', NULL, '2026-04-07 13:54:48'),
	(4, 'Fish Smoking and Drying Quality Guide', 'A PDF guide on hygienic handling, drying platforms, salting levels, and safe storage for value-added fish products.', 3, 'PDF', '["smoking","drying","processing","food safety"]', 'Food Technology Laboratory', '2026-03-17', 'Active', 68, 'url', 'https://www.orimi.com/pdf-test.pdf', NULL, NULL, NULL, NULL, NULL, '2026-04-07 13:54:48'),
	(5, 'Electronic Fish Finder Demonstration', 'Short instructional video on fish finder setup, transducer placement, and interpreting sonar returns during fieldwork.', 4, 'Video', '["sonar","navigation","fish finder","vessel"]', 'Marine Technology Center', '2026-04-03', 'Inactive', 31, 'url', 'https://samplelib.com/lib/preview/mp4/sample-10s.mp4', NULL, NULL, NULL, NULL, NULL, '2026-04-07 13:54:48'),
	(6, 'Fish in the pond', 'Fish in the pond is fishing', 4, 'PDF', '[]', 'Ninz Angelo', '2026-04-09', 'Pending Review', 0, 'upload', 'uploads/upload_69d793354fceb0.50421609.pdf', NULL, 'upload_69d793354fceb0.50421609.pdf', 'enc-0909142_1760086960297.pdf', 'application/pdf', '[{"fileType":"PDF","sourceMode":"upload","resourceUrl":"uploads/upload_69d793354fceb0.50421609.pdf","dataText":null,"storedFilename":"upload_69d793354fceb0.50421609.pdf","originalFilename":"enc-0909142_1760086960297.pdf","mimeType":"application/pdf"},{"fileType":"Video","sourceMode":"upload","resourceUrl":"uploads/upload_69d7933550a0f2.04625578.mp4","dataText":null,"storedFilename":"upload_69d7933550a0f2.04625578.mp4","originalFilename":"2025-11-17 17-57-11 - Cheater talga.mp4","mimeType":"video/mp4"}]', '2026-04-09 11:53:25');

-- Dumping structure for table fisheries_lrs.users
DROP TABLE IF EXISTS `users`;
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `full_name` varchar(140) NOT NULL,
  `email` varchar(190) DEFAULT NULL,
  `profile_image` varchar(255) DEFAULT NULL,
  `username` varchar(60) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('Administrator','Encoder') NOT NULL,
  `status` enum('Active','Inactive') NOT NULL DEFAULT 'Active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table fisheries_lrs.users: ~3 rows (approximately)
DELETE FROM `users`;
INSERT INTO `users` (`id`, `full_name`, `email`, `profile_image`, `username`, `password_hash`, `role`, `status`, `created_at`) VALUES
	(1, 'Marina Santos', 'admin@schooloffisheries.local', 'uploads/profile_69e8f42bdf7974.55697696.jpg', 'admin', '$2y$10$Waif2MZMQfZSiF1UmIRiJ.k0XL2Omoo.R6JS0YvoNB73N4qInN/4O', 'Administrator', 'Active', '2026-04-07 13:54:48'),
	(2, 'Joel Navarro', 'encoder@schooloffisheries.local', NULL, 'encoder', '$2y$10$bD.sKNusSU/JyKe.vNhOS.EgTYv/j3vqY7oV9L9FlbXlsJl2Ry.EW', 'Encoder', 'Active', '2026-04-07 13:54:48'),
	(3, 'Nino Angelo Tabon', 'ninzangelo75@gmail.com', NULL, 'ninzangelo', '$2y$10$6dRMn.1cscjlWD/yM8c6U.AXEp0O1qpnbOLNcpeDhX.HnVK5QpSM6', 'Administrator', 'Active', '2026-04-22 16:26:11'),
	(4, 'Ninz Angelo', 'ninzangelo65@gmail.com', NULL, 'ninz', '$2y$10$60/6seq3fzIZQOyXMKXsKe4XurvjKfkhxdUfuzs8.fwYOieYUKzZW', 'Encoder', 'Active', '2026-04-22 16:31:15');

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
