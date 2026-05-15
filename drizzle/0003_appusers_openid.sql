ALTER TABLE `app_users` ADD COLUMN `openId` varchar(64);--> statement-breakpoint
CREATE INDEX `idx_app_users_openId` ON `app_users` (`openId`);
