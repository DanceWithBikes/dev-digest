import { and, desc, eq, inArray, sum } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  DiffStats,
  ImportedPull,
  LatestReview,
  PullRecord,
  PullRepoRef,
  ReviewFinding,
  StoredCommit,
  StoredFile,
} from './domain.js';

/**
 * Pulls data-access. Owns `pull_requests`, `pr_files` and `pr_commits`, and
 * reads `repos`, `reviews`, `findings` and `agent_runs` for the list rollups.
 *
 * Every select names its columns: the domain types in `domain.ts` are the
 * module's contract, so a schema column added tomorrow does not silently widen
 * what leaves this file.
 */

/** Columns that make up a `PullRecord`, so both selects stay in sync. */
const PULL_COLUMNS = {
  id: t.pullRequests.id,
  repoId: t.pullRequests.repoId,
  number: t.pullRequests.number,
  title: t.pullRequests.title,
  author: t.pullRequests.author,
  branch: t.pullRequests.branch,
  base: t.pullRequests.base,
  headSha: t.pullRequests.headSha,
  additions: t.pullRequests.additions,
  deletions: t.pullRequests.deletions,
  filesCount: t.pullRequests.filesCount,
  status: t.pullRequests.status,
  lastReviewedSha: t.pullRequests.lastReviewedSha,
  openedAt: t.pullRequests.openedAt,
  updatedAt: t.pullRequests.updatedAt,
  body: t.pullRequests.body,
};

export class PullsRepository {
  constructor(private db: Db) {}

  /** The repo's GitHub coordinates, workspace-scoped (tenancy guard). */
  async getRepo(workspaceId: string, repoId: string): Promise<PullRepoRef | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /**
   * The repo owning a PR, without a workspace scope — the caller has already
   * resolved the PR inside its workspace, which is the tenancy check.
   */
  async getRepoById(repoId: string): Promise<PullRepoRef | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row;
  }

  async getPull(workspaceId: string, prId: string): Promise<PullRecord | undefined> {
    const [row] = await this.db
      .select(PULL_COLUMNS)
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async listByRepo(repoId: string): Promise<PullRecord[]> {
    return this.db.select(PULL_COLUMNS).from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  /**
   * Idempotent import (unique repo_id+number). Only the fields a re-sync can
   * change are overwritten — diff stats are backfilled separately and must
   * survive a list sync, whose GitHub payload reports them as zero.
   */
  async upsertPull(pull: ImportedPull): Promise<void> {
    await this.db
      .insert(t.pullRequests)
      .values(pull)
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: pull.title,
          headSha: pull.headSha,
          status: pull.status,
          updatedAt: pull.updatedAt,
        },
      });
  }

  async updateDiffStats(prId: string, stats: DiffStats): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, prId));
  }

  async updateDetail(prId: string, body: string | null, stats: DiffStats): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ body, ...stats })
      .where(eq(t.pullRequests.id, prId));
  }

  /**
   * Reviews of the given PRs, newest first — the caller takes the first row per
   * PR as that PR's latest. Only `kind: 'review'` counts; other run kinds do not
   * produce a score.
   */
  async reviewsNewestFirst(prIds: string[]): Promise<LatestReview[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ id: t.reviews.id, prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  /**
   * Findings of the given reviews. Dismissed ones are INCLUDED so the list's
   * counts match the per-run severity pills on the PR page, which render
   * dismissed cards too (dimmed).
   */
  async findingsForReviews(reviewIds: string[]): Promise<ReviewFinding[]> {
    if (reviewIds.length === 0) return [];
    return this.db
      .select({
        id: t.findings.id,
        reviewId: t.findings.reviewId,
        severity: t.findings.severity,
        category: t.findings.category,
        title: t.findings.title,
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        confidence: t.findings.confidence,
        rationale: t.findings.rationale,
      })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, reviewIds));
  }

  /**
   * TOTAL spend per PR: SUM over ALL of the PR's runs (every agent, every
   * re-run) — unlike the score, this is not "latest". Status is not filtered:
   * failed/cancelled/running rows persist cost_usd = null and SUM skips nulls,
   * as it does runs with unknown pricing. A PR is absent from the map only when
   * no run reported a cost.
   */
  async totalCostByPr(prIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (prIds.length === 0) return out;
    const rows = await this.db
      .select({ prId: t.agentRuns.prId, total: sum(t.agentRuns.costUsd) })
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.prId, prIds))
      .groupBy(t.agentRuns.prId);
    // Drizzle's sum() maps to string (numeric-safe) — convert back for the contract.
    for (const row of rows) {
      if (row.prId && row.total != null) out.set(row.prId, Number(row.total));
    }
    return out;
  }

  async listFiles(prId: string): Promise<StoredFile[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  async listCommits(prId: string): Promise<StoredCommit[]> {
    return this.db
      .select({
        sha: t.prCommits.sha,
        message: t.prCommits.message,
        author: t.prCommits.author,
        committedAt: t.prCommits.committedAt,
      })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId));
  }

  /** Delete-then-insert: GitHub's file list is authoritative, not additive. */
  async replaceFiles(prId: string, files: StoredFile[]): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (files.length > 0) {
      await this.db.insert(t.prFiles).values(files.map((f) => ({ prId, ...f })));
    }
  }

  /** Same reasoning as `replaceFiles` — a force-push rewrites the commit list. */
  async replaceCommits(prId: string, commits: StoredCommit[]): Promise<void> {
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (commits.length > 0) {
      await this.db.insert(t.prCommits).values(commits.map((c) => ({ prId, ...c })));
    }
  }
}
