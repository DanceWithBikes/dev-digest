import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { PrIntentRecord } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

/**
 * Everything `upsertIntent` needs, minus `pr_id` (passed separately). Mirrors
 * `PrIntentRecord` plus the classifier's own cost, which lives only in this
 * table — `tokensIn`/`tokensOut`/`costUsd` are never part of the transport
 * contract, so per-agent `agent_runs` cost stays honest.
 */
export type UpsertIntentValues = Omit<PrIntentRecord, 'pr_id'> & {
  tokensIn?: number | null;
  tokensOut?: number | null;
  costUsd?: number | null;
};

export async function upsertIntent(db: Db, prId: string, values: UpsertIntentValues): Promise<void> {
  const set = {
    intent: values.intent,
    inScope: values.in_scope,
    outOfScope: values.out_of_scope,
    sources: values.sources ?? [],
    missingContext: values.missing_context ?? [],
    headSha: values.head_sha ?? null,
    bodySha: values.body_sha ?? null,
    provider: values.provider ?? null,
    model: values.model ?? null,
    tokensIn: values.tokensIn ?? null,
    tokensOut: values.tokensOut ?? null,
    costUsd: values.costUsd ?? null,
    generatedAt: values.generated_at ? new Date(values.generated_at) : null,
  };
  await db
    .insert(t.prIntent)
    .values({ prId, ...set })
    .onConflictDoUpdate({ target: t.prIntent.prId, set });
}

export async function getIntent(db: Db, prId: string): Promise<PrIntentRecord | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    sources: row.sources ?? [],
    missing_context: row.missingContext ?? [],
    head_sha: row.headSha,
    body_sha: row.bodySha,
    provider: row.provider,
    model: row.model,
    generated_at: row.generatedAt ? row.generatedAt.toISOString() : null,
  };
}

// ---- commits ----------------------------------------------------------
//
// `pr_commits` is written by the `pulls` module, and `no-cross-module-imports`
// forbids reaching into `pulls/repository.ts` from here — a repository may
// read any table, so this query lives in the `reviews` repository instead
// (rationale: plan §1 source 6).

export interface PrCommit {
  message: string;
  author: string;
  committedAt: Date | null;
}

/** A PR's commits, oldest first — a deterministic intent source. */
export async function commitsForPull(db: Db, prId: string): Promise<PrCommit[]> {
  return db
    .select({
      message: t.prCommits.message,
      author: t.prCommits.author,
      committedAt: t.prCommits.committedAt,
    })
    .from(t.prCommits)
    .where(eq(t.prCommits.prId, prId))
    .orderBy(asc(t.prCommits.committedAt));
}
