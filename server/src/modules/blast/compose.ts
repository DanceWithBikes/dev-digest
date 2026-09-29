import type { Container } from '../../platform/container.js';
import { BlastRepository } from './repository.js';
import { BlastService } from './service.js';
import type { BlastLog } from './ports.js';

/**
 * Module composition root: the only file here that sees the container.
 * `container.repoIntel` satisfies `BlastRadiusReader` and `container.github()`
 * satisfies `PriorPrsGitHub` structurally — neither is imported by name, so
 * `blast/` never depends on `repo-intel/` or `src/adapters/` directly.
 */
export function makeBlastService(container: Container, log: BlastLog): BlastService {
  return new BlastService({
    pulls: new BlastRepository(container.db),
    intel: container.repoIntel,
    github: () => container.github(),
    log,
  });
}
