CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `level_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`benchmark_point_id` text NOT NULL,
	`benchmark_staff_reading` real NOT NULL,
	`instrument_height` real NOT NULL,
	`note` text,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`benchmark_point_id`) REFERENCES `points`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `level_sessions_one_active_per_project_idx` ON `level_sessions` (`project_id`) WHERE "level_sessions"."ended_at" IS NULL;--> statement-breakpoint
CREATE TABLE `level_types` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`color_hex` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `level_types_project_code_idx` ON `level_types` (`project_id`,`code`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`image_path` text,
	`mime_type` text,
	`width_px` integer,
	`height_px` integer,
	`scale_px_per_metre` real,
	`scale_ref_ax` real,
	`scale_ref_ay` real,
	`scale_ref_bx` real,
	`scale_ref_by` real,
	`scale_ref_metres` real,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_project_id_unique` ON `plans` (`project_id`);--> statement-breakpoint
CREATE TABLE `points` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`label` text NOT NULL,
	`x_px` real NOT NULL,
	`y_px` real NOT NULL,
	`is_benchmark` integer DEFAULT false NOT NULL,
	`known_elevation` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "points_benchmark_known_elevation_check" CHECK("points"."is_benchmark" = 0 OR "points"."known_elevation" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`primary_level_type_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `readings` (
	`id` text PRIMARY KEY NOT NULL,
	`point_id` text NOT NULL,
	`level_type_id` text NOT NULL,
	`session_id` text,
	`staff_reading` real,
	`elevation` real NOT NULL,
	`note` text,
	`taken_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`point_id`) REFERENCES `points`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`level_type_id`) REFERENCES `level_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`session_id`) REFERENCES `level_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `readings_point_level_type_idx` ON `readings` (`point_id`,`level_type_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
