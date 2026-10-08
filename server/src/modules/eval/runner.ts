import type { EvalCaseActual, LLMProvider } from '@devdigest/shared';
import { parseUnifiedDiff, scoreCase } from '@devdigest/reviewer-core';
import { EVAL_TASK_LINE } from './constants.js';
import { batchLogFields, finaliseBatch } from './helpers.js';
import type { CaseResult, FrozenBatch, NewRun, StoredCase } from './domain.js';
import type { BatchExecutor, EvalLog, EvalStore, LlmResolver, ReviewEngine } from './ports.js';

/**
 * Runs one batch: every case sequentially against the FROZEN inputs, one run
 * row per case, then the micro-averaged totals.
 *
 * The runner reads nothing from the agent after the batch started — prompt,
 * model, provider and skill bodies all come from `FrozenBatch`, so an agent
 * edit mid-batch cannot leak into the remaining cases (AC-50).
 */

export interface EvalRunnerDeps {
  store: EvalStore;
  engine: ReviewEngine;
  llm: LlmResolver;
  log: EvalLog;
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export class EvalBatchRunner implements BatchExecutor {
  constructor(private deps: EvalRunnerDeps) {}

  /** Never rejects for a case or provider failure; those end the batch as `failed`/`done`. */
  async execute(batchId: string, frozen: FrozenBatch): Promise<void> {
    const { store, log } = this.deps;
    const start = Date.now();
    try {
      let llm: LLMProvider;
      try {
        llm = await this.deps.llm.resolve(frozen.snapshot.provider);
      } catch (err) {
        // AC-56: a missing key fails the batch with the resolution error.
        await this.complete(batchId, frozen, {
          ...finaliseBatch([], Date.now() - start),
          error: message(err),
          casesTotal: frozen.caseIds.length,
        });
        return;
      }

      const results: CaseResult[] = [];
      // Loaded once: later case edits or deletes cannot leak into this batch, and
      // each run stores the expectations it was scored against.
      const cases = await store.getCasesByIds(frozen.workspaceId, frozen.caseIds);
      for (const stored of cases) {
        const { run, result } = await this.runCase(batchId, frozen, llm, stored);
        if (await store.insertRun(run)) results.push(result);
      }

      await this.complete(batchId, frozen, finaliseBatch(results, Date.now() - start));
    } catch (err) {
      // Infrastructure failure (DB down…): end the batch rather than leave it `running`.
      log.error({ batch_id: batchId, agent_id: frozen.agentId, err: message(err) }, 'eval: batch crashed');
      try {
        const done = finaliseBatch([], Date.now() - start);
        await store.completeBatch(batchId, { ...done, error: message(err), casesTotal: frozen.caseIds.length });
      } catch {
        // The boot reaper will fail it.
      }
    }
  }

  private async complete(
    batchId: string,
    frozen: FrozenBatch,
    completion: Parameters<EvalStore['completeBatch']>[1],
  ): Promise<void> {
    await this.deps.store.completeBatch(batchId, completion);
    this.deps.log.info(batchLogFields(batchId, frozen.agentId, completion, frozen.snapshot), 'eval: batch finished');
  }

  /** One case: engine call + scoring. A throw becomes an errored run (AC-53). */
  private async runCase(
    batchId: string,
    frozen: FrozenBatch,
    llm: LLMProvider,
    c: StoredCase,
  ): Promise<{ run: NewRun; result: CaseResult }> {
    const t0 = Date.now();
    try {
      const meta = c.inputMeta;
      const description = [meta?.title, meta?.body].filter((s): s is string => !!s).join('\n\n');
      const out = await this.deps.engine.run({
        systemPrompt: frozen.snapshot.systemPrompt,
        model: frozen.snapshot.model,
        diff: parseUnifiedDiff(c.inputDiff),
        llm,
        strategy: frozen.strategy,
        ...(frozen.skillBodies.length > 0 ? { skills: frozen.skillBodies } : {}),
        ...(description ? { prDescription: description } : {}),
        task: EVAL_TASK_LINE,
      });
      const score = scoreCase(c.expectedOutput.expectations, out.kept, out.dropped.length);
      const actual: EvalCaseActual = {
        kept: out.kept,
        dropped: out.dropped,
        matched_expectations: score.matched_expectations,
        noise_finding_ids: score.noise_finding_ids,
        mode: out.mode,
        tokens_in: out.tokensIn,
        tokens_out: out.tokensOut,
        expected_output: c.expectedOutput,
      };
      return {
        run: {
          caseId: c.id,
          batchId,
          actualOutput: actual,
          pass: score.pass,
          recall: score.recall,
          precision: score.precision,
          citationAccuracy: score.citation_accuracy,
          durationMs: Date.now() - t0,
          costUsd: out.costUsd,
          error: null,
        },
        result: { score, error: null, tokensIn: out.tokensIn, tokensOut: out.tokensOut, costUsd: out.costUsd },
      };
    } catch (err) {
      const error = message(err);
      return {
        run: {
          caseId: c.id,
          batchId,
          actualOutput: null,
          pass: null,
          recall: null,
          precision: null,
          citationAccuracy: null,
          durationMs: Date.now() - t0,
          costUsd: null,
          error,
        },
        result: { score: null, error, tokensIn: null, tokensOut: null, costUsd: null },
      };
    }
  }
}
