ALTER TABLE "onboarding" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "commit_sha" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "status" text NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "last_failed_status" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "last_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;