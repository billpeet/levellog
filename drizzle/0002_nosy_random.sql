CREATE TABLE `annotation_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`ax` real NOT NULL,
	`ay` real NOT NULL,
	`bx` real NOT NULL,
	`by` real NOT NULL,
	`color_hex` text DEFAULT '#0f100e' NOT NULL,
	`style` text DEFAULT 'solid' NOT NULL,
	`stroke_width` real DEFAULT 1.5 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
