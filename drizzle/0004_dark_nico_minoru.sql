CREATE TABLE `portalViews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`visitorHash` varchar(64),
	`page` varchar(64) NOT NULL DEFAULT 'portal',
	`referrer` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portalViews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `events` ADD `themeColor` varchar(32);--> statement-breakpoint
ALTER TABLE `events` ADD `themeColorSecondary` varchar(32);