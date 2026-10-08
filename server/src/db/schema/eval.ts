import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { findings } from './reviews';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdFrom: text('created_from', { enum: ['finding', 'manual'] })
      .notNull()
      .default('manual'),
    /** One case per finding (AC-33); Postgres UNIQUE allows many NULLs (manual cases). */
    sourceFindingId: uuid('source_finding_id').references(() => findings.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    ownerIdx: index('eval_cases_workspace_owner_idx').on(t.workspaceId, t.ownerId),
    sourceFindingUq: uniqueIndex('eval_cases_source_finding_uq').on(t.sourceFindingId),
  }),
);

/** One scored run of an agent over its whole case set, with the inputs frozen. */
export const evalBatches = pgTable(
  'eval_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    /** Resolved skill bodies frozen at request time (AC-48 / AC-50). */
    skills: jsonb('skills').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text('status', { enum: ['running', 'done', 'failed'] }).notNull(),
    error: text('error'),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    casesTotal: integer('cases_total').notNull().default(0),
    casesPassed: integer('cases_passed').notNull().default(0),
    mustFindTotal: integer('must_find_total').notNull().default(0),
    mustFindMatched: integer('must_find_matched').notNull().default(0),
    keptTotal: integer('kept_total').notNull().default(0),
    noiseTotal: integer('noise_total').notNull().default(0),
    droppedTotal: integer('dropped_total').notNull().default(0),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => ({
    agentRanIdx: index('eval_batches_agent_ran_idx').on(t.agentId, t.ranAt),
    workspaceRanIdx: index('eval_batches_workspace_ran_idx').on(t.workspaceId, t.ranAt),
    /** At most one `running` batch per agent: closes the check-then-insert race of a double start. */
    oneRunningUq: uniqueIndex('eval_batches_one_running_uq')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
  }),
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id').references(() => evalBatches.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
    error: text('error'),
  },
  (t) => ({
    batchIdx: index('eval_runs_batch_idx').on(t.batchId),
    caseRanIdx: index('eval_runs_case_ran_idx').on(t.caseId, t.ranAt),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
