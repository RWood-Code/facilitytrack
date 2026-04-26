CREATE TABLE `backup_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`client_id` text,
	`tenant_id` text,
	`refresh_token` text,
	`target_folder` text DEFAULT 'FacilityTrack/Backups' NOT NULL,
	`schedule_hour` integer DEFAULT 2 NOT NULL,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`last_error` text,
	`last_backup_bytes` integer,
	`last_backup_remote_path` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
