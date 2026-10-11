import { and, asc, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { ConflictError } from '../../platform/errors.js';
import { RUNS_PAGE_SIZE } from './constants.js';
import type {
  CiRunInsert,
  CiRunRow,
  InstallState,
  InstallationRecord,
  RepoRecord,
  UpsertInstallation,
} from './domain.js';
import type { CiRunsFilter, CiStore } from './ports.js';

/**
 * Data-access for `ci_installations` and `ci_runs` (plus the `agent_runs` rows
 * ingested CI runs write, and the repo / memory reads the bundle needs).
 * Workspace-scoped throughout; rows are mapped to domain types here and never
 * leave this file.
 */

type InstallationRow = typeof t.ciInstallations.$inferSelect;

/** Thrown inside the insert transaction to roll the agent run back on a duplicate. */
class DuplicateRun extends Error {}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export class CiRepository implements CiStore {
  constructor(private db: Db) {}

  async findRepoByFullName(workspaceId: string, fullName: string): Promise<RepoRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    if (!row) return undefined;
    return {
      id: row.id,
      owner: row.owner,
      name: row.name,
      fullName: row.fullName,
      defaultBranch: row.defaultBranch,
    };
  }

  /** Repo-scoped plus global memory, oldest first; content and kind only (AC-10). */
  async memoryForRepo(workspaceId: string, repoId: string): Promise<{ content: string; kind: string }[]> {
    return this.db
      .select({ content: t.memory.content, kind: t.memory.kind })
      .from(t.memory)
      .where(
        and(
          eq(t.memory.workspaceId, workspaceId),
          or(
            and(eq(t.memory.scope, 'repo'), eq(t.memory.repoId, repoId)),
            eq(t.memory.scope, 'global'),
          ),
        ),
      )
      .orderBy(asc(t.memory.createdAt), asc(t.memory.id));
  }

  async findInstallationByRepo(
    workspaceId: string,
    repo: string,
  ): Promise<InstallationRecord | undefined> {
    const rows = await this.selectInstallations(workspaceId, eq(t.ciInstallations.repo, repo));
    return rows[0];
  }

  /**
   * Insert, or update the same agent's installation of the same repo (AC-45).
   * Another agent's row is never overwritten (AC-138): a race loses with a 409.
   */
  async upsertInstallation(input: UpsertInstallation): Promise<InstallationRecord> {
    const values = {
      agentId: input.agentId,
      repoId: input.repoId,
      githubRepoId: input.githubRepoId,
      state: 'pr_open' as const,
      agentVersion: input.agentVersion,
      runnerVersion: input.runnerVersion,
      prUrl: input.prUrl,
      prNumber: input.prNumber,
    };
    const returned = await this.db
      .insert(t.ciInstallations)
      .values({
        id: input.id,
        workspaceId: input.workspaceId,
        repo: input.repo,
        targetType: 'gha',
        ...values,
      })
      .onConflictDoUpdate({
        target: [t.ciInstallations.workspaceId, t.ciInstallations.repo],
        // A re-export must not regress an already-active installation to pr_open.
        set: {
          ...values,
          state: sql`CASE WHEN ${t.ciInstallations.state} = 'active' THEN 'active' ELSE 'pr_open' END`,
          updatedAt: new Date(),
        },
        setWhere: eq(t.ciInstallations.agentId, input.agentId),
      })
      .returning({ id: t.ciInstallations.id });
    if (returned.length === 0) {
      throw new ConflictError(
        `${input.repo} already has the DevDigest CI installation of another agent`,
        undefined,
        'ci_repo_has_other_agent',
      );
    }
    const [rec] = await this.selectInstallations(
      input.workspaceId,
      eq(t.ciInstallations.id, returned[0]!.id),
    );
    return rec!;
  }

  async listInstallations(workspaceId: string, agentId?: string): Promise<InstallationRecord[]> {
    return this.selectInstallations(
      workspaceId,
      agentId ? eq(t.ciInstallations.agentId, agentId) : undefined,
    );
  }

  async ingestedKeys(workspaceId: string, installationId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ run: t.ciRuns.githubRunId, attempt: t.ciRuns.runAttempt })
      .from(t.ciRuns)
      .where(
        and(eq(t.ciRuns.workspaceId, workspaceId), eq(t.ciRuns.ciInstallationId, installationId)),
      );
    return new Set(rows.map((r) => `${r.run}:${r.attempt}`));
  }

  /**
   * One transaction: the `agent_runs` row (source 'ci'), then its `ci_runs` side
   * record. A duplicate (installation, run, attempt) rolls the agent run back
   * and returns false (AC-52 to AC-54). Never inserts a repo or PR (AC-57).
   */
  async insertCiRun(input: CiRunInsert): Promise<boolean> {
    try {
      await this.db.transaction(async (tx) => {
        const prId = await this.findPullId(tx, input);
        const [run] = await tx
          .insert(t.agentRuns)
          .values({
            workspaceId: input.workspaceId,
            agentId: input.agentId,
            prId,
            ranAt: input.ranAt,
            model: input.model,
            durationMs: input.durationMs,
            costUsd: input.costUsd,
            status: input.status,
            source: 'ci',
            findingsCount: input.findingsCount,
            blockers: input.blockers,
          })
          .returning({ id: t.agentRuns.id });
        const inserted = await tx
          .insert(t.ciRuns)
          .values({
            workspaceId: input.workspaceId,
            ciInstallationId: input.installationId,
            agentRunId: run!.id,
            repo: input.repo,
            headSha: input.headSha,
            githubRunId: input.githubRunId,
            runAttempt: input.runAttempt,
            artifactId: input.artifactId,
            prNumber: input.prNumber,
            ranAt: input.ranAt,
            githubUrl: input.jobUrl,
          })
          .onConflictDoNothing()
          .returning({ id: t.ciRuns.id });
        if (inserted.length === 0) throw new DuplicateRun();
      });
      return true;
    } catch (err) {
      if (err instanceof DuplicateRun) return false;
      throw err;
    }
  }

  async setInstallationState(workspaceId: string, id: string, state: InstallState): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({ state, updatedAt: new Date() })
      .where(and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.ciInstallations.id, id)));
  }

  async hasIngestedRun(workspaceId: string, installationId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: t.ciRuns.id })
      .from(t.ciRuns)
      .where(
        and(eq(t.ciRuns.workspaceId, workspaceId), eq(t.ciRuns.ciInstallationId, installationId)),
      )
      .limit(1);
    return rows.length > 0;
  }

  async listCiRuns(
    workspaceId: string,
    filter: CiRunsFilter,
  ): Promise<{ rows: CiRunRow[]; hasMore: boolean }> {
    const rows = await this.db
      .select({
        id: t.ciRuns.id,
        repository: t.ciRuns.repo,
        prNumber: t.ciRuns.prNumber,
        agent: t.agents.name,
        findingsCount: t.agentRuns.findingsCount,
        blockers: t.agentRuns.blockers,
        costUsd: t.agentRuns.costUsd,
        durationMs: t.agentRuns.durationMs,
        headSha: t.ciRuns.headSha,
        jobUrl: t.ciRuns.githubUrl,
        status: t.agentRuns.status,
        ranAt: t.agentRuns.ranAt,
      })
      .from(t.ciRuns)
      .innerJoin(t.agentRuns, eq(t.ciRuns.agentRunId, t.agentRuns.id))
      .leftJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .leftJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(
        and(
          eq(t.ciRuns.workspaceId, workspaceId),
          filter.window === '7d'
            ? gte(t.agentRuns.ranAt, new Date(Date.now() - SEVEN_DAYS_MS))
            : undefined,
          filter.agentId ? eq(t.agentRuns.agentId, filter.agentId) : undefined,
          filter.repo ? eq(t.ciRuns.repo, filter.repo) : undefined,
          filter.status ? eq(t.agentRuns.status, filter.status) : undefined,
        ),
      )
      .orderBy(desc(t.agentRuns.ranAt), desc(t.ciRuns.id))
      .limit(RUNS_PAGE_SIZE + 1)
      .offset((filter.page - 1) * RUNS_PAGE_SIZE);
    const page = rows.slice(0, RUNS_PAGE_SIZE);
    return {
      rows: page.map((r) => ({ ...r, status: (r.status ?? 'failed') as CiRunRow['status'] })),
      hasMore: rows.length > RUNS_PAGE_SIZE,
    };
  }

  // ---- private ------------------------------------------------------------

  private async findPullId(
    tx: Pick<Db, 'select'>,
    input: Pick<CiRunInsert, 'workspaceId' | 'repo' | 'prNumber'>,
  ): Promise<string | null> {
    if (input.prNumber === null) return null;
    const [row] = await tx
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.pullRequests.repoId, t.repos.id))
      .where(
        and(
          eq(t.pullRequests.workspaceId, input.workspaceId),
          eq(t.repos.fullName, input.repo),
          eq(t.pullRequests.number, input.prNumber),
        ),
      );
    return row?.id ?? null;
  }

  private async selectInstallations(
    workspaceId: string,
    where: ReturnType<typeof and>,
  ): Promise<InstallationRecord[]> {
    const rows = await this.db
      .select({
        inst: t.ciInstallations,
        agentName: t.agents.name,
        agentVersion: t.agents.version,
      })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.ciInstallations.workspaceId, workspaceId), where))
      .orderBy(desc(t.ciInstallations.installedAt));
    if (rows.length === 0) return [];
    const latest = await this.latestRuns(workspaceId, rows.map((r) => r.inst.id));
    return rows.map((r) => this.toRecord(r.inst, r.agentName, r.agentVersion, latest.get(r.inst.id) ?? null));
  }

  /** Newest stored run (status + time) per installation (AC-71). */
  private async latestRuns(
    workspaceId: string,
    ids: string[],
  ): Promise<Map<string, { status: CiRunRow['status']; ranAt: Date }>> {
    const rows = await this.db
      .select({
        installationId: t.ciRuns.ciInstallationId,
        status: t.agentRuns.status,
        ranAt: t.agentRuns.ranAt,
      })
      .from(t.ciRuns)
      .innerJoin(t.agentRuns, eq(t.ciRuns.agentRunId, t.agentRuns.id))
      .where(and(eq(t.ciRuns.workspaceId, workspaceId), inArray(t.ciRuns.ciInstallationId, ids)))
      .orderBy(desc(t.agentRuns.ranAt));
    const out = new Map<string, { status: CiRunRow['status']; ranAt: Date }>();
    for (const r of rows) {
      if (r.installationId && !out.has(r.installationId)) {
        out.set(r.installationId, { status: (r.status ?? 'failed') as CiRunRow['status'], ranAt: r.ranAt });
      }
    }
    return out;
  }

  private toRecord(
    row: InstallationRow,
    agentName: string,
    currentAgentVersion: number,
    latestRun: InstallationRecord['latestRun'],
  ): InstallationRecord {
    return {
      id: row.id,
      agentId: row.agentId,
      agentName,
      currentAgentVersion,
      repo: row.repo,
      githubRepoId: row.githubRepoId,
      state: row.state,
      agentVersion: row.agentVersion,
      runnerVersion: row.runnerVersion,
      prUrl: row.prUrl,
      prNumber: row.prNumber,
      installedAt: row.installedAt,
      updatedAt: row.updatedAt,
      latestRun,
    };
  }
}
