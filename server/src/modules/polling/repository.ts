import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PollableRepo, SyncedPull } from './domain.js';

/**
 * Polling data-access. Reads `repos` and upserts `pull_requests` — the same
 * idempotent write the pulls module uses, keyed on (repo_id, number).
 */
export class PollingRepository {
  constructor(private db: Db) {}

  /** The repo's GitHub coordinates, workspace-scoped (tenancy guard). */
  async getRepo(workspaceId: string, repoId: string): Promise<PollableRepo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /**
   * Insert the PR, or refresh the fields a sync can change. Title/head/status/
   * updatedAt only: the diff stats are backfilled by the pulls module from the
   * detail endpoint, and overwriting them here with the list payload's zeros
   * would undo that.
   */
  async upsertPull(pull: SyncedPull): Promise<void> {
    await this.db
      .insert(t.pullRequests)
      .values(pull)
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: pull.title,
          headSha: pull.headSha,
          status: pull.status,
          updatedAt: pull.updatedAt,
        },
      });
  }

  async markPolled(repoId: string, at: Date): Promise<void> {
    await this.db.update(t.repos).set({ lastPolledAt: at }).where(eq(t.repos.id, repoId));
  }
}
