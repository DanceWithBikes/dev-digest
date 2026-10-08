import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { SkillEvalResult, SkillEvalRunSummary } from '@devdigest/shared';
import type { SkillEvalStore } from '../ports.js';
import type { SkillEvalRecord } from '../eval-records.js';
import { EVAL_UPSERT_CHUNK } from '../constants.js';

/**
 * Data access for `skill_eval_results`. Workspace-scoped throughout; maps rows to
 * the contract DTOs here so the row type never leaves the file.
 */
export class SkillEvalsRepository implements SkillEvalStore {
  constructor(private db: Db) {}

  async upsertMany(
    workspaceId: string,
    skillId: string,
    records: SkillEvalRecord[],
  ): Promise<number> {
    let written = 0;
    for (let i = 0; i < records.length; i += EVAL_UPSERT_CHUNK) {
      const chunk = records.slice(i, i + EVAL_UPSERT_CHUNK);
      await this.db
        .insert(t.skillEvalResults)
        .values(
          chunk.map((r) => ({
            workspaceId,
            skillId,
            runId: r.runId,
            config: r.config,
            caseName: r.caseName,
            outcome: r.outcome,
            score: r.score,
            threshold: r.threshold,
            grounded: r.grounded,
            practices: r.practices,
            gitSha: r.gitSha,
            dirty: r.dirty,
            durationMs: r.durationMs,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            numTurns: r.numTurns,
            ranAt: r.ranAt,
          })),
        )
        .onConflictDoUpdate({
          target: [
            t.skillEvalResults.skillId,
            t.skillEvalResults.runId,
            t.skillEvalResults.config,
            t.skillEvalResults.caseName,
          ],
          set: {
            outcome: sql`excluded.outcome`,
            score: sql`excluded.score`,
            threshold: sql`excluded.threshold`,
            grounded: sql`excluded.grounded`,
            practices: sql`excluded.practices`,
            gitSha: sql`excluded.git_sha`,
            dirty: sql`excluded.dirty`,
            durationMs: sql`excluded.duration_ms`,
            inputTokens: sql`excluded.input_tokens`,
            outputTokens: sql`excluded.output_tokens`,
            numTurns: sql`excluded.num_turns`,
            ranAt: sql`excluded.ran_at`,
          },
        });
      written += chunk.length;
    }
    return written;
  }

  async latestPerCase(workspaceId: string, skillId: string): Promise<SkillEvalResult[]> {
    const r = t.skillEvalResults;
    const rows = await this.db
      .selectDistinctOn([r.caseName])
      .from(r)
      .where(
        and(eq(r.workspaceId, workspaceId), eq(r.skillId, skillId), eq(r.config, 'candidate')),
      )
      .orderBy(r.caseName, desc(r.ranAt));
    return rows.map((row) => ({
      id: row.id,
      run_id: row.runId,
      config: row.config,
      case_name: row.caseName,
      outcome: row.outcome,
      score: row.score,
      threshold: row.threshold,
      grounded: row.grounded,
      practices: row.practices,
      git_sha: row.gitSha,
      dirty: row.dirty,
      duration_ms: row.durationMs,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
      num_turns: row.numTurns,
      ran_at: row.ranAt.toISOString(),
    }));
  }

  async runs(workspaceId: string, skillId: string, limit: number): Promise<SkillEvalRunSummary[]> {
    const r = t.skillEvalResults;
    const ranAt = sql<Date>`min(${r.ranAt})`;
    const rows = await this.db
      .select({
        runId: r.runId,
        config: r.config,
        ranAt,
        passed: sql<number>`count(*) filter (where ${r.outcome})::int`,
        total: sql<number>`count(*)::int`,
        avgScore: sql<number | null>`avg(${r.score})`,
        gitSha: sql<string | null>`max(${r.gitSha})`,
        dirty: sql<boolean | null>`bool_or(${r.dirty})`,
      })
      .from(r)
      .where(and(eq(r.workspaceId, workspaceId), eq(r.skillId, skillId)))
      .groupBy(r.runId, r.config)
      .orderBy(desc(ranAt), desc(r.config))
      .limit(limit);
    return rows.map((row) => ({
      run_id: row.runId,
      ran_at: new Date(row.ranAt).toISOString(),
      config: row.config,
      passed: row.passed,
      total: row.total,
      avg_score: row.avgScore === null ? null : Number(row.avgScore),
      git_sha: row.gitSha,
      dirty: row.dirty,
    }));
  }
}
