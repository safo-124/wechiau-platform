CREATE TABLE `bird_count` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`farmer_id` text,
	`count` integer,
	`kind` text,
	`source_type` text,
	`source_id` text,
	`counted_at` text
);
--> statement-breakpoint
CREATE TABLE `buyer` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`name` text,
	`type` text,
	`phone` text,
	`location` text
);
--> statement-breakpoint
CREATE TABLE `cash_handover` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`from_user_id` text,
	`to_user_id` text,
	`amount` integer,
	`handed_at` text
);
--> statement-breakpoint
CREATE TABLE `cold_chain_reading` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`temp_c` real,
	`place` text,
	`farmer_id` text,
	`round_id` text,
	`read_at` text
);
--> statement-breakpoint
CREATE TABLE `collection` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`farmer_id` text,
	`collected_at` text,
	`crates` integer,
	`price_per_crate` integer,
	`amount_paid` integer,
	`receipt_sms_id` text
);
--> statement-breakpoint
CREATE TABLE `farmer` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`name` text,
	`phone` text,
	`language` text,
	`lat` real,
	`lng` real,
	`digital_address` text,
	`landmark` text,
	`joined_on` text,
	`status` text,
	`consent_training` integer,
	`consent_recorded_at` text
);
--> statement-breakpoint
CREATE TABLE `health_case` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`farmer_id` text,
	`channel` text,
	`triage_suggested` text,
	`triage` text,
	`triage_confirmed_by` text,
	`assigned_vet_id` text,
	`status` text,
	`diagnosis` text,
	`treatment` text,
	`follow_up_on` text,
	`closed_at` text
);
--> statement-breakpoint
CREATE TABLE `ledger_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`fund` text,
	`amount` integer,
	`source_type` text,
	`source_id` text,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`farmer_id` text,
	`health_case_id` text,
	`direction` text,
	`sender_id` text,
	`kind` text,
	`body` text,
	`audio_uri` text,
	`audio_seconds` integer,
	`transcript` text,
	`translation` text,
	`delivery` text
);
--> statement-breakpoint
CREATE TABLE `monthly_report` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`month` text,
	`draft_text` text,
	`final_text` text,
	`status` text,
	`approved_by` text,
	`approved_at` text
);
--> statement-breakpoint
CREATE TABLE `sale` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`buyer_id` text,
	`sold_at` text,
	`crates` integer,
	`price_per_crate` integer,
	`due_on` text
);
--> statement-breakpoint
CREATE TABLE `sale_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`sale_id` text,
	`amount` integer,
	`received_at` text
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`key` text,
	`value` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `setting_key_unique` ON `setting` (`key`);--> statement-breakpoint
CREATE TABLE `sms_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`to_phone` text,
	`body` text,
	`status` text,
	`attempts` integer
);
--> statement-breakpoint
CREATE TABLE `sync_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`op` text NOT NULL,
	`payload` text NOT NULL,
	`previous` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_rejection` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`reason` text NOT NULL,
	`payload` text NOT NULL,
	`rejected_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`name` text,
	`phone` text,
	`email` text,
	`role` text,
	`farmer_id` text,
	`status` text
);
--> statement-breakpoint
CREATE TABLE `vaccination` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`farmer_id` text,
	`round_id` text,
	`vet_id` text,
	`batch_id` text,
	`birds_vaccinated` integer,
	`farm_reading_id` text,
	`vaccinated_at` text
);
--> statement-breakpoint
CREATE TABLE `vaccination_round` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`number` integer,
	`date` text,
	`is_free` integer,
	`price_per_dose` integer
);
--> statement-breakpoint
CREATE TABLE `vaccine_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`batch_no` text,
	`vaccine_name` text,
	`expiry_on` text,
	`received_at` text
);
--> statement-breakpoint
CREATE TABLE `vaccine_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`farmer_id` text,
	`round_id` text,
	`amount` integer,
	`paid_at` text
);
--> statement-breakpoint
CREATE TABLE `vaccine_stock_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`batch_id` text,
	`doses` integer,
	`reason` text,
	`source_type` text,
	`source_id` text
);
--> statement-breakpoint
CREATE TABLE `vet_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`farmer_id` text,
	`vet_id` text,
	`assigned_at` text
);
--> statement-breakpoint
CREATE TABLE `visit` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`device_id` text NOT NULL,
	`recorded_by` text,
	`farmer_id` text,
	`visited_at` text,
	`deaths` integer,
	`suspected_cause` text,
	`notes` text,
	`photo_uri` text
);
