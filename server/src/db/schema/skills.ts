import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  primaryKey,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }).notNull(),
  source: text('source', {
    enum: ['manual', 'imported_url', 'imported_file', 'extracted', 'community'],
  }).notNull(),
  body: text('body').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  version: integer('version').notNull().default(1),
  evidenceFiles: jsonb('evidence_files').$type<string[]>(),
  createdAt: now(),
});

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);

/**
 * Imported results of a skill's eval suite (`evals/skills/<name>/*.eval.ts`).
 * Separate from the agent-centric `eval_*` tables. One row per case per run and
 * configuration; re-importing the same records file is idempotent via the
 * unique index.
 */
export const skillEvalResults = pgTable(
  'skill_eval_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    runId: text('run_id').notNull(),
    config: text('config', { enum: ['candidate', 'baseline'] }).notNull(),
    caseName: text('case_name').notNull(),
    outcome: boolean('outcome').notNull(),
    score: doublePrecision('score'),
    threshold: doublePrecision('threshold'),
    grounded: doublePrecision('grounded'),
    practices: jsonb('practices')
      .$type<Array<{ practice: string; passed: boolean; evidence: string }>>()
      .notNull()
      .default([]),
    gitSha: text('git_sha'),
    dirty: boolean('dirty'),
    durationMs: integer('duration_ms'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    numTurns: integer('num_turns'),
    ranAt: timestamp('ran_at', { withTimezone: true }).notNull(),
    createdAt: now(),
  },
  (t) => ({
    caseUq: uniqueIndex('skill_eval_results_case_uq').on(t.skillId, t.runId, t.config, t.caseName),
    skillRanIdx: index('skill_eval_results_skill_ran_idx').on(t.skillId, t.ranAt),
    workspaceIdx: index('skill_eval_results_workspace_idx').on(t.workspaceId),
  }),
);
