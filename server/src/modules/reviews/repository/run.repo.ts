import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { RunSummary, RunTrace } from '@devdigest/shared';

/** The workspace's agents among `ids` (unordered; unknown ids are simply absent). */
export async function agentsByIds(db: Db, workspaceId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), inArray(t.agents.id, ids)));
}

// ---- in-flight / history --------------------------------------------------

/** Statuses of a run that hasn't settled yet: `queued` while it waits for the
 *  agents ahead of it (they run one at a time), `running` once it starts. */
const IN_FLIGHT = ['queued', 'running'] as const;
type InFlightStatus = (typeof IN_FLIGHT)[number];

/** In-flight runs for a PR (queued or running) — the server-side source of
 *  truth for "which agents are working now". Joined with the agent name. */
export async function activeRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<
  { run_id: string; agent_id: string | null; agent_name: string | null; ran_at: string | null; status: InFlightStatus }[]
> {
  const rows = await db
    .select({
      id: t.agentRuns.id,
      status: t.agentRuns.status,
      agentId: t.agentRuns.agentId,
      ranAt: t.agentRuns.ranAt,
      agentName: t.agents.name,
    })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.prId, prId),
        inArray(t.agentRuns.status, [...IN_FLIGHT]),
      ),
    );
  return rows.map((r) => ({
    run_id: r.id,
    agent_id: r.agentId,
    agent_name: r.agentName ?? null,
    ran_at: r.ranAt ? r.ranAt.toISOString() : null,
    // the inArray filter above guarantees one of the two
    status: r.status as InFlightStatus,
  }));
}

/** One `agent_runs` row (+ its agent's name) → the transport `RunSummary`. */
function toRunSummary(run: typeof t.agentRuns.$inferSelect, agentName: string | null): RunSummary {
  return {
    run_id: run.id,
    agent_id: run.agentId,
    agent_name: agentName,
    provider: run.provider,
    model: run.model,
    status: run.status,
    error: run.error,
    duration_ms: run.durationMs,
    tokens_in: run.tokensIn,
    tokens_out: run.tokensOut,
    cost_usd: run.costUsd,
    findings_count: run.findingsCount,
    grounding: run.grounding,
    ran_at: run.ranAt ? run.ranAt.toISOString() : null,
    score: run.score,
    blockers: run.blockers,
  };
}

/** All runs for a PR (any status), newest first — the PR run history. */
export async function listRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<RunSummary[]> {
  const rows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.prId, prId)))
    .orderBy(desc(t.agentRuns.ranAt));
  return rows.map(({ run, agentName }) => toRunSummary(run, agentName ?? null));
}

/**
 * One run by id, workspace-scoped — the MCP surface's poll target
 * (`get_findings`). Unlike `/runs/:id/*`'s HTTP routes (`docs/insights.md`),
 * this closes the scope gap: a run id from another workspace 404s instead of
 * being served.
 */
export async function getRunSummary(db: Db, workspaceId: string, runId: string): Promise<RunSummary | undefined> {
  const [row] = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.id, runId)));
  return row ? toRunSummary(row.run, row.agentName ?? null) : undefined;
}

/**
 * Delete one agent run (+ its trace via FK cascade) AND the review it produced.
 * Workspace-scoped. `reviews.run_id` has no FK to `agent_runs`, so the review
 * (and its findings, which DO cascade from `reviews`) must be removed explicitly
 * here — otherwise deleting a run from the timeline leaves its findings orphaned
 * in the Review Runs list below.
 */
export async function deleteAgentRun(
  db: Db,
  workspaceId: string,
  runId: string,
): Promise<boolean> {
  await db
    .delete(t.reviews)
    .where(and(eq(t.reviews.runId, runId), eq(t.reviews.workspaceId, workspaceId)));
  const rows = await db
    .delete(t.agentRuns)
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.workspaceId, workspaceId)))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** Mark a queued or running run as cancelled (no-op if it already finished). */
export async function cancelRunIfRunning(db: Db, runId: string): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'cancelled', finishedAt: new Date() })
    .where(and(eq(t.agentRuns.id, runId), inArray(t.agentRuns.status, [...IN_FLIGHT])))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** On boot: any run still queued or running is orphaned (its process died / restarted),
 *  so mark it failed. Prevents permanently stuck "running" runs in the UI. */
export async function reapStaleRunningRuns(db: Db): Promise<number> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'failed', finishedAt: new Date() })
    .where(inArray(t.agentRuns.status, [...IN_FLIGHT]))
    .returning({ id: t.agentRuns.id });
  return rows.length;
}

// ---- observability: agent_runs + run_traces -------------------------------

/** Create an agent_runs row in `queued` state; returns its id (= the runId).
 *  `startAgentRun` flips it to `running` when the executor reaches it. */
export async function createAgentRun(
  db: Db,
  values: {
    workspaceId: string;
    agentId: string | null;
    prId: string;
    provider: string | null;
    model: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: values.workspaceId,
      agentId: values.agentId,
      prId: values.prId,
      provider: values.provider,
      model: values.model,
      status: 'queued',
      source: 'local',
    })
    .returning({ id: t.agentRuns.id });
  return row!.id;
}

/** queued → running when the executor picks the run up. False when the run is
 *  no longer queued (cancelled while waiting) — the caller must skip it. */
export async function startAgentRun(db: Db, workspaceId: string, runId: string): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'running', startedAt: new Date() })
    .where(
      and(
        eq(t.agentRuns.id, runId),
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.status, 'queued'),
      ),
    )
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

export async function completeAgentRun(
  db: Db,
  runId: string,
  values: {
    status: 'done' | 'failed' | 'cancelled';
    durationMs: number;
    tokensIn: number;
    tokensOut: number;
    /** USD spent (usage × pricing); null when unknown. */
    costUsd?: number | null;
    findingsCount: number;
    grounding: string;
    /** Review score (0-100); null on failed/cancelled runs. */
    score?: number | null;
    /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
    blockers?: number | null;
    /** Failure reason (status='failed') / cancellation note. Null clears it. */
    error?: string | null;
  },
): Promise<void> {
  await db
    .update(t.agentRuns)
    .set({
      status: values.status,
      finishedAt: new Date(),
      durationMs: values.durationMs,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      costUsd: values.costUsd ?? null,
      findingsCount: values.findingsCount,
      grounding: values.grounding,
      score: values.score ?? null,
      blockers: values.blockers ?? null,
      error: values.error ?? null,
    })
    .where(eq(t.agentRuns.id, runId));
}

/**
 * Multi-agent launch (SPEC-05): in ONE transaction insert the parent run (with
 * the selection order in `agent_ids`) and one `queued`, `local` child run per
 * agent, in order. Either every row exists or none does.
 */
export async function createMultiAgentLaunch(
  db: Db,
  values: {
    workspaceId: string;
    prId: string;
    agents: { id: string; provider: string | null; model: string | null }[];
  },
): Promise<{ parentId: string; runIds: string[] }> {
  return db.transaction(async (tx) => {
    const [parent] = await tx
      .insert(t.multiAgentRuns)
      .values({
        workspaceId: values.workspaceId,
        prId: values.prId,
        agentIds: values.agents.map((a) => a.id),
      })
      .returning({ id: t.multiAgentRuns.id });
    const runIds: string[] = [];
    for (const a of values.agents) {
      const [row] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId: values.workspaceId,
          agentId: a.id,
          prId: values.prId,
          provider: a.provider,
          model: a.model,
          status: 'queued',
          source: 'local',
          multiAgentRunId: parent!.id,
        })
        .returning({ id: t.agentRuns.id });
      runIds.push(row!.id);
    }
    return { parentId: parent!.id, runIds };
  });
}

/** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
export async function saveRunTrace(db: Db, runId: string, trace: RunTrace): Promise<void> {
  await db
    .insert(t.runTraces)
    .values({ runId, trace })
    .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace } });
}

export async function getRunTrace(db: Db, runId: string): Promise<RunTrace | undefined> {
  const [row] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
  return row ? (row.trace as RunTrace) : undefined;
}
