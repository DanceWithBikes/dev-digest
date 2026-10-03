import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AttachmentCounts, ContextRepository, RepoCoords } from './ports.js';

/**
 * Project Context data-access. Owns the three context tables and reads agents,
 * skills and repos with its own queries (never through another module). Every
 * query is scoped by `workspaceId`.
 */
export class ProjectContextRepository implements ContextRepository {
  constructor(private db: Db) {}

  async getRepoRef(workspaceId: string, repoId: string): Promise<RepoCoords | undefined> {
    const [row] = await this.db
      .select({ owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async getRoots(workspaceId: string, repoId: string): Promise<string[] | null> {
    const [row] = await this.db
      .select({ roots: t.repoContextSettings.searchRoots })
      .from(t.repoContextSettings)
      .where(
        and(
          eq(t.repoContextSettings.workspaceId, workspaceId),
          eq(t.repoContextSettings.repoId, repoId),
        ),
      );
    return row ? row.roots : null;
  }

  async saveRoots(workspaceId: string, repoId: string, roots: string[]): Promise<void> {
    await this.db
      .insert(t.repoContextSettings)
      .values({ repoId, workspaceId, searchRoots: roots })
      .onConflictDoUpdate({
        target: t.repoContextSettings.repoId,
        set: { searchRoots: roots, updatedAt: new Date() },
      });
  }

  async attachmentCounts(workspaceId: string, repoId: string): Promise<AttachmentCounts> {
    const agentRows = await this.db
      .select({ path: t.agentContextAttachments.path, n: sql<number>`count(*)::int` })
      .from(t.agentContextAttachments)
      .where(
        and(
          eq(t.agentContextAttachments.workspaceId, workspaceId),
          eq(t.agentContextAttachments.repoId, repoId),
        ),
      )
      .groupBy(t.agentContextAttachments.path);
    const skillRows = await this.db
      .select({ path: t.skillContextAttachments.path, n: sql<number>`count(*)::int` })
      .from(t.skillContextAttachments)
      .where(
        and(
          eq(t.skillContextAttachments.workspaceId, workspaceId),
          eq(t.skillContextAttachments.repoId, repoId),
        ),
      )
      .groupBy(t.skillContextAttachments.path);
    return {
      agents: new Map(agentRows.map((r) => [r.path, r.n])),
      skills: new Map(skillRows.map((r) => [r.path, r.n])),
    };
  }

  async agentInWorkspace(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return !!row;
  }

  async skillInWorkspace(workspaceId: string, skillId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return !!row;
  }

  async getAgentPaths(workspaceId: string, repoId: string, agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextAttachments.path })
      .from(t.agentContextAttachments)
      .where(
        and(
          eq(t.agentContextAttachments.workspaceId, workspaceId),
          eq(t.agentContextAttachments.repoId, repoId),
          eq(t.agentContextAttachments.agentId, agentId),
        ),
      )
      .orderBy(t.agentContextAttachments.path);
    return rows.map((r) => r.path);
  }

  async getSkillPaths(workspaceId: string, repoId: string, skillId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextAttachments.path })
      .from(t.skillContextAttachments)
      .where(
        and(
          eq(t.skillContextAttachments.workspaceId, workspaceId),
          eq(t.skillContextAttachments.repoId, repoId),
          eq(t.skillContextAttachments.skillId, skillId),
        ),
      )
      .orderBy(t.skillContextAttachments.path);
    return rows.map((r) => r.path);
  }

  async replaceAgentPaths(
    workspaceId: string,
    repoId: string,
    agentId: string,
    paths: string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.agentContextAttachments)
        .where(
          and(
            eq(t.agentContextAttachments.workspaceId, workspaceId),
            eq(t.agentContextAttachments.repoId, repoId),
            eq(t.agentContextAttachments.agentId, agentId),
          ),
        );
      if (paths.length) {
        await tx
          .insert(t.agentContextAttachments)
          .values(paths.map((path) => ({ workspaceId, repoId, agentId, path })));
      }
    });
  }

  async replaceSkillPaths(
    workspaceId: string,
    repoId: string,
    skillId: string,
    paths: string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.skillContextAttachments)
        .where(
          and(
            eq(t.skillContextAttachments.workspaceId, workspaceId),
            eq(t.skillContextAttachments.repoId, repoId),
            eq(t.skillContextAttachments.skillId, skillId),
          ),
        );
      if (paths.length) {
        await tx
          .insert(t.skillContextAttachments)
          .values(paths.map((path) => ({ workspaceId, repoId, skillId, path })));
      }
    });
  }

  async enabledLinkedSkillPaths(
    workspaceId: string,
    repoId: string,
    agentId: string,
  ): Promise<string[]> {
    const linked = await this.db
      .select({ skillId: t.agentSkills.skillId })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.skills.enabled, true),
          eq(t.skills.workspaceId, workspaceId),
        ),
      );
    if (!linked.length) return [];
    const rows = await this.db
      .select({ path: t.skillContextAttachments.path })
      .from(t.skillContextAttachments)
      .where(
        and(
          eq(t.skillContextAttachments.workspaceId, workspaceId),
          eq(t.skillContextAttachments.repoId, repoId),
          inArray(
            t.skillContextAttachments.skillId,
            linked.map((l) => l.skillId),
          ),
        ),
      );
    return [...new Set(rows.map((r) => r.path))].sort();
  }
}
