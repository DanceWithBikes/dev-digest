import type { GitHubClient } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { PollResult } from './domain.js';
import type { PollingRepository } from './repository.js';

/**
 * Polling use case — sync a repo's PR list from GitHub.
 *
 * It deliberately does NOT trigger a review: reviews are manual (the user
 * presses Run Review, owned by the reviews module), so the only side effects
 * here are the PR upserts and `last_polled_at`.
 */

export interface PollingDeps {
  repo: PollingRepository;
  /** Lazily resolved so a missing token fails the request, not app boot. */
  github: () => Promise<GitHubClient>;
}

export class PollingService {
  constructor(private deps: PollingDeps) {}

  async poll(workspaceId: string, repoId: string): Promise<PollResult> {
    const repo = await this.deps.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.deps.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    let synced = 0;
    for (const pr of pulls) {
      await this.deps.repo.upsertPull({
        workspaceId,
        repoId: repo.id,
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
        updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
      });
      synced++;
    }
    await this.deps.repo.markPolled(repo.id, new Date());

    return { synced, reviewTriggered: false };
  }
}
