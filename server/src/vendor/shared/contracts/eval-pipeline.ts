import { z } from 'zod';
import { Finding } from './findings.js';
import { EvalCase, Provider } from './knowledge.js';
import { EvalRunRecord } from './eval-ci.js';

/**
 * SPEC-04 — Eval pipeline contracts: typed expectations, per-case records,
 * scored batches and the dashboard overview.
 *
 * EXTENDS the barrel; imports only exports that are identical in both copies
 * of `@devdigest/shared` (the two copies already drift elsewhere). This file
 * must stay byte-identical between `server/` and `client/`.
 */

/** Hard cap on a case's input diff (characters). */
export const EVAL_INPUT_DIFF_MAX = 200_000;

// ===========================================================================
// Cases
// ===========================================================================

export const EvalExpectationKind = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationKind = z.infer<typeof EvalExpectationKind>;

/**
 * One expectation of a case. `severity` / `category` are plain strings (not the
 * enums) so a legacy finding row never fails serialization.
 */
export const EvalExpectation = z.object({
  kind: EvalExpectationKind,
  file: z.string().min(1),
  start_line: z.number().int().min(1),
  end_line: z.number().int().min(1),
  title: z.string().nullish(),
  severity: z.string().nullish(),
  category: z.string().nullish(),
});
export type EvalExpectation = z.infer<typeof EvalExpectation>;

export const EvalExpectedOutput = z.object({
  expectations: z.array(EvalExpectation).min(1),
});
export type EvalExpectedOutput = z.infer<typeof EvalExpectedOutput>;

/** Title/body of the PR a case was derived from (fed to the engine as the PR description). */
export const EvalCaseMeta = z.object({
  title: z.string().nullish(),
  body: z.string().nullish(),
});
export type EvalCaseMeta = z.infer<typeof EvalCaseMeta>;

export const EvalCaseSource = z.enum(['finding', 'manual']);
export type EvalCaseSource = z.infer<typeof EvalCaseSource>;

/** Summary of a case's newest run. */
export const EvalCaseLastRun = z.object({
  pass: z.boolean().nullable(),
  batch_id: z.string().nullable(),
});
export type EvalCaseLastRun = z.infer<typeof EvalCaseLastRun>;

export const EvalCaseRecord = EvalCase.extend({
  expected_output: EvalExpectedOutput,
  input_meta: EvalCaseMeta.nullish(),
  created_at: z.string(),
  created_from: EvalCaseSource,
  source_finding_id: z.string().nullable(),
  last_run: EvalCaseLastRun.nullable(),
});
export type EvalCaseRecord = z.infer<typeof EvalCaseRecord>;

/** Create / replace payload for a case (owner resolved from the route). */
export const EvalCaseUpsert = z.object({
  name: z.string().min(1),
  input_diff: z.string().max(EVAL_INPUT_DIFF_MAX),
  input_meta: EvalCaseMeta.nullish(),
  expected_output: EvalExpectedOutput.refine(
    (o) => o.expectations.every((e) => e.start_line <= e.end_line),
    { message: 'start_line must be <= end_line', path: ['expectations'] },
  ),
  notes: z.string().nullish(),
});
export type EvalCaseUpsert = z.infer<typeof EvalCaseUpsert>;

/** Body of `POST /findings/:id/eval-case`. */
export const EvalCaseFromFindingInput = z.object({
  agent_id: z.string().uuid().optional(),
});
export type EvalCaseFromFindingInput = z.infer<typeof EvalCaseFromFindingInput>;

// ===========================================================================
// Batches
// ===========================================================================

export const EvalBatchStatus = z.enum(['running', 'done', 'failed']);
export type EvalBatchStatus = z.infer<typeof EvalBatchStatus>;

/** What the batch ran with, frozen when the request arrived. */
export const EvalBatchSnapshot = z.object({
  agent_version: z.number().int(),
  system_prompt: z.string(),
  provider: Provider,
  model: z.string(),
  /** Names of the linked skills (bodies are resolved once per batch, in memory). */
  skills: z.array(z.string()),
});
export type EvalBatchSnapshot = z.infer<typeof EvalBatchSnapshot>;

export const EvalBatch = EvalBatchSnapshot.extend({
  id: z.string(),
  agent_id: z.string(),
  status: EvalBatchStatus,
  error: z.string().nullable(),
  ran_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_passed: z.number().int(),
  must_find_total: z.number().int(),
  must_find_matched: z.number().int(),
  kept_total: z.number().int(),
  noise_total: z.number().int(),
  dropped_total: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalBatch = z.infer<typeof EvalBatch>;

/** What the engine produced for one case. */
export const EvalCaseActual = z.object({
  kept: z.array(Finding),
  dropped: z.array(Finding),
  /** Indices into the case's `expectations` that a kept finding matched. */
  matched_expectations: z.array(z.number().int()),
  noise_finding_ids: z.array(z.string()),
  mode: z.enum(['single-pass', 'map-reduce']),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  /** The case's expectations as scored — the run's own snapshot, immune to later case edits. */
  expected_output: EvalExpectedOutput.nullish(),
});
export type EvalCaseActual = z.infer<typeof EvalCaseActual>;

/** One per-case run inside a batch. */
export const EvalBatchRun = EvalRunRecord.extend({
  batch_id: z.string(),
  expected_output: EvalExpectedOutput,
  actual_output: EvalCaseActual.nullable(),
  error: z.string().nullable(),
});
export type EvalBatchRun = z.infer<typeof EvalBatchRun>;

export const EvalBatchDetail = z.object({
  batch: EvalBatch,
  runs: z.array(EvalBatchRun),
});
export type EvalBatchDetail = z.infer<typeof EvalBatchDetail>;

// ===========================================================================
// Overview
// ===========================================================================

export const EvalAgentSummary = z.object({
  agent_id: z.string(),
  name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  latest_batch: EvalBatch.nullable(),
  /** Up to 10 newest `done` batches, chronological. */
  trend: z.array(EvalBatch).max(10),
});
export type EvalAgentSummary = z.infer<typeof EvalAgentSummary>;

export const EvalOverview = z.object({
  agents: z.array(EvalAgentSummary),
  recent_batches: z.array(EvalBatch),
});
export type EvalOverview = z.infer<typeof EvalOverview>;
