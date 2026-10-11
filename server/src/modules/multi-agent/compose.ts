import type { Container } from '../../platform/container.js';
import { MultiAgentRepository } from './repository.js';
import { MultiAgentService } from './service.js';

/** Module composition root: the only file here that sees the container. */
export function makeMultiAgentService(container: Container): MultiAgentService {
  return new MultiAgentService({ store: new MultiAgentRepository(container.db) });
}
