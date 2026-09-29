import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullContext } from './ports.js';

/**
 * Blast data-access — read-only. Reads `pull_requests` joined to `repos`
 * (workspace-scoped tenancy guard, pattern: `pulls/repository.ts:99-105`),
 * plus the PR's `pr_files.path` rows for `changedFiles`.
 */
export class BlastRepository {
  constructor(private db: Db) {}

  async getPullContext(workspaceId: string, prId: string): Promise<PullContext | null> {
    const [row] = await this.db
      .select({
        repoId: t.pullRequests.repoId,
        number: t.pullRequests.number,
        headSha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return null;

    const files = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));

    return { ...row, changedFiles: files.map((f) => f.path) };
  }
}
