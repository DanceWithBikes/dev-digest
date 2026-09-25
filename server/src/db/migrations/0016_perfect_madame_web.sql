CREATE TABLE "pr_file_summary" (
	"pr_id" uuid NOT NULL,
	"path" text NOT NULL,
	"patch_sha" text NOT NULL,
	"summary" text NOT NULL,
	"provider" text,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" double precision,
	"generated_at" timestamp with time zone,
	CONSTRAINT "pr_file_summary_pr_id_path_pk" PRIMARY KEY("pr_id","path")
);
--> statement-breakpoint
ALTER TABLE "pr_file_summary" ADD CONSTRAINT "pr_file_summary_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;