import type { Container } from '../../platform/container.js';
import { CiIngest } from './ingest.js';
import { CiRepository } from './repository.js';
import { CiService } from './service.js';
import type { AgentSource, CiLog, GitHubFactory } from './ports.js';

/**
 * Module composition root: the only file here that sees the container. It
 * adapts `container.agentsRepo` structurally to the module's narrow port and
 * hands the GitHub client over lazily (it throws when no token is configured).
 */

// Compile-time port-shape assertion.
type Assert<T extends true> = T;
export type AgentSourceMatches = Assert<Container['agentsRepo'] extends AgentSource ? true : false>;

export function makeCiService(container: Container, log: CiLog): CiService {
  if (container.config.ciGithubMock) {
    log.warn({}, 'ci: DEVDIGEST_CI_GITHUB_MOCK is on; exports and ingest use the in-memory GitHub mock, nothing reaches GitHub');
  }
  const store = new CiRepository(container.db);
  const github: GitHubFactory = () => container.ciGithub();
  const ingest = new CiIngest({ store, github, log });
  return new CiService({
    store,
    agents: container.agentsRepo,
    github,
    bundle: container.runnerBundle,
    ingest,
    log,
  });
}
