CREATE TABLE "skill_eval_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"config" text NOT NULL,
	"case_name" text NOT NULL,
	"outcome" boolean NOT NULL,
	"score" double precision,
	"threshold" double precision,
	"grounded" double precision,
	"practices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"git_sha" text,
	"dirty" boolean,
	"duration_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"num_turns" integer,
	"ran_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_eval_results" ADD CONSTRAINT "skill_eval_results_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_eval_results" ADD CONSTRAINT "skill_eval_results_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_eval_results_case_uq" ON "skill_eval_results" USING btree ("skill_id","run_id","config","case_name");--> statement-breakpoint
CREATE INDEX "skill_eval_results_skill_ran_idx" ON "skill_eval_results" USING btree ("skill_id","ran_at");--> statement-breakpoint
CREATE INDEX "skill_eval_results_workspace_idx" ON "skill_eval_results" USING btree ("workspace_id");