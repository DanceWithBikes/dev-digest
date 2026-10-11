import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Finding } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  ChildRun,
  ChildStatus,
  EstimateSample,
  GroupableFinding,
  ParentRow,
} from './domain.js';
import { ESTIMATE_SAMPLE } from './constants.js';
import type { MultiAgentStore, ParentDetail, ParentWithChildren } from './ports.js';

/**
 * Multi-agent data-access (read side). Reads `multi_agent_runs` and, as plain
 * queries of its own, `agent_runs`, `reviews`, `findings`, `agents` and
 * `pull_requests` — no other module's folder is imported. Every query is
 * scoped by `workspace_id`; rows are mapped to domain types here.
 */

const CHILD_STATUSES: readonly string[] = ['queued', 'running', 'done', 'failed', 'cancelled'];

function toStatus(raw: string | null): ChildStatus {
  if (raw === null) return 'queued';
  return (CHILD_STATUSES.includes(raw) ? raw : 'failed') as ChildStatus;
}

export class MultiAgentRepository implements MultiAgentStore {
  constructor(private readonly db: Db) {}

  async listParents(workspaceId: string, limit: number): Promise<ParentWithChildren[]> {
    const rows = await this.db
      .select({
        id: t.multiAgentRuns.id,
        prId: t.multiAgentRuns.prId,
        agentIds: t.multiAgentRuns.agentIds,
        ranAt: t.multiAgentRuns.ranAt,
        prNumber: t.pullRequests.number,
        prTitle: t.pullRequests.title,
      })
      .from(t.multiAgentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .where(eq(t.multiAgentRuns.workspaceId, workspaceId))
      .orderBy(desc(t.multiAgentRuns.ranAt))
      .limit(limit);
    if (rows.length === 0) return [];

    const children = await this.db
      .select({
        id: t.agentRuns.id,
        parentId: t.agentRuns.multiAgentRunId,
        agentId: t.agentRuns.agentId,
        provider: t.agentRuns.provider,
        model: t.agentRuns.model,
        status: t.agentRuns.status,
        error: t.agentRuns.error,
        score: t.agentRuns.score,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
        startedAt: t.agentRuns.startedAt,
        finishedAt: t.agentRuns.finishedAt,
      })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.multiAgentRunId, rows.map((r) => r.id)),
        ),
      )
      .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));

    return rows.map((r) => ({
      parent: toParent(r),
      children: children
        .filter((c) => c.parentId === r.id)
        .map((c) => ({
          id: c.id,
          agentId: c.agentId,
          agentName: null,
          provider: c.provider,
          model: c.model,
          status: toStatus(c.status),
          error: c.error,
          score: c.score,
          summary: null,
          verdict: null,
          durationMs: c.durationMs,
          costUsd: c.costUsd,
          startedAt: c.startedAt,
          finishedAt: c.finishedAt,
        })),
    }));
  }

  async getParent(workspaceId: string, id: string): Promise<ParentDetail | null> {
    const [row] = await this.db
      .select({
        id: t.multiAgentRuns.id,
        prId: t.multiAgentRuns.prId,
        agentIds: t.multiAgentRuns.agentIds,
        ranAt: t.multiAgentRuns.ranAt,
        prNumber: t.pullRequests.number,
        prTitle: t.pullRequests.title,
      })
      .from(t.multiAgentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, id)));
    if (!row) return null;

    const childRows = await this.db
      .select({
        id: t.agentRuns.id,
        agentId: t.agentRuns.agentId,
        agentName: t.agents.name,
        provider: t.agentRuns.provider,
        model: t.agentRuns.model,
        status: t.agentRuns.status,
        error: t.agentRuns.error,
        score: t.agentRuns.score,
        summary: t.reviews.summary,
        verdict: t.reviews.verdict,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
        startedAt: t.agentRuns.startedAt,
        finishedAt: t.agentRuns.finishedAt,
      })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .leftJoin(
        t.reviews,
        and(eq(t.reviews.runId, t.agentRuns.id), eq(t.reviews.workspaceId, workspaceId)),
      )
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.multiAgentRunId, id)))
      .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));

    const children: ChildRun[] = childRows.map((c) => ({ ...c, status: toStatus(c.status) }));

    const findingRows =
      children.length === 0
        ? []
        : await this.db
            .select({
              f: t.findings,
              runId: t.reviews.runId,
              agentId: t.reviews.agentId,
            })
            .from(t.findings)
            .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
            .where(
              and(
                eq(t.reviews.workspaceId, workspaceId),
                inArray(t.reviews.runId, children.map((c) => c.id)),
              ),
            )
            .orderBy(asc(t.findings.file), asc(t.findings.startLine), asc(t.findings.id));

    const findings: GroupableFinding[] = findingRows.flatMap(({ f, runId, agentId }) =>
      runId === null
        ? []
        : [
            {
              id: f.id,
              severity: f.severity as Finding['severity'],
              category: f.category as Finding['category'],
              title: f.title,
              file: f.file,
              start_line: f.startLine,
              end_line: f.endLine,
              rationale: f.rationale,
              suggestion: f.suggestion ?? null,
              confidence: f.confidence,
              kind: (f.kind as Finding['kind']) ?? 'finding',
              trifecta_components: (f.trifectaComponents as Finding['trifecta_components']) ?? null,
              evidence: null,
              review_id: f.reviewId,
              accepted_at: f.acceptedAt?.toISOString() ?? null,
              dismissed_at: f.dismissedAt?.toISOString() ?? null,
              learned_at: f.learnedAt?.toISOString() ?? null,
              agentId,
              runId,
            },
          ],
    );

    return { parent: toParent(row), children, findings };
  }

  async listAgentIds(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agents.id));
    return rows.map((r) => r.id);
  }

  async estimateSamples(workspaceId: string): Promise<EstimateSample[]> {
    const ranked = this.db
      .select({
        agentId: t.agentRuns.agentId,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
        ranAt: t.agentRuns.ranAt,
        rn: sql<number>`row_number() over (partition by ${t.agentRuns.agentId} order by ${t.agentRuns.ranAt} desc)`.as(
          'rn',
        ),
      })
      .from(t.agentRuns)
      .innerJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agentRuns.status, 'done'),
          eq(t.agentRuns.model, t.agents.model),
        ),
      )
      .as('ranked');

    const rows = await this.db
      .select({
        agentId: ranked.agentId,
        durationMs: ranked.durationMs,
        costUsd: ranked.costUsd,
      })
      .from(ranked)
      .where(sql`${ranked.rn} <= ${ESTIMATE_SAMPLE}`)
      .orderBy(asc(ranked.agentId), asc(ranked.rn));

    return rows.flatMap((r) =>
      r.agentId === null
        ? []
        : [{ agentId: r.agentId, durationMs: r.durationMs, costUsd: r.costUsd }],
    );
  }
}

function toParent(r: {
  id: string;
  prId: string;
  agentIds: string[];
  ranAt: Date;
  prNumber: number | null;
  prTitle: string | null;
}): ParentRow {
  return {
    id: r.id,
    prId: r.prId,
    prNumber: r.prNumber,
    prTitle: r.prTitle,
    agentIds: r.agentIds,
    createdAt: r.ranAt.toISOString(),
  };
}
