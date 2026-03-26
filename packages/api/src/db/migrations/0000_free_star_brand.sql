CREATE TABLE `postcards` (
	`id` text PRIMARY KEY NOT NULL,
	`message` text,
	`sender_name` text,
	`country` text,
	`latitude` real,
	`longitude` real,
	`front_image_key` text NOT NULL,
	`back_image_key` text,
	`status` text DEFAULT 'scanned' NOT NULL,
	`created_at` text NOT NULL
);
