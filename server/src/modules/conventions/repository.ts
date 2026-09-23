import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionCategory, ConventionDraft, ConventionStatus } from '@devdigest/shared';

/**
 * Conventions data-access. Owns the `conventions` table. Workspace-scoped
 * throughout; `repoId` narrows a scan to one repository.
 */

import type { ConventionRow } from '../../db/rows.js';
export type { ConventionRow };

export interface UpdateCandidate {
  rule?: string;
  category?: ConventionCategory;
  status?: ConventionStatus;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /**
   * The repo's GitHub coordinates, workspace-scoped. The sampler needs them to
   * read files through the git port; looking them up here keeps `compose.ts`
   * free of SQL, which the import gate enforces anyway.
   */
  async getRepoRef(
    workspaceId: string,
    repoId: string,
  ): Promise<{ owner: string; name: string } | undefined> {
    const [row] = await this.db
      .select({ owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Every candidate for a repo, newest first, whatever its status. */
  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.createdAt));
  }

  /** Accepted candidates only — the input to the assembled skill. */
  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      )
      .orderBy(desc(t.conventions.confidence));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /** Insert one scan's surviving drafts as `pending` candidates. */
  async insertMany(
    workspaceId: string,
    repoId: string,
    drafts: ConventionDraft[],
  ): Promise<ConventionRow[]> {
    if (drafts.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(
        drafts.map((d) => ({
          workspaceId,
          repoId,
          category: d.category,
          rule: d.rule,
          evidencePath: d.evidence_path,
          evidenceLine: d.evidence_line,
          evidenceSnippet: d.evidence_snippet,
          confidence: d.confidence,
          status: 'pending' as const,
        })),
      )
      .returning();
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateCandidate,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }
}
