import type { Container } from '../../platform/container.js';
import { ProjectContextRepository } from './repository.js';
import { ProjectContextService } from './service.js';

/** Composition root of the module: the only file seeing both the Container and the repository. */
export function makeProjectContextService(container: Container): ProjectContextService {
  return new ProjectContextService({
    repo: new ProjectContextRepository(container.db),
    files: container.git,
    now: () => new Date(),
  });
}
