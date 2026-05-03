CREATE TABLE `account_anchors` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`pattern` text NOT NULL,
	`as_of_date` text NOT NULL,
	`balance` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `annual_budgets` (
	`category` text PRIMARY KEY NOT NULL,
	`amount` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `asset_snapshots` (
	`year_month` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`total` integer NOT NULL,
	`savings` integer NOT NULL,
	`stocks` integer NOT NULL,
	`funds` integer NOT NULL,
	`pension` integer NOT NULL,
	`points` integer NOT NULL,
	`source_file_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `category_order` (
	`idx` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `csv_files` (
	`drive_file_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`modified_time` text NOT NULL,
	`parsed_at` integer NOT NULL,
	`row_count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_csv_kind` ON `csv_files` (`kind`);--> statement-breakpoint
CREATE TABLE `encrypted_secrets` (
	`key` text PRIMARY KEY NOT NULL,
	`ciphertext` blob NOT NULL,
	`iv` blob NOT NULL,
	`key_id` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`account_patterns_json` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `overrides` (
	`transaction_id` integer PRIMARY KEY NOT NULL,
	`large_category` text,
	`mid_category` text,
	`memo` text,
	`is_transfer_override` integer,
	`excluded` integer,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_expires` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`fetched` integer,
	`errors_json` text
);
--> statement-breakpoint
CREATE INDEX `idx_sync_kind_status` ON `sync_log` (`kind`,`status`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mf_row_id` text NOT NULL,
	`source_file_id` text NOT NULL,
	`date` text NOT NULL,
	`year_month` text NOT NULL,
	`amount` integer NOT NULL,
	`content_name` text,
	`account` text,
	`large_category` text,
	`mid_category` text,
	`memo` text,
	`is_target` integer NOT NULL,
	`is_transfer` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tx_source_row` ON `transactions` (`source_file_id`,`mf_row_id`);--> statement-breakpoint
CREATE INDEX `idx_tx_year_month` ON `transactions` (`year_month`);--> statement-breakpoint
CREATE INDEX `idx_tx_account` ON `transactions` (`account`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`picture` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);