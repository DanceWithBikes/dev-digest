/** Constants for the pulls module. */

/**
 * Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs land
 * with zeroed size/diff. The list backfills them from the detail endpoint —
 * one fetch per PR, so it is capped per request; the periodic refetch chips
 * away at any remainder.
 */
export const DIFF_STAT_BACKFILL_LIMIT = 10;
