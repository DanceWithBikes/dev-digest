import { z } from 'zod';
import { Finding, Verdict } from './findings.js';
import { Intent, SmartDiff } from './brief.js';

/**
 * A2 — Review-Core API surface contracts. These extend the core
 * Review/Finding/Intent/SmartDiff contracts with the persisted/transport shapes
 * the reviewer endpoints return. A2 owns this file; the barrel re-exports it.
 *
 * Distinct from `Finding` (the raw LLM-output unit): `FindingRecord` adds the
 * persisted row identity + action timestamps so the UI can render accept/dismiss
 * state and the `review_id` it belongs to.
 */

export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

/** A persisted review with its kept findings + grounding summary. */
export const ReviewRecord = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  grounding: z.string().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/**
 * Response of `POST /pulls/:id/review`. Each requested agent produces a run that
 * streams over SSE at `/runs/:runId/events`; clients subscribe per run. The
 * persisted reviews are also returned once the (synchronous) run completes.
 */
export const ReviewRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTarget>;

export const ReviewRunResponse = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
  reviews: z.array(ReviewRecord),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

/** One attempt to gather an intent source — provenance for the INTENT card. */
export const IntentSource = z.object({
  kind: z.string(),
  ref: z.string().nullable(),
  ok: z.boolean(),
});
export type IntentSource = z.infer<typeof IntentSource>;

/**
 * Intent persisted for a PR (the Intent plus the pr_id it scopes, and the
 * provenance & missing-context tracking which sources resolved).
 */
export const PrIntentRecord = Intent.extend({
  pr_id: z.string(),
  sources: z.array(IntentSource).nullish(),
  missing_context: z.array(z.string()).nullish(),
  head_sha: z.string().nullish(),
  /**
   * Fingerprint of the PR description this intent was derived from. Provenance
   * only — `stale` is what the UI reads; null on records written before the
   * column existed.
   */
  body_sha: z.string().nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  generated_at: z.string().nullish(),
  /**
   * Derived server-side on read, never stored: the PR moved on since this
   * intent was classified, so its scope bullets and — above all — its
   * `missing_context[]` may no longer describe the PR. True when the head sha
   * moved OR the description changed (a description edit moves no commit, so
   * `head_sha` alone misses it entirely). Always false on the record the
   * classifier just produced.
   */
  stale: z.boolean().nullish(),
});
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

/** Smart-diff response for a PR (the SmartDiff). */
export const SmartDiffResponse = SmartDiff;
export type SmartDiffResponse = z.infer<typeof SmartDiffResponse>;
