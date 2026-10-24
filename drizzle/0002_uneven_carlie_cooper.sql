CREATE TABLE `intake_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` integer NOT NULL,
	`store_name` text NOT NULL,
	`report` text NOT NULL,
	`status` text NOT NULL,
	`extraction` text,
	`model` text,
	`created_at` text NOT NULL
);
