CREATE TABLE `cash_count` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`expected` integer,
	`counted` integer,
	`note` text,
	`counted_at` text
);
--> statement-breakpoint
CREATE TABLE `sync_upload` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`file_uri` text NOT NULL,
	`content_type` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL
);
