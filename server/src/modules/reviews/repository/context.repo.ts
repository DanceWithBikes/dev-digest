import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

/**
 * Project Context attachments for one run: the agent's own paths and, per
 * linked skill, the skill's paths — all for ONE repo (the PR's). Reviews reads
 * these tables through its own repository; `project-context` owns the writes
 * and `no-cross-module-imports` forbids importing it. Ordered by path so the
 * prompt is deterministic.
 */
export async function contextAttachmentsFor(
  db: Db,
  workspaceId: string,
  agentId: string,
  skillIds: string[],
  repoId: string,
): Promise<{ agentPaths: string[]; skillPaths: Map<string, string[]> }> {
  const agentRows = await db
    .select({ path: t.agentContextAttachments.path })
    .from(t.agentContextAttachments)
    .where(
      and(
        eq(t.agentContextAttachments.workspaceId, workspaceId),
        eq(t.agentContextAttachments.agentId, agentId),
        eq(t.agentContextAttachments.repoId, repoId),
      ),
    )
    .orderBy(asc(t.agentContextAttachments.path));

  const skillPaths = new Map<string, string[]>();
  if (skillIds.length > 0) {
    const skillRows = await db
      .select({ skillId: t.skillContextAttachments.skillId, path: t.skillContextAttachments.path })
      .from(t.skillContextAttachments)
      .where(
        and(
          eq(t.skillContextAttachments.workspaceId, workspaceId),
          inArray(t.skillContextAttachments.skillId, skillIds),
          eq(t.skillContextAttachments.repoId, repoId),
        ),
      )
      .orderBy(asc(t.skillContextAttachments.path));
    for (const r of skillRows) {
      const list = skillPaths.get(r.skillId) ?? [];
      list.push(r.path);
      skillPaths.set(r.skillId, list);
    }
  }
  return { agentPaths: agentRows.map((r) => r.path), skillPaths };
}
