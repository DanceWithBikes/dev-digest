import type {
  GitHubClient,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
  SmartDiff,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { FileSummaryRecord, PullRecord, PullRepoRef } from './domain.js';
import type { PullsRepository } from './repository.js';
import type { SummaryGenerator, WarnLogger } from './ports.js';
import {
  buildSmartDiff,
  classifyFile,
  groupFindingsByReview,
  patchSha,
  pickLatestReviews,
  toPersistedPrDetail,
  toPrMetaDto,
} from './helpers.js';
import {
  COMMENT_FORBIDDEN_MESSAGE,
  DIFF_STAT_BACKFILL_LIMIT,
  SMART_DIFF_SUMMARY_LIMIT,
} from './constants.js';

/**
 * Pulls use cases — import PRs from GitHub and serve them.
 *
 * Every read is LOCAL-FIRST: a sync is attempted when a token is configured,
 * but a GitHub failure never fails the request. Already-imported or seeded PRs
 * stay viewable offline, which is what makes the studio usable without a token.
 * Writes (posting a comment) have no such fallback and do fail loudly.
 */

export interface PullsDeps {
  repo: PullsRepository;
  /** Rejects when no token is configured — callers decide whether that is fatal. */
  github: () => Promise<GitHubClient>;
  log: WarnLogger;
  /** The one step that calls a model, for `generateSummaries` (step 8). */
  summaryGenerator: SummaryGenerator;
}

export class PullsService {
  constructor(private deps: PullsDeps) {}

  /** PRs of one repo, with the latest review's score, findings and total cost. */
  async list(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const { repo } = this.deps;
    const repoRef = await repo.getRepo(workspaceId, repoId);
    if (!repoRef) throw new NotFoundError('Repo not found');

    const gh = await this.githubOrNull('GitHub client unavailable (no token / offline); serving persisted PRs');
    if (gh) await this.syncList(workspaceId, repoRef, gh);

    const rows = await repo.listByRepo(repoRef.id);
    if (gh) await this.backfillDiffStats(repoRef, rows, gh);

    const prIds = rows.map((r) => r.id);
    const latestReviewByPr = pickLatestReviews(await repo.reviewsNewestFirst(prIds));
    const latestReviewIds = [...latestReviewByPr.values()].map((rv) => rv.id);
    const findingsByReview = groupFindingsByReview(await repo.findingsForReviews(latestReviewIds));
    const totalCostByPr = await repo.totalCostByPr(prIds);

    const now = Date.now();
    return rows.map((pr) => {
      const review = latestReviewByPr.get(pr.id);
      return toPrMetaDto(pr, {
        review,
        findings: review ? (findingsByReview.get(review.id) ?? []) : [],
        costUsd: totalCostByPr.get(pr.id) ?? null,
        now,
      });
    });
  }

  /** Full PR detail: refreshed from GitHub when possible, else served persisted. */
  async detail(workspaceId: string, prId: string): Promise<PrDetail> {
    const { repo } = this.deps;
    const pr = await repo.getPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repoRef = await repo.getRepoById(pr.repoId);
    if (!repoRef) throw new NotFoundError('Repo not found');

    try {
      const gh = await this.deps.github();
      const detail = await gh.getPullRequest({ owner: repoRef.owner, name: repoRef.name }, pr.number);

      await repo.replaceFiles(
        pr.id,
        detail.files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
      );
      await repo.replaceCommits(
        pr.id,
        detail.commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committedAt: c.committed_at ? new Date(c.committed_at) : null,
        })),
      );
      // Diff stats aren't on GitHub's PR-list payload — backfill them from this
      // detail fetch so the Pull Requests list shows real size/files.
      await repo.updateDetail(pr.id, detail.body ?? null, {
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });

      return { ...detail, id: pr.id };
    } catch (err) {
      this.deps.log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const [files, commits] = await Promise.all([repo.listFiles(pr.id), repo.listCommits(pr.id)]);
      return toPersistedPrDetail(pr, files, commits);
    }
  }

  /**
   * Smart Diff for the Files-changed tab: files grouped by role (Rule 1) with
   * finding-line anchors (Rule 2) and any still-valid cached summaries (step
   * 8). No GitHub call and no model call — pulls reads are local-first and
   * never fail the request (`pulls/AGENTS.md`); reading `pr_file_summary` is a
   * plain join, not generation, so the GET stays exactly as fast.
   */
  async smartDiff(workspaceId: string, prId: string): Promise<SmartDiff> {
    const { repo } = this.deps;
    const pr = await repo.getPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const [files, anchors, summaries] = await Promise.all([
      repo.listFiles(pr.id),
      repo.findingAnchorsForPull(pr.id),
      repo.getFileSummaries(pr.id),
    ]);
    return buildSmartDiff(files, anchors, summaryMap(summaries));
  }

  /**
   * Generates the `pseudocode_summary` for up to `SMART_DIFF_SUMMARY_LIMIT`
   * `core`-group files that have no valid cache entry yet (the user's cost
   * decision: only `core`, only on demand, only uncached, capped). Returns the
   * refreshed Smart Diff so the caller can render immediately without a
   * second round trip. A single file's generation failure is logged and
   * skipped — it never fails the other files in the same batch.
   */
  async generateSummaries(workspaceId: string, prId: string): Promise<SmartDiff> {
    const { repo, summaryGenerator, log } = this.deps;
    const pr = await repo.getPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');

    const [files, existing] = await Promise.all([repo.listFiles(pr.id), repo.getFileSummaries(pr.id)]);
    const existingByPath = summaryMap(existing);
    const targets = files
      .filter((f) => classifyFile(f.path) === 'core')
      .filter((f) => {
        const cached = existingByPath.get(f.path);
        return !cached || cached.patchSha !== patchSha(f.patch);
      })
      .slice(0, SMART_DIFF_SUMMARY_LIMIT);

    for (const file of targets) {
      try {
        const result = await summaryGenerator.summarize(workspaceId, { path: file.path, patch: file.patch });
        await repo.upsertFileSummary(pr.id, file.path, {
          patchSha: patchSha(file.patch),
          summary: result.summary,
          provider: result.provider,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
        });
      } catch (err) {
        log.warn({ err, path: file.path }, 'Smart Diff summary generation failed');
      }
    }

    const [anchors, summaries] = await Promise.all([
      repo.findingAnchorsForPull(pr.id),
      repo.getFileSummaries(pr.id),
    ]);
    return buildSmartDiff(files, anchors, summaryMap(summaries));
  }

  /**
   * Inline review comments are proxied live to GitHub with NO local mirror:
   * the Files-changed tab must stay in lock-step with the PR, and a stale local
   * copy is worse than an empty list.
   */
  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const { pr, repoRef } = await this.resolvePrAndRepo(workspaceId, prId);
    const gh = await this.githubOrNull('GitHub client unavailable; serving no PR comments');
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repoRef.owner, name: repoRef.name }, pr.number);
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repoRef } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repoRef.owner, name: repoRef.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // 401/403 is the token's permissions, not the request — its raw GitHub
      // message is unactionable, so swap in the one that names the fix.
      const status = (err as { status?: number } | null)?.status;
      if (status === 401 || status === 403) {
        throw new AppError('github_forbidden', COMMENT_FORBIDDEN_MESSAGE, 403, {
          cause: String(err),
        });
      }
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }

  /** The PR (workspace-scoped) plus the repo it belongs to, or a 404. */
  private async resolvePrAndRepo(
    workspaceId: string,
    prId: string,
  ): Promise<{ pr: PullRecord; repoRef: PullRepoRef }> {
    const pr = await this.deps.repo.getPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repoRef = await this.deps.repo.getRepoById(pr.repoId);
    if (!repoRef) throw new NotFoundError('Repo not found');
    return { pr, repoRef };
  }

  /** A client, or null after logging `msg` — the local-first degrade path. */
  private async githubOrNull(msg: string): Promise<GitHubClient | null> {
    try {
      return await this.deps.github();
    } catch (err) {
      this.deps.log.warn({ err }, msg);
      return null;
    }
  }

  /** Import the repo's current PR list. A failure here is logged, never thrown. */
  private async syncList(
    workspaceId: string,
    repoRef: PullRepoRef,
    gh: GitHubClient,
  ): Promise<void> {
    try {
      const pulls = await gh.listPullRequests({ owner: repoRef.owner, name: repoRef.name });
      for (const pr of pulls) {
        await this.deps.repo.upsertPull({
          workspaceId,
          repoId: repoRef.id,
          number: pr.number,
          title: pr.title,
          author: pr.author,
          branch: pr.branch,
          base: pr.base,
          headSha: pr.head_sha,
          additions: pr.additions,
          deletions: pr.deletions,
          filesCount: pr.files_count,
          status: pr.status,
          openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        });
      }
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
    }
  }

  /**
   * Fill in size/diff for PRs that landed with zeroed counters, capped per
   * request. Mutates `rows` in place so the response reflects the backfill
   * without a second read.
   */
  private async backfillDiffStats(
    repoRef: PullRepoRef,
    rows: PullRecord[],
    gh: GitHubClient,
  ): Promise<void> {
    const needStats = rows
      .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
      .slice(0, DIFF_STAT_BACKFILL_LIMIT);
    for (const r of needStats) {
      try {
        const detail = await gh.getPullRequest({ owner: repoRef.owner, name: repoRef.name }, r.number);
        const stats = {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        };
        await this.deps.repo.updateDiffStats(r.id, stats);
        Object.assign(r, stats);
      } catch (err) {
        this.deps.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
  }
}

/** `FileSummaryRecord[]` → keyed by path, what `buildSmartDiff`'s third argument expects. */
function summaryMap(rows: FileSummaryRecord[]): Map<string, FileSummaryRecord> {
  return new Map(rows.map((r) => [r.path, r]));
}
