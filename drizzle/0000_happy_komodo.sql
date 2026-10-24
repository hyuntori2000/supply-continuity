CREATE TABLE `recovery_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`scenario` text NOT NULL,
	`matches` text NOT NULL,
	`plan` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`decision_at` text,
	`decision_note` text
);
--> statement-breakpoint
CREATE TABLE `workflow_events` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text,
	`kind` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
