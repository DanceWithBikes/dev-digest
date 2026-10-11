import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { agentRuns } from './runs';
import { repos } from './repos';
import { workspaces } from './core';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'set null' }),
    repo: text('repo').notNull(),
    githubRepoId: bigint('github_repo_id', { mode: 'number' }).notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    state: text('state', { enum: ['pr_open', 'active', 'pr_closed'] })
      .notNull()
      .default('pr_open'),
    agentVersion: integer('agent_version').notNull(),
    runnerVersion: text('runner_version').notNull(),
    prUrl: text('pr_url'),
    prNumber: integer('pr_number'),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // One installation per repo per workspace (a repo has one agent's CI).
    workspaceRepoUq: uniqueIndex('ci_installations_workspace_repo_uq').on(t.workspaceId, t.repo),
    agentIdx: index('ci_installations_agent_idx').on(t.agentId),
    repoIdIdx: index('ci_installations_repo_id_idx').on(t.repoId),
  }),
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    agentRunId: uuid('agent_run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    headSha: text('head_sha'),
    githubRunId: bigint('github_run_id', { mode: 'number' }).notNull(),
    runAttempt: integer('run_attempt').notNull(),
    artifactId: bigint('artifact_id', { mode: 'number' }),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    // Legacy columns: unused, `agent_runs` holds status / findings / cost (AC-52).
    status: text('status'),
    findingsCount: integer('findings_count'),
    costUsd: doublePrecision('cost_usd'),
    githubUrl: text('github_url'),
    source: text('source'),
  },
  (t) => ({
    runAttemptUq: uniqueIndex('ci_runs_installation_run_attempt_uq').on(
      t.ciInstallationId,
      t.githubRunId,
      t.runAttempt,
    ),
    workspaceRanAtIdx: index('ci_runs_workspace_ran_at_idx').on(t.workspaceId, t.ranAt),
    agentRunIdx: index('ci_runs_agent_run_idx').on(t.agentRunId),
  }),
);
