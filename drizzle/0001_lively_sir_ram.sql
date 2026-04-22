CREATE TABLE `alarm_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`alarmId` varchar(64) NOT NULL,
	`alarmDescription` varchar(255) NOT NULL DEFAULT '',
	`scheduledAt` timestamp NOT NULL,
	`status` enum('pending','responded','missed','not_sent') NOT NULL DEFAULT 'pending',
	`resolvedAt` timestamp,
	`warningSent` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alarm_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `app_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`userName` varchar(255),
	`emergencyContacts` json,
	`lastLocation` varchar(64),
	`lastLocationAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_users_deviceId_unique` UNIQUE(`deviceId`)
);
--> statement-breakpoint
CREATE TABLE `device_heartbeat` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`appVersion` varchar(32),
	CONSTRAINT `device_heartbeat_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_heartbeat_deviceId_unique` UNIQUE(`deviceId`)
);
--> statement-breakpoint
CREATE TABLE `synced_alarms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`alarmId` varchar(64) NOT NULL,
	`time` varchar(5) NOT NULL,
	`description` varchar(255) NOT NULL DEFAULT '',
	`enabled` boolean NOT NULL DEFAULT true,
	`repeat` enum('daily','weekdays','weekends','custom') NOT NULL DEFAULT 'daily',
	`customDays` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `synced_alarms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `warning_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`offlineHours` int NOT NULL,
	`contactsReached` int NOT NULL DEFAULT 0,
	`locationIncluded` boolean NOT NULL DEFAULT false,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `warning_log_id` PRIMARY KEY(`id`)
);
