CREATE TABLE `caregiver_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caregiverOpenId` varchar(64) NOT NULL,
	`monitoredOpenId` varchar(64) NOT NULL,
	`displayName` varchar(255),
	`relationship` varchar(64),
	`method` enum('code','qr','invite_link') NOT NULL DEFAULT 'code',
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`revokedAt` timestamp,
	CONSTRAINT `caregiver_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `caregiver_links_pair_unq` UNIQUE(`caregiverOpenId`,`monitoredOpenId`)
);
--> statement-breakpoint
CREATE TABLE `link_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(16) NOT NULL,
	`createdByOpenId` varchar(64) NOT NULL,
	`createdByRole` enum('monitored','caregiver') NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`consumedByOpenId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `link_invites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `caregiver_links_monitored_idx` ON `caregiver_links` (`monitoredOpenId`);--> statement-breakpoint
CREATE INDEX `caregiver_links_caregiver_idx` ON `caregiver_links` (`caregiverOpenId`);--> statement-breakpoint
CREATE INDEX `link_invites_code_idx` ON `link_invites` (`code`);