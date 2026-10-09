CREATE TABLE `alarm_changes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`alarmId` varchar(64) NOT NULL,
	`alarmDescription` varchar(255) NOT NULL DEFAULT '',
	`changeType` enum('deleted','disabled','rescheduled') NOT NULL,
	`oldTime` varchar(5),
	`newTime` varchar(5),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alarm_changes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `alarm_changes_openid_idx` ON `alarm_changes` (`openId`);