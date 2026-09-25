/**
 * Pulls domain types.
 *
 * These are the shapes the use case and the repository agree on — plain TS, not
 * `$inferSelect` rows. `status` stays a `string` here because the DB column
 * holds GitHub's merge state; the reviewer-facing `PrStatus` is derived in
 * `status.ts` and only exists on the DTO.
 */

/** Enough of a repo to call GitHub and scope a query. */
export interface PullRepoRef {
  id: string;
  owner: string;
  name: string;
}

/** A persisted pull request, with everything the list and detail views read. */
export interface PullRecord {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
  /** GitHub merge state: open / merged / closed. */
  status: string;
  /** Head the last review ran against; null until reviewed. */
  lastReviewedSha: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
  body: string | null;
}

/** A PR as an import writes it. `openedAt` is only known on a full sync. */
export interface ImportedPull {
  workspaceId: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  openedAt: Date | null;
  updatedAt: Date | null;
}

/** Diff counters backfilled from the detail endpoint. */
export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

/** The newest `kind: 'review'` run for one PR. */
export interface LatestReview {
  id: string;
  prId: string;
  score: number | null;
}

/**
 * A finding of such a review. Structurally satisfies the pure rollup helpers in
 * `status.ts`, which is why neither side needs a Drizzle row type.
 */
export interface ReviewFinding {
  id: string;
  reviewId: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  rationale: string;
}

/** A stored diff file (the persisted mirror served when GitHub is unreachable). */
export interface StoredFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/** A stored commit of the PR branch. */
export interface StoredCommit {
  sha: string;
  message: string;
  author: string;
  committedAt: Date | null;
}

/**
 * Where one finding anchors in the diff, for the Smart Diff tab's per-line dot.
 * Drawn from ALL of the PR's `kind: 'review'` runs (accepted and dismissed
 * included) — the client's finding cards come from the same unfiltered set
 * (`usePrReviews`), so a dot from only the latest run would disagree with them.
 */
export interface FindingAnchor {
  file: string;
  startLine: number;
}

/**
 * A file's cached pseudocode summary (Smart Diff, `core` group only), keyed to
 * the SHA-1 of the patch it describes. `buildSmartDiff` serves `summary` only
 * while `patchSha` still matches the file's CURRENT patch — a stale row is
 * left in place (not deleted) so a future re-generation can overwrite it, but
 * a read never surfaces it as if it still described the diff.
 */
export interface FileSummaryRecord {
  path: string;
  patchSha: string;
  summary: string;
}

/** What persisting a freshly generated summary needs, beyond `(prId, path)`. */
export interface FileSummaryWrite {
  patchSha: string;
  summary: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}
