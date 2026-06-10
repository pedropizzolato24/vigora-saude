CREATE TABLE `auth_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purpose` enum('signup','reset','phone') NOT NULL,
	`target` varchar(320) NOT NULL,
	`codeHash` varchar(64) NOT NULL,
	`payload` json,
	`attempts` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_codes_purpose_target_uq` UNIQUE(`purpose`,`target`)
);
--> statement-breakpoint
CREATE TABLE `auth_identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` enum('google','apple','email','phone') NOT NULL,
	`subject` varchar(320) NOT NULL,
	`openId` varchar(64) NOT NULL,
	`passwordHash` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auth_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_identities_provider_subject_uq` UNIQUE(`provider`,`subject`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_uq` UNIQUE(`email`);--> statement-breakpoint
CREATE INDEX `auth_identities_openid_idx` ON `auth_identities` (`openId`);