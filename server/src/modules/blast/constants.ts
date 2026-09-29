/** Prior PRs: how many of the PR's changed files get chased for history. */
export const PRIOR_PRS_MAX_FILES = 10;
/** Prior PRs: how many recent commits per file are pulled from GitHub. */
export const PRIOR_PRS_COMMITS_PER_FILE = 5;
/** Prior PRs: cap on the returned, deduped, merged-only PR list. */
export const PRIOR_PRS_LIMIT = 10;

/** Log line proving the hot path reads the precomputed index, never re-parses. */
export const BLAST_READ_LOG = 'blast: reading precomputed repo-intel index';
