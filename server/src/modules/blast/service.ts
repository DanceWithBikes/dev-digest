import type { BlastRadius, PrHistory } from '@devdigest/shared';
import { ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { BLAST_READ_LOG, PRIOR_PRS_COMMITS_PER_FILE, PRIOR_PRS_MAX_FILES } from './constants.js';
import { aggregatePriorPrs, refineDegradation, toBlastRadius, type PriorPrCandidate } from './helpers.js';
import type { BlastLog, BlastPullSource, BlastRadiusReader, PriorPrsGitHub, PullContext } from './ports.js';

export interface BlastServiceDeps {
  pulls: BlastPullSource;
  intel: BlastRadiusReader;
  /** Rejects (`ConfigError`) when no GitHub token is configured — let it propagate. */
  github: () => Promise<PriorPrsGitHub>;
  log: BlastLog;
}

/**
 * Blast Radius use cases. Both reads are LOCAL-FIRST for the PR/repo lookup
 * (workspace-scoped, 404s rather than syncing) — `forPull` never calls
 * GitHub at all; only `priorPrs` does.
 */
export class BlastService {
  constructor(private deps: BlastServiceDeps) {}

  /**
   * The Blast Radius map for a PR: read the precomputed repo-intel index
   * ONCE, fold in the honest index-state degradation, and map the flat
   * facade result into the grouped `BlastRadius` contract.
   */
  async forPull(workspaceId: string, prId: string): Promise<BlastRadius> {
    const ctx = await this.resolveContext(workspaceId, prId);
    this.deps.log.info({ repoId: ctx.repoId, files: ctx.changedFiles.length }, BLAST_READ_LOG);

    const [result, state] = await Promise.all([
      this.deps.intel.getBlastRadius(ctx.repoId, ctx.changedFiles),
      this.deps.intel.getIndexState(ctx.repoId),
    ]);

    return toBlastRadius(refineDegradation(result, state));
  }

  /**
   * Merged PRs that previously touched this PR's changed files. Chases each
   * of the first `PRIOR_PRS_MAX_FILES` files' recent commit history on
   * GitHub, dedupes the commit shas across files before asking for their
   * associated PRs (one Octokit call per unique sha, not per file), then
   * aggregates. A GitHub failure never returns a partial/misleading result —
   * it fails loudly so the UI shows an inline error instead of a truncated list.
   */
  async priorPrs(workspaceId: string, prId: string): Promise<PrHistory> {
    const ctx = await this.resolveContext(workspaceId, prId);
    const github = await this.deps.github();
    const repo = { owner: ctx.owner, name: ctx.name };
    const files = ctx.changedFiles.slice(0, PRIOR_PRS_MAX_FILES);

    try {
      const shasByFile = new Map<string, string[]>();
      for (const file of files) {
        const commits = await github.listCommitsForPath(repo, file, PRIOR_PRS_COMMITS_PER_FILE);
        shasByFile.set(file, commits.map((c) => c.sha));
      }

      const uniqueShas = [...new Set([...shasByFile.values()].flat())];
      const pullsBySha = new Map<string, Awaited<ReturnType<PriorPrsGitHub['listPullsForCommit']>>>();
      for (const sha of uniqueShas) {
        pullsBySha.set(sha, await github.listPullsForCommit(repo, sha));
      }

      const candidates: PriorPrCandidate[] = files.flatMap((file) =>
        (shasByFile.get(file) ?? []).flatMap((sha) =>
          (pullsBySha.get(sha) ?? []).map((pr) => ({ file, pr })),
        ),
      );
      return aggregatePriorPrs(candidates, ctx.number);
    } catch (err) {
      this.deps.log.warn({ err, repoId: ctx.repoId }, 'blast: prior-PRs lookup failed');
      // Full error detail (which may include request/response internals) stays
      // in the log only — `details` is sent to the client, so it gets at most
      // a numeric status, never `String(err)`.
      const status = typeof err === 'object' && err !== null && 'status' in err ? (err as { status: unknown }).status : undefined;
      throw new ExternalServiceError(
        'Failed to fetch prior PRs from GitHub.',
        typeof status === 'number' ? { status } : undefined,
      );
    }
  }

  private async resolveContext(workspaceId: string, prId: string): Promise<PullContext> {
    const ctx = await this.deps.pulls.getPullContext(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');
    return ctx;
  }
}
