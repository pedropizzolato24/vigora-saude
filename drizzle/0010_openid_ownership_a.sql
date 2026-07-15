CREATE TABLE `account_liveness` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastLocation` varchar(64),
	`lastLocationAt` timestamp,
	`lastDeviceId` varchar(64),
	`appVersion` varchar(32),
	CONSTRAINT `account_liveness_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_liveness_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
ALTER TABLE `alarm_events` ADD `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `warning_log` ADD `openId` varchar(64);--> statement-breakpoint
CREATE INDEX `alarm_events_openid_idx` ON `alarm_events` (`openId`);--> statement-breakpoint
CREATE INDEX `warning_log_openid_idx` ON `warning_log` (`openId`);