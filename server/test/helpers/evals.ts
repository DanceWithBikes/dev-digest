import * as t from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { PgFixture } from './pg.js';

/**
 * `POST /agents/:id/eval-runs` is fire-and-forget: it answers 202 `running` and
 * the batch is executed in the background, one `eval_runs` row per case, with
 * the batch row completed last. Tests that assert on the persisted batch must
 * first wait for it. This polls `eval_batches.status` until it is terminal
 * (done / failed) AND the batch has at least `expectedRuns` run rows (default:
 * its `cases_total`), mirroring `waitForPrRuns` / the "terminal status is not
 * the same as every row written" lesson in `server/docs/insights.md`.
 *
 * A batch that failed before running any case (provider could not be
 * resolved) writes no run rows although `cases_total` is set — pass
 * `expectedRuns: 0` for it.
 *
 * Throws (a named timeout, never an `undefined` dereference) if the batch does
 * not settle.
 */
export async function waitForEvalBatch(
  db: PgFixture['handle']['db'],
  batchId: string,
  opts: { expectedRuns?: number; timeoutMs?: number } = {},
): Promise<{
  batch: typeof t.evalBatches.$inferSelect;
  runs: Array<typeof t.evalRuns.$inferSelect>;
}> {
  const { timeoutMs = 10_000 } = opts;
  const start = Date.now();
  for (;;) {
    const [batch] = await db.select().from(t.evalBatches).where(eq(t.evalBatches.id, batchId));
    if (batch && batch.status !== 'running') {
      const runs = await db.select().from(t.evalRuns).where(eq(t.evalRuns.batchId, batchId));
      if (runs.length >= (opts.expectedRuns ?? batch.casesTotal)) return { batch, runs };
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`eval batch ${batchId} did not settle within ${timeoutMs}ms (status: ${batch?.status ?? 'missing'})`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}
