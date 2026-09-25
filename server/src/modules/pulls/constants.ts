import type { SmartDiffRole } from '@devdigest/shared';

/** Constants for the pulls module. */

/**
 * Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs land
 * with zeroed size/diff. The list backfills them from the detail endpoint —
 * one fetch per PR, so it is capped per request; the periodic refetch chips
 * away at any remainder.
 */
export const DIFF_STAT_BACKFILL_LIMIT = 10;

/**
 * Smart Diff group reading order (Rule 1) — a reviewer starts at `core` and
 * can stop once the signal runs out. Must match `SmartDiffRole.options`
 * (`server/test/contracts.test.ts` pins that).
 */
export const ROLE_ORDER: SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

/** Total changed lines (additions + deletions) above which a PR is flagged for splitting. */
export const SMART_DIFF_LARGE_LINES = 500;

/**
 * Cap on how many `core`-group files one `POST /pulls/:id/smart-diff/summaries`
 * call will summarise (uncached files only) — an LLM call per file, so this
 * bounds both cost and latency. Precedent: `DIFF_STAT_BACKFILL_LIMIT` above.
 */
export const SMART_DIFF_SUMMARY_LIMIT = 10;

/** Chars-per-patch cap fed to the summary prompt — a huge generated file's diff
 *  shouldn't blow the call's token budget for a two-sentence summary. */
export const SUMMARY_MAX_PATCH_CHARS = 6_000;

/** Temperature for the summary call: this is description, not creative writing. */
export const SUMMARY_TEMPERATURE = 0.2;

/** Cap on the model's reply — a couple of sentences of pseudocode-level summary. */
export const SUMMARY_MAX_TOKENS = 300;

/**
 * GitHub answers a token that may READ a PR but not write to it with a bare
 * "Resource not accessible by personal access token" — which reads like a bug
 * in the studio rather than a one-click fix in the token settings. Posting an
 * inline comment needs `Pull requests: Read and write` on a fine-grained PAT
 * (classic PATs need the `repo` scope), so say that instead.
 */
export const COMMENT_FORBIDDEN_MESSAGE =
  'GitHub refused the comment: your token lacks write access to pull requests. ' +
  'Give the fine-grained token "Pull requests: Read and write" on this repository ' +
  '(classic token: the "repo" scope), then save it again in Settings.';
