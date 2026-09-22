import type { Container } from '../../platform/container.js';
import type { WarnLogger } from './ports.js';
import { PullsRepository } from './repository.js';
import { PullsService } from './service.js';

/** Module composition root: the only file here that sees the container. */
export function makePullsService(container: Container, log: WarnLogger): PullsService {
  return new PullsService({
    repo: new PullsRepository(container.db),
    github: () => container.github(),
    log,
  });
}
