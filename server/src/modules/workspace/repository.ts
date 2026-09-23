import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ClonedRepo } from './domain.js';

/**
 * Workspace data-access. Reads the `repos` table for the overview only — the
 * repos module owns writes to it; this one never mutates.
 */
export class WorkspaceRepository {
  constructor(private db: Db) {}

  /** Every repo in the workspace, narrowed to what the overview renders. */
  async listRepos(workspaceId: string): Promise<ClonedRepo[]> {
    return this.db
      .select({
        id: t.repos.id,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
        lastPolledAt: t.repos.lastPolledAt,
      })
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
  }
}
