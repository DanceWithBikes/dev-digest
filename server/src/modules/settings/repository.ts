import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SettingsRow } from './helpers.js';

/**
 * Settings data-access. Owns the `settings` table — key/value rows of
 * NON-secret prefs, one set per (workspace, user, key). API keys never land
 * here; they go to `SecretsProvider`.
 */
export class SettingsRepository {
  constructor(private db: Db) {}

  /** Every pref row for a workspace, as the flat key/value pairs helpers expect. */
  async list(workspaceId: string): Promise<SettingsRow[]> {
    return this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
  }

  /** Insert or overwrite one pref. The unique key is (workspace, user, key). */
  async upsert(workspaceId: string, userId: string, key: string, value: unknown): Promise<void> {
    await this.db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoUpdate({
        target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
        set: { value },
      });
  }
}
