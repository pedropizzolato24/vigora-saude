CREATE TABLE `user_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`anamnesis` json,
	`emergencyContacts` json,
	`alarms` json,
	`settings` json,
	`healthMetrics` json,
	`profile` json,
	`dataUpdatedAt` bigint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_data_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_data_openId_unique` UNIQUE(`openId`)
);
