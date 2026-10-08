import { z } from 'zod';

/**
 * Skill eval results — the Evals tab of a skill. Rows are imported from the
 * `evals/` package's `records.jsonl` (one per case per run) and read back here.
 *
 * Standalone on purpose: imports nothing from the other contract files, so it
 * stays byte-identical between the `server/` and `client/` copies of
 * `@devdigest/shared`.
 */

export const SkillEvalConfig = z.enum(['candidate', 'baseline']);
export type SkillEvalConfig = z.infer<typeof SkillEvalConfig>;

/** One judged practice of a case, with the judge's verbatim evidence quote. */
export const SkillEvalPractice = z.object({
  practice: z.string(),
  passed: z.boolean(),
  evidence: z.string(),
});
export type SkillEvalPractice = z.infer<typeof SkillEvalPractice>;

export const SkillEvalResult = z.object({
  id: z.string(),
  run_id: z.string(),
  config: SkillEvalConfig,
  case_name: z.string(),
  outcome: z.boolean(),
  score: z.number().nullable(),
  threshold: z.number().nullable(),
  /** Grounding ratio 0..1; null when the case has no grounding gate. */
  grounded: z.number().nullable(),
  practices: z.array(SkillEvalPractice),
  git_sha: z.string().nullable(),
  dirty: z.boolean().nullable(),
  duration_ms: z.number().nullable(),
  input_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  num_turns: z.number().nullable(),
  ran_at: z.string(),
});
export type SkillEvalResult = z.infer<typeof SkillEvalResult>;

export const SkillEvalRunSummary = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  config: SkillEvalConfig,
  passed: z.number(),
  total: z.number(),
  avg_score: z.number().nullable(),
  git_sha: z.string().nullable(),
  dirty: z.boolean().nullable(),
});
export type SkillEvalRunSummary = z.infer<typeof SkillEvalRunSummary>;

export const SkillEvalSummary = z.object({
  total: z.number(),
  passing: z.number(),
  latest_run_id: z.string().nullable(),
  latest_ran_at: z.string().nullable(),
});
export type SkillEvalSummary = z.infer<typeof SkillEvalSummary>;

export const SkillEvalsResponse = z.object({
  summary: SkillEvalSummary,
  /** Latest candidate result per case. */
  latest: z.array(SkillEvalResult),
  /** Newest first. */
  runs: z.array(SkillEvalRunSummary),
});
export type SkillEvalsResponse = z.infer<typeof SkillEvalsResponse>;

export const SkillEvalSyncResponse = z.object({
  imported: z.number(),
  skipped: z.number(),
});
export type SkillEvalSyncResponse = z.infer<typeof SkillEvalSyncResponse>;
