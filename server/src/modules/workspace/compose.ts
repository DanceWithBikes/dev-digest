import type { Container } from '../../platform/container.js';
import { WorkspaceRepository } from './repository.js';
import { WorkspaceService } from './service.js';

/** Module composition root: the only file here that sees the container. */
export function makeWorkspaceService(container: Container): WorkspaceService {
  return new WorkspaceService({
    repo: new WorkspaceRepository(container.db),
    cloneDir: container.config.cloneDir,
  });
}
