import type { Container } from '../../platform/container.js';
import { SkillsRepository } from './repository.js';
import { SkillsService } from './service.js';

/**
 * Module composition root: the one place that knows both the container and the
 * concrete repository, so `routes.ts` stays transport-only and `SkillsService`
 * can be unit-tested with a fake repository.
 */
export function makeSkillsService(container: Container): SkillsService {
  return new SkillsService(new SkillsRepository(container.db));
}
