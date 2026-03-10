ALTER TABLE `events` ADD `language` varchar(10) DEFAULT 'en';--> statement-breakpoint
ALTER TABLE `guests` ADD `checkedIn` enum('0','1') DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `guests` ADD `checkedInAt` timestamp;