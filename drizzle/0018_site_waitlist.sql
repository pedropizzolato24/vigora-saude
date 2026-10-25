CREATE TABLE `waitlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`reasons` json NOT NULL,
	`policyVersion` varchar(20) NOT NULL,
	`consentAt` timestamp NOT NULL,
	`unsubscribeToken` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `waitlist_id` PRIMARY KEY(`id`),
	CONSTRAINT `waitlist_email_unique` UNIQUE(`email`),
	CONSTRAINT `waitlist_unsubscribeToken_unique` UNIQUE(`unsubscribeToken`)
);
