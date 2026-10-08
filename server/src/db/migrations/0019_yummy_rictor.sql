CREATE TABLE "eval_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"system_prompt" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"cases_total" integer DEFAULT 0 NOT NULL,
	"cases_passed" integer DEFAULT 0 NOT NULL,
	"must_find_total" integer DEFAULT 0 NOT NULL,
	"must_find_matched" integer DEFAULT 0 NOT NULL,
	"kept_total" integer DEFAULT 0 NOT NULL,
	"noise_total" integer DEFAULT 0 NOT NULL,
	"dropped_total" integer DEFAULT 0 NOT NULL,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"duration_ms" integer,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" double precision
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_from" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "eval_batches" ADD CONSTRAINT "eval_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_batches" ADD CONSTRAINT "eval_batches_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_batches_agent_ran_idx" ON "eval_batches" USING btree ("agent_id","ran_at");--> statement-breakpoint
CREATE INDEX "eval_batches_workspace_ran_idx" ON "eval_batches" USING btree ("workspace_id","ran_at");--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_source_finding_id_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_batch_id_eval_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."eval_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_cases_workspace_owner_idx" ON "eval_cases" USING btree ("workspace_id","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_source_finding_uq" ON "eval_cases" USING btree ("source_finding_id");--> statement-breakpoint
CREATE INDEX "eval_runs_batch_idx" ON "eval_runs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "eval_runs_case_ran_idx" ON "eval_runs" USING btree ("case_id","ran_at");