CREATE TABLE `guests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`name` varchar(300) NOT NULL,
	`email` varchar(320),
	`phone` varchar(30),
	`portalToken` text,
	`notificationStatus` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
	`notificationSentAt` timestamp,
	`notificationError` text,
	`rsvpId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `guests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`type` enum('invitation','update','reminder','broadcast') NOT NULL DEFAULT 'invitation',
	`subject` varchar(500),
	`body` text,
	`recipientCount` int DEFAULT 0,
	`sentCount` int DEFAULT 0,
	`failedCount` int DEFAULT 0,
	`triggeredBy` enum('host','system') NOT NULL DEFAULT 'host',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `events` ADD `templateId` varchar(64);