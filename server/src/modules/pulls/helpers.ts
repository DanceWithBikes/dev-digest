import type { PrCommit, PrDetail, PrFile, PrMeta } from '@devdigest/shared';
import type {
  LatestReview,
  PullRecord,
  ReviewFinding,
  StoredCommit,
  StoredFile,
} from './domain.js';
import { deriveReviewStatus, rollupSeverities, toFindingPreviews } from './status.js';

/** Pure domain → DTO mapping for the pulls endpoints. No DB, no HTTP. */

/** What the list knows about a PR beyond the PR row itself. */
export interface PrRollup {
  /** The PR's latest `kind: 'review'` run, or undefined when never reviewed. */
  review: LatestReview | undefined;
  /** That review's findings; empty when there is no review. */
  findings: ReviewFinding[];
  /** Total spend across all the PR's runs; null when no run reported one. */
  costUsd: number | null;
  /** Evaluation instant for the staleness check — passed in so a list is consistent. */
  now: number;
}

export function toPrMetaDto(pr: PullRecord, rollup: PrRollup): PrMeta {
  const { review, findings, costUsd, now } = rollup;
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: deriveReviewStatus({
      ghStatus: pr.status,
      lastReviewedSha: pr.lastReviewedSha,
      headSha: pr.headSha,
      updatedAt: pr.updatedAt,
      now,
    }),
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    score: review ? review.score : null,
    cost_usd: costUsd,
    severity_counts: review ? rollupSeverities(findings) : null,
    finding_previews: review ? toFindingPreviews(findings) : null,
  };
}

export function toPrFileDto(file: StoredFile): PrFile {
  return {
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch,
  };
}

export function toPrCommitDto(commit: StoredCommit): PrCommit {
  return {
    sha: commit.sha,
    message: commit.message,
    author: commit.author,
    committed_at: commit.committedAt?.toISOString() ?? null,
  };
}

/**
 * The offline view of a PR: everything a previous import (or the seed) left
 * behind. `status` passes through as GitHub's merge state — the detail page
 * shows the PR itself, not review freshness.
 */
export function toPersistedPrDetail(
  pr: PullRecord,
  files: StoredFile[],
  commits: StoredCommit[],
): PrDetail {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: pr.status as PrDetail['status'],
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    body: pr.body ?? null,
    files: files.map(toPrFileDto),
    commits: commits.map(toPrCommitDto),
  };
}

/**
 * The newest review per PR. `rows` must be ordered newest-first, which is what
 * the repository guarantees — so the first row seen for a PR is its latest.
 */
export function pickLatestReviews(rows: LatestReview[]): Map<string, LatestReview> {
  const out = new Map<string, LatestReview>();
  for (const rv of rows) if (!out.has(rv.prId)) out.set(rv.prId, rv);
  return out;
}

/** Findings bucketed by the review they belong to. */
export function groupFindingsByReview(rows: ReviewFinding[]): Map<string, ReviewFinding[]> {
  const out = new Map<string, ReviewFinding[]>();
  for (const f of rows) {
    const bucket = out.get(f.reviewId);
    if (bucket) bucket.push(f);
    else out.set(f.reviewId, [f]);
  }
  return out;
}
