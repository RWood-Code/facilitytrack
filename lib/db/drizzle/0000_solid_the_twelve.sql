CREATE TABLE `facilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`phone` text,
	`email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`facility_id` integer NOT NULL,
	`pool_type` text DEFAULT 'pool' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`volume_litres` real,
	`custom_ph_min` real,
	`custom_ph_max` real,
	`custom_free_chlorine_min` real,
	`custom_free_chlorine_max` real,
	`custom_temp_min` real,
	`custom_temp_max` real,
	`custom_turbidity_max` real,
	`custom_combined_chlorine_max` real,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `test_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pool_id` integer NOT NULL,
	`tested_by` text,
	`tested_at` integer NOT NULL,
	`free_chlorine` real,
	`total_available_chlorine` real,
	`combined_chlorine` real,
	`ph` real,
	`temperature` real,
	`turbidity` real,
	`total_alkalinity` real,
	`is_compliant` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pool_id`) REFERENCES `pools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `water_balance_tests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pool_id` integer NOT NULL,
	`tested_by` text,
	`tested_at` integer NOT NULL,
	`ph` real,
	`total_alkalinity` real,
	`calcium_hardness` real,
	`cyanuric_acid` real,
	`total_dissolved_solids` real,
	`langelier` real,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pool_id`) REFERENCES `pools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pool_closures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pool_id` integer NOT NULL,
	`closed_by` text,
	`closed_at` integer NOT NULL,
	`reopened_at` integer,
	`closure_code` text,
	`reason` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pool_id`) REFERENCES `pools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `steam_room_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pool_id` integer NOT NULL,
	`checked_by` text,
	`checked_at` integer NOT NULL,
	`temperature` real,
	`humidity` real,
	`is_clean` integer,
	`is_operational` integer,
	`entry_type` text DEFAULT 'day_log' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pool_id`) REFERENCES `pools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`facility_id` integer,
	`pool_id` integer,
	`asset_id` integer,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_to` integer,
	`due_date` integer,
	`completed_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`facility_id` integer,
	`category` text,
	`status` text DEFAULT 'operational' NOT NULL,
	`barcode` text,
	`serial_number` text,
	`manufacturer` text,
	`model` text,
	`purchase_date` integer,
	`last_service_date` integer,
	`next_service_date` integer,
	`location` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `maintenance_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`facility_id` integer,
	`asset_id` integer,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_completed_at` integer,
	`next_due_at` integer,
	`assigned_to` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text,
	`phone` text,
	`role` text,
	`facility_id` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`start_date` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff_qualifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_id` integer NOT NULL,
	`qualification_name` text NOT NULL,
	`issuer` text,
	`issued_date` integer,
	`expiry_date` integer,
	`certificate_number` text,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `training_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_id` integer NOT NULL,
	`training_name` text NOT NULL,
	`completed_at` integer,
	`provider` text,
	`duration_hours` real,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`type` text DEFAULT 'info' NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`related_entity_type` text,
	`related_entity_id` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`password_hash` text NOT NULL,
	`pin` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_email_unique` ON `app_users` (`email`);--> statement-breakpoint
CREATE TABLE `compliance_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`facility_id` integer,
	`document_type` text NOT NULL,
	`document_name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'current' NOT NULL,
	`issued_date` integer,
	`expiry_date` integer,
	`issued_by` text,
	`reference_number` text,
	`document_url` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`label` text,
	`category` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_settings_key_unique` ON `system_settings` (`key`);--> statement-breakpoint
CREATE TABLE `asset_attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`file_url` text NOT NULL,
	`file_type` text,
	`file_size` integer,
	`uploaded_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
