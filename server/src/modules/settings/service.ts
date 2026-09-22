import type { Settings, SettingsUpdate } from '@devdigest/shared';
import type { SettingsRepository } from './repository.js';
import { rowsToSettings } from './helpers.js';

/**
 * Settings use cases — read and update the workspace's non-secret prefs.
 *
 * Secrets (provider keys) are deliberately NOT part of this service: they live
 * in `SecretsProvider`, never in the `settings` table, so the only thing that
 * crosses this boundary is a plain key/value map.
 */

export interface SettingsDeps {
  repo: SettingsRepository;
}

export class SettingsService {
  constructor(private deps: SettingsDeps) {}

  /** The workspace's current prefs, collapsed into a flat object. */
  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.deps.repo.list(workspaceId));
  }

  /**
   * Upsert every key in the patch, then return the full settings object —
   * the UI re-renders from the response rather than merging locally.
   */
  async update(workspaceId: string, userId: string, patch: SettingsUpdate): Promise<Settings> {
    for (const [key, value] of Object.entries(patch)) {
      await this.deps.repo.upsert(workspaceId, userId, key, value);
    }
    return this.get(workspaceId);
  }
}
