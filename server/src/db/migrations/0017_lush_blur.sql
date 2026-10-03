CREATE TABLE "agent_context_attachments" (
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_context_attachments_agent_id_repo_id_path_pk" PRIMARY KEY("agent_id","repo_id","path")
);
--> statement-breakpoint
CREATE TABLE "repo_context_settings" (
	"repo_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"search_roots" text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_context_attachments" (
	"workspace_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_context_attachments_skill_id_repo_id_path_pk" PRIMARY KEY("skill_id","repo_id","path")
);
--> statement-breakpoint
ALTER TABLE "agent_context_attachments" ADD CONSTRAINT "agent_context_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_context_attachments" ADD CONSTRAINT "agent_context_attachments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_context_attachments" ADD CONSTRAINT "agent_context_attachments_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_context_settings" ADD CONSTRAINT "repo_context_settings_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_context_settings" ADD CONSTRAINT "repo_context_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_context_attachments" ADD CONSTRAINT "skill_context_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_context_attachments" ADD CONSTRAINT "skill_context_attachments_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_context_attachments" ADD CONSTRAINT "skill_context_attachments_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_ctx_att_repo_idx" ON "agent_context_attachments" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "skill_ctx_att_repo_idx" ON "skill_context_attachments" USING btree ("repo_id");