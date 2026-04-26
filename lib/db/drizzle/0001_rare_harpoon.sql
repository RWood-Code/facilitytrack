CREATE TABLE `license_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`license_key` text NOT NULL,
	`server_url` text NOT NULL,
	`last_status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_validated_at` integer NOT NULL,
	`last_checked_at` integer NOT NULL,
	`customer_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
