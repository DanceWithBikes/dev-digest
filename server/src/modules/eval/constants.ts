/** Constants for the eval module. */

/** Batches returned by `GET /agents/:id/eval-runs` (AC-59). */
export const MAX_BATCHES_LISTED = 50;

/** Newest `done` batches kept per agent in the overview trend (AC-62). */
export const TREND_LIMIT = 10;

/** Newest batches across the workspace in the overview (AC-63). */
export const RECENT_BATCHES_LIMIT = 20;

/** Hard deadline of one model request during an eval batch (ms). */
export const CASE_TIMEOUT_MS = 240_000;

/** Reason codes of the 409 answers (`ConflictError(message, undefined, code)`). */
export const ERR = {
  FINDING_UNDECIDED: 'finding_undecided',
  NO_AGENT: 'no_agent',
  NO_PATCH: 'no_patch',
  NO_EVAL_CASES: 'no_eval_cases',
  BATCH_RUNNING: 'batch_running',
} as const;

/** Error stored on a batch the boot reaper finds still `running` (AC-58). */
export const REAPED_BATCH_ERROR = 'The API restarted while this batch was running';

/** Error stored when every case of a batch was deleted before it could run. */
export const NO_CASES_LEFT_ERROR = 'No cases were left to run';

/**
 * The one-line task framing handed to the engine. It names no PR, author or
 * file: the batch must be reproducible from the case alone (AC-48 / AC-49).
 */
export const EVAL_TASK_LINE =
  'Review the diff below. Report only the distinct, high-value findings you can defend, each ' +
  'citing an exact file and line range that appears in the diff. Zero findings is a valid result.';

/** Strategy used when an agent row carries none. */
export const DEFAULT_STRATEGY = 'single-pass' as const;
