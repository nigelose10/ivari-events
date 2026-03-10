CREATE TABLE `events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`hostId` int NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`imagePrompt` text,
	`imageUrl` text,
	`eventDate` bigint,
	`locationName` varchar(500),
	`locationLat` text,
	`locationLng` text,
	`locationPlaceId` varchar(300),
	`surveyConfig` json,
	`status` enum('draft','active','past','cancelled') NOT NULL DEFAULT 'draft',
	`guestTokenSalt` varchar(128),
	`maxGuests` int DEFAULT 0,
	`memoryWallEnabled` enum('0','1') NOT NULL DEFAULT '1',
	`smsBroadcastEnabled` enum('0','1') NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `events_id` PRIMARY KEY(`id`),
	CONSTRAINT `events_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`uploaderName` varchar(300),
	`imageUrl` text NOT NULL,
	`fileKey` varchar(500),
	`caption` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rsvps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`guestName` varchar(300) NOT NULL,
	`guestEmail` varchar(320),
	`guestPhone` varchar(30),
	`status` enum('attending','declined','maybe') NOT NULL DEFAULT 'attending',
	`plusOnes` int DEFAULT 0,
	`surveyResponses` json,
	`message` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rsvps_id` PRIMARY KEY(`id`)
);
