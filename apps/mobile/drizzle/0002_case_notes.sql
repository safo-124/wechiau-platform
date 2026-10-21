CREATE TABLE `case_note` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`health_case_id` text,
	`kind` text,
	`body` text
);
