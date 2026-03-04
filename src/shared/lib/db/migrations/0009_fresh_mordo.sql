CREATE TABLE `session_pauses` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_slug` text NOT NULL,
	`tool_use_id` text NOT NULL,
	`duration` text NOT NULL,
	`reason` text,
	`resume_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `session_pauses_status_resume_at_idx` ON `session_pauses` (`status`,`resume_at`);--> statement-breakpoint
CREATE INDEX `session_pauses_session_id_idx` ON `session_pauses` (`session_id`);