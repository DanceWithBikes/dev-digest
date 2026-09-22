import type { Container } from '../../platform/container.js';
import { PollingRepository } from './repository.js';
import { PollingService } from './service.js';

/** Module composition root: the only file here that sees the container. */
export function makePollingService(container: Container): PollingService {
  return new PollingService({
    repo: new PollingRepository(container.db),
    github: () => container.github(),
  });
}
