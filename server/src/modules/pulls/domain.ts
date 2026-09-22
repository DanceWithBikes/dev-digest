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
