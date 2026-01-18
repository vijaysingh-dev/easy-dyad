PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`github_org` text,
	`github_repo` text,
	`github_branch` text,
	`supabase_project_id` text,
	`neon_project_id` text,
	`neon_development_branch_id` text,
	`neon_preview_branch_id` text,
	`vercel_project_id` text,
	`vercel_project_name` text,
	`vercel_team_id` text,
	`vercel_deployment_url` text,
	`install_command` text,
	`start_command` text,
	`chat_context` text,
	`is_favorite` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_apps`("id", "name", "path", "created_at", "updated_at", "github_org", "github_repo", "github_branch", "supabase_project_id", "neon_project_id", "neon_development_branch_id", "neon_preview_branch_id", "vercel_project_id", "vercel_project_name", "vercel_team_id", "vercel_deployment_url", "install_command", "start_command", "chat_context", "is_favorite") SELECT "id", "name", "path", "created_at", "updated_at", "github_org", "github_repo", "github_branch", "supabase_project_id", "neon_project_id", "neon_development_branch_id", "neon_preview_branch_id", "vercel_project_id", "vercel_project_name", "vercel_team_id", "vercel_deployment_url", "install_command", "start_command", "chat_context", "is_favorite" FROM `apps`;--> statement-breakpoint
DROP TABLE `apps`;--> statement-breakpoint
ALTER TABLE `__new_apps` RENAME TO `apps`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_chats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` text NOT NULL,
	`title` text,
	`initial_commit_hash` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_chats`("id", "app_id", "title", "initial_commit_hash", "created_at") SELECT "id", "app_id", "title", "initial_commit_hash", "created_at" FROM `chats`;--> statement-breakpoint
DROP TABLE `chats`;--> statement-breakpoint
ALTER TABLE `__new_chats` RENAME TO `chats`;--> statement-breakpoint
CREATE TABLE `__new_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` text NOT NULL,
	`commit_hash` text NOT NULL,
	`neon_db_timestamp` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_versions`("id", "app_id", "commit_hash", "neon_db_timestamp", "created_at", "updated_at") SELECT "id", "app_id", "commit_hash", "neon_db_timestamp", "created_at", "updated_at" FROM `versions`;--> statement-breakpoint
DROP TABLE `versions`;--> statement-breakpoint
ALTER TABLE `__new_versions` RENAME TO `versions`;--> statement-breakpoint
CREATE UNIQUE INDEX `versions_app_commit_unique` ON `versions` (`app_id`,`commit_hash`);