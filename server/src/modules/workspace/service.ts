import type { WorkspaceOverview } from './domain.js';
import type { WorkspaceRepository } from './repository.js';
import { toClonedRepoDto } from './helpers.js';

/**
 * Workspace use cases. Cleanup and re-pull of individual repos belong to the
 * repos module — this one only reports what the workspace currently holds.
 */

export interface WorkspaceDeps {
  repo: WorkspaceRepository;
  /** Root the clone jobs write into; a value, not a config object. */
  cloneDir: string;
}

export class WorkspaceService {
  constructor(private deps: WorkspaceDeps) {}

  async overview(workspaceId: string): Promise<WorkspaceOverview> {
    const repos = await this.deps.repo.listRepos(workspaceId);
    return {
      workspaceId,
      cloneDir: this.deps.cloneDir,
      repos: repos.map(toClonedRepoDto),
    };
  }
}
