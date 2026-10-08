import { and, asc, count, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import {
  EvalCaseActual,
  EvalCaseMeta,
  EvalExpectedOutput,
  type Provider,
} from '@devdigest/shared';
import { RECENT_BATCHES_LIMIT, TREND_LIMIT } from './constants.js';
import type {
  BatchCompletion,
  CaseEdit,
  NewBatch,
  NewCase,
  NewRun,
  OverviewRows,
  StoredBatch,
  StoredCase,
  StoredRun,
} from './domain.js';
import type { EvalStore } from './ports.js';

/**
 * Eval data-access. Owns `eval_cases` (agent-owned rows), `eval_batches` and
 * `eval_runs`. Workspace-scoped throughout; rows are mapped to domain types
 * here and the row types never leave this file. Stored JSON is parsed once, here.
 */

type CaseRow = typeof t.evalCases.$inferSelect;
type BatchRow = typeof t.evalBatches.$inferSelect;

const PG_UNIQUE_VIOLATION = '23505';
const PG_FK_VIOLATION = '23503';

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code ?? e?.cause?.code;
}

/** A row whose stored JSON no longer fits the contract maps to null and is skipped. */
function toStoredCase(row: CaseRow, lastRun: StoredCase['lastRun'] = null): StoredCase | null {
  const expected = EvalExpectedOutput.safeParse(row.expectedOutput);
  if (!expected.success) return null;
  const meta = EvalCaseMeta.safeParse(row.inputMeta);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    ownerId: row.ownerId,
    name: row.name,
    inputDiff: row.inputDiff ?? '',
    inputMeta: meta.success ? meta.data : null,
    expectedOutput: expected.data,
    notes: row.notes,
    createdAt: row.createdAt,
    createdFrom: row.createdFrom,
    sourceFindingId: row.sourceFindingId,
    lastRun,
  };
}

function toStoredBatch(row: BatchRow): StoredBatch {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    snapshot: {
      agentVersion: row.agentVersion,
      systemPrompt: row.systemPrompt,
      provider: row.provider as Provider,
      model: row.model,
      skills: row.skills,
    },
    status: row.status,
    error: row.error,
    ranAt: row.ranAt,
    finishedAt: row.finishedAt,
    casesTotal: row.casesTotal,
    casesPassed: row.casesPassed,
    mustFindTotal: row.mustFindTotal,
    mustFindMatched: row.mustFindMatched,
    keptTotal: row.keptTotal,
    noiseTotal: row.noiseTotal,
    droppedTotal: row.droppedTotal,
    recall: row.recall,
    precision: row.precision,
    citationAccuracy: row.citationAccuracy,
    durationMs: row.durationMs,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costUsd: row.costUsd,
  };
}

export class EvalRepository implements EvalStore {
  constructor(private db: Db) {}

  // ---- cases ---------------------------------------------------------------

  private agentCase(workspaceId: string, id: string) {
    return and(
      eq(t.evalCases.workspaceId, workspaceId),
      eq(t.evalCases.id, id),
      eq(t.evalCases.ownerKind, 'agent'),
    );
  }

  /** Newest run per case (`DISTINCT ON (case_id) … ORDER BY ran_at DESC`). */
  private async lastRuns(caseIds: string[]): Promise<Map<string, NonNullable<StoredCase['lastRun']>>> {
    const out = new Map<string, NonNullable<StoredCase['lastRun']>>();
    if (caseIds.length === 0) return out;
    const rows = await this.db
      .selectDistinctOn([t.evalRuns.caseId], {
        caseId: t.evalRuns.caseId,
        pass: t.evalRuns.pass,
        batchId: t.evalRuns.batchId,
      })
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.caseId, caseIds))
      .orderBy(t.evalRuns.caseId, desc(t.evalRuns.ranAt), desc(t.evalRuns.id));
    for (const r of rows) out.set(r.caseId, { pass: r.pass, batchId: r.batchId });
    return out;
  }

  private async withLastRun(row: CaseRow | undefined): Promise<StoredCase | undefined> {
    if (!row) return undefined;
    const runs = await this.lastRuns([row.id]);
    return toStoredCase(row, runs.get(row.id) ?? null) ?? undefined;
  }

  async findCaseBySourceFinding(workspaceId: string, findingId: string): Promise<StoredCase | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.sourceFindingId, findingId),
          eq(t.evalCases.ownerKind, 'agent'),
        ),
      );
    return this.withLastRun(row);
  }

  async insertCase(values: NewCase): Promise<{ case: StoredCase; created: boolean }> {
    try {
      const [row] = await this.db
        .insert(t.evalCases)
        .values({
          workspaceId: values.workspaceId,
          ownerKind: 'agent',
          ownerId: values.ownerId,
          name: values.name,
          inputDiff: values.inputDiff,
          inputMeta: values.inputMeta,
          expectedOutput: values.expectedOutput,
          notes: values.notes,
          createdFrom: values.createdFrom,
          sourceFindingId: values.sourceFindingId,
        })
        .returning();
      return { case: toStoredCase(row!)!, created: true };
    } catch (err) {
      // Two clicks racing on one finding: the unique index lets one win (AC-33).
      if (pgCode(err) === PG_UNIQUE_VIOLATION && values.sourceFindingId) {
        const existing = await this.findCaseBySourceFinding(values.workspaceId, values.sourceFindingId);
        if (existing) return { case: existing, created: false };
      }
      throw err;
    }
  }

  async listCasesWithLastRun(workspaceId: string, agentId: string): Promise<StoredCase[]> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      )
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.id));
    const runs = await this.lastRuns(rows.map((r) => r.id));
    return rows
      .map((r) => toStoredCase(r, runs.get(r.id) ?? null))
      .filter((c): c is StoredCase => c !== null);
  }

  async getCase(workspaceId: string, id: string): Promise<StoredCase | undefined> {
    const [row] = await this.db.select().from(t.evalCases).where(this.agentCase(workspaceId, id));
    return this.withLastRun(row);
  }

  async updateCase(workspaceId: string, id: string, edit: CaseEdit): Promise<StoredCase | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        name: edit.name,
        inputDiff: edit.inputDiff,
        inputMeta: edit.inputMeta,
        expectedOutput: edit.expectedOutput,
        notes: edit.notes,
      })
      .where(this.agentCase(workspaceId, id))
      .returning();
    return this.withLastRun(row);
  }

  /** Runs of the case go with it (FK cascade). */
  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(this.agentCase(workspaceId, id))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  async getCasesByIds(workspaceId: string, ids: string[]): Promise<StoredCase[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          inArray(t.evalCases.id, ids),
        ),
      );
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .map((r) => (r ? toStoredCase(r) : null))
      .filter((c): c is StoredCase => c !== null);
  }

  async caseIdsForAgent(workspaceId: string, agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      )
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.id));
    return rows.map((r) => r.id);
  }

  // ---- batches + runs ------------------------------------------------------

  async findRunningBatch(workspaceId: string, agentId: string): Promise<StoredBatch | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalBatches)
      .where(
        and(
          eq(t.evalBatches.workspaceId, workspaceId),
          eq(t.evalBatches.agentId, agentId),
          eq(t.evalBatches.status, 'running'),
        ),
      )
      .limit(1);
    return row ? toStoredBatch(row) : undefined;
  }

  async insertBatch(values: NewBatch): Promise<StoredBatch | undefined> {
    try {
      const [row] = await this.db
        .insert(t.evalBatches)
        .values({
        workspaceId: values.workspaceId,
        agentId: values.agentId,
        agentVersion: values.snapshot.agentVersion,
        systemPrompt: values.snapshot.systemPrompt,
        provider: values.snapshot.provider,
        model: values.snapshot.model,
        skills: values.snapshot.skills,
        status: 'running',
        casesTotal: values.casesTotal,
      })
      .returning();
      return toStoredBatch(row!);
    } catch (err) {
      // `eval_batches_one_running_uq`: two starts racing past `findRunningBatch`.
      if (pgCode(err) === PG_UNIQUE_VIOLATION) return undefined;
      throw err;
    }
  }

  async insertRun(values: NewRun): Promise<boolean> {
    try {
      await this.db.insert(t.evalRuns).values({
        caseId: values.caseId,
        batchId: values.batchId,
        actualOutput: values.actualOutput,
        pass: values.pass,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
        error: values.error,
      });
      return true;
    } catch (err) {
      // The case was deleted while the batch ran: nothing to attach the run to.
      if (pgCode(err) === PG_FK_VIOLATION) return false;
      throw err;
    }
  }

  async completeBatch(batchId: string, c: BatchCompletion): Promise<void> {
    await this.db
      .update(t.evalBatches)
      .set({
        status: c.status,
        error: c.error,
        finishedAt: new Date(),
        casesTotal: c.casesTotal,
        casesPassed: c.casesPassed,
        mustFindTotal: c.mustFindTotal,
        mustFindMatched: c.mustFindMatched,
        keptTotal: c.keptTotal,
        noiseTotal: c.noiseTotal,
        droppedTotal: c.droppedTotal,
        recall: c.recall,
        precision: c.precision,
        citationAccuracy: c.citationAccuracy,
        durationMs: c.durationMs,
        tokensIn: c.tokensIn,
        tokensOut: c.tokensOut,
        costUsd: c.costUsd,
      })
      .where(eq(t.evalBatches.id, batchId));
  }

  async listBatches(workspaceId: string, agentId: string, limit: number): Promise<StoredBatch[]> {
    const rows = await this.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.agentId, agentId)))
      .orderBy(desc(t.evalBatches.ranAt), desc(t.evalBatches.id))
      .limit(limit);
    return rows.map(toStoredBatch);
  }

  async getBatchWithRuns(
    workspaceId: string,
    batchId: string,
  ): Promise<{ batch: StoredBatch; runs: StoredRun[] } | undefined> {
    const [batchRow] = await this.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.id, batchId)));
    if (!batchRow) return undefined;

    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name, expected: t.evalCases.expectedOutput })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(eq(t.evalRuns.batchId, batchId))
      .orderBy(asc(t.evalRuns.ranAt), asc(t.evalCases.name), asc(t.evalRuns.id));

    const runs: StoredRun[] = [];
    for (const r of rows) {
      const expected = EvalExpectedOutput.safeParse(r.expected);
      if (!expected.success) continue;
      const actual = EvalCaseActual.safeParse(r.run.actualOutput);
      runs.push({
        id: r.run.id,
        caseId: r.run.caseId,
        caseName: r.caseName,
        batchId,
        ranAt: r.run.ranAt,
        // The run's own snapshot wins; errored runs carry none and show the live case.
        expectedOutput: actual.success && actual.data.expected_output ? actual.data.expected_output : expected.data,
        actualOutput: actual.success ? actual.data : null,
        pass: r.run.pass,
        recall: r.run.recall,
        precision: r.run.precision,
        citationAccuracy: r.run.citationAccuracy,
        durationMs: r.run.durationMs,
        costUsd: r.run.costUsd,
        error: r.run.error,
      });
    }
    return { batch: toStoredBatch(batchRow), runs };
  }

  // ---- overview ------------------------------------------------------------

  /** Set-based: five queries for the whole workspace, none per agent. */
  async overview(workspaceId: string): Promise<OverviewRows> {
    const agentRows = await this.db
      .select({ id: t.agents.id, name: t.agents.name, model: t.agents.model })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agents.name), asc(t.agents.id));

    const counts = await this.db
      .select({ ownerId: t.evalCases.ownerId, n: count() })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
      .groupBy(t.evalCases.ownerId);
    const countByAgent = new Map(counts.map((c) => [c.ownerId, Number(c.n)]));

    const latest = await this.db
      .selectDistinctOn([t.evalBatches.agentId])
      .from(t.evalBatches)
      .where(eq(t.evalBatches.workspaceId, workspaceId))
      .orderBy(t.evalBatches.agentId, desc(t.evalBatches.ranAt), desc(t.evalBatches.id));

    const ranked = this.db
      .select({
        id: t.evalBatches.id,
        rn: sql<number>`row_number() over (partition by ${t.evalBatches.agentId} order by ${t.evalBatches.ranAt} desc, ${t.evalBatches.id} desc)`.as(
          'rn',
        ),
      })
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.status, 'done')))
      .as('ranked');
    const done = await this.db
      .select({ batch: t.evalBatches })
      .from(t.evalBatches)
      .innerJoin(ranked, eq(ranked.id, t.evalBatches.id))
      .where(lte(ranked.rn, TREND_LIMIT))
      .orderBy(asc(t.evalBatches.ranAt), asc(t.evalBatches.id));

    return {
      agents: agentRows.map((a) => ({
        agentId: a.id,
        name: a.name,
        model: a.model,
        casesTotal: countByAgent.get(a.id) ?? 0,
      })),
      latestBatches: latest.map(toStoredBatch),
      doneBatches: done.map((d) => toStoredBatch(d.batch)),
      recent: await this.recent(workspaceId),
    };
  }

  private async recent(workspaceId: string): Promise<StoredBatch[]> {
    const rows = await this.db
      .select()
      .from(t.evalBatches)
      .where(eq(t.evalBatches.workspaceId, workspaceId))
      .orderBy(desc(t.evalBatches.ranAt), desc(t.evalBatches.id))
      .limit(RECENT_BATCHES_LIMIT);
    return rows.map(toStoredBatch);
  }

  // ---- reaper --------------------------------------------------------------

  async reapRunningBatches(error: string): Promise<number> {
    const rows = await this.db
      .update(t.evalBatches)
      .set({ status: 'failed', error, finishedAt: new Date() })
      .where(eq(t.evalBatches.status, 'running'))
      .returning({ id: t.evalBatches.id });
    return rows.length;
  }
}
