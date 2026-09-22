import type { Container } from '../../platform/container.js';
import { SettingsRepository } from './repository.js';
import { SettingsService } from './service.js';

/** Module composition root: the only file here that sees both the container
 *  and the concrete repository. */
export function makeSettingsService(container: Container): SettingsService {
  return new SettingsService({ repo: new SettingsRepository(container.db) });
}
