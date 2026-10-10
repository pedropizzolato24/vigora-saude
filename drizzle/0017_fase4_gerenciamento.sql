CREATE TABLE `alarm_management` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monitoredOpenId` varchar(64) NOT NULL,
	`caregiverOpenId` varchar(64) NOT NULL,
	`status` enum('pending','active','ended') NOT NULL,
	`endedReason` enum('declined','expired','cancelled','stopped_by_monitored','stopped_by_caregiver','unlinked','account_deleted'),
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`respondedAt` timestamp,
	`endedAt` timestamp,
	CONSTRAINT `alarm_management_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `managed_alarm_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monitoredOpenId` varchar(64) NOT NULL,
	`version` int NOT NULL,
	`alarms` json NOT NULL,
	`appliedVersion` int NOT NULL DEFAULT 0,
	`appliedAlarms` json NOT NULL,
	`failedAlarmIds` json NOT NULL,
	`appliedAt` timestamp,
	`updatedByOpenId` varchar(64) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`visibleNoticeSentForVersion` int NOT NULL DEFAULT 0,
	CONSTRAINT `managed_alarm_lists_id` PRIMARY KEY(`id`),
	CONSTRAINT `managed_alarm_lists_monitoredOpenId_unique` UNIQUE(`monitoredOpenId`)
);
--> statement-breakpoint
ALTER TABLE `alarm_changes` MODIFY COLUMN `changeType` enum('deleted','disabled','rescheduled','created') NOT NULL;--> statement-breakpoint
ALTER TABLE `account_liveness` ADD `dmsPausedReason` enum('logged_out','app_removed','no_signal');--> statement-breakpoint
ALTER TABLE `account_liveness` ADD `dmsPausedAt` timestamp;--> statement-breakpoint
ALTER TABLE `account_liveness` ADD `pauseNoticeSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `alarm_changes` ADD `changedByOpenId` varchar(64);--> statement-breakpoint
ALTER TABLE `user_data` ADD `timezone` varchar(64);--> statement-breakpoint
CREATE INDEX `alarm_management_monitored_idx` ON `alarm_management` (`monitoredOpenId`);--> statement-breakpoint
CREATE INDEX `alarm_management_caregiver_idx` ON `alarm_management` (`caregiverOpenId`);