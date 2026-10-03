import { and, asc, eq, inArray } from 'drizzle-orm';
import { PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AttachmentOwner, PullForBrief, StoredIntent } from './domain.js';
import type { BriefStore, StoredBrief } from './ports.js';

/**
 * Brief data-access. Cross-module DATA (PR, files, intent, attachments) is read
 * here, in this module's own repository; `pr_brief` has no workspace column, so
 * every brief read/write follows a workspace-scoped `getPull`.
 */
export class BriefRepository implements BriefStore {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<PullForBrief | null> {
    const [row] = await this.db
      .select({
        prId: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return null;

    // Same read, same (absent) ORDER BY as the Files changed tab.
    const files = await this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));

    return { ...row, body: row.body ?? '', files };
  }

  async getIntent(prId: string): Promise<StoredIntent | null> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    if (!row) return null;
    return {
      intent: row.intent,
      in_scope: row.inScope,
      out_of_scope: row.outOfScope,
      headSha: row.headSha,
    };
  }

  async listAttachmentOwners(workspaceId: string, repoId: string): Promise<AttachmentOwner[]> {
    const agents = await this.db
      .select({ id: t.agents.id, name: t.agents.name, createdAt: t.agents.createdAt })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
    if (agents.length === 0) return [];
    const agentIds = agents.map((a) => a.id);

    const agentRows = await this.db
      .select({ agentId: t.agentContextAttachments.agentId, path: t.agentContextAttachments.path })
      .from(t.agentContextAttachments)
      .where(
        and(
          eq(t.agentContextAttachments.workspaceId, workspaceId),
          eq(t.agentContextAttachments.repoId, repoId),
          inArray(t.agentContextAttachments.agentId, agentIds),
        ),
      )
      .orderBy(asc(t.agentContextAttachments.path));

    const links = await this.db
      .select({
        agentId: t.agentSkills.agentId,
        skillId: t.agentSkills.skillId,
        order: t.agentSkills.order,
        name: t.skills.name,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(
        and(
          inArray(t.agentSkills.agentId, agentIds),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skills.enabled, true),
        ),
      );

    const skillIds = [...new Set(links.map((l) => l.skillId))];
    const skillRows =
      skillIds.length === 0
        ? []
        : await this.db
            .select({ skillId: t.skillContextAttachments.skillId, path: t.skillContextAttachments.path })
            .from(t.skillContextAttachments)
            .where(
              and(
                eq(t.skillContextAttachments.workspaceId, workspaceId),
                eq(t.skillContextAttachments.repoId, repoId),
                inArray(t.skillContextAttachments.skillId, skillIds),
              ),
            )
            .orderBy(asc(t.skillContextAttachments.path));

    const skillPaths = new Map<string, string[]>();
    for (const r of skillRows) skillPaths.set(r.skillId, [...(skillPaths.get(r.skillId) ?? []), r.path]);

    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      createdAt: a.createdAt,
      paths: agentRows.filter((r) => r.agentId === a.id).map((r) => r.path),
      skills: links
        .filter((l) => l.agentId === a.id)
        .map((l) => ({
          id: l.skillId,
          name: l.name,
          order: l.order,
          paths: skillPaths.get(l.skillId) ?? [],
        })),
    }));
  }

  async getBrief(prId: string): Promise<StoredBrief> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    if (!row) return null;
    const parsed = PrBrief.safeParse(row.json);
    return parsed.success ? { kind: 'found', brief: parsed.data } : { kind: 'invalid' };
  }

  async saveBrief(prId: string, brief: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }
}
