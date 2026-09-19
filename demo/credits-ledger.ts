/**
 * Workspace credit ledger: prepaid credits that review runs draw down from.
 * Balance reads, the activity feed, usage stats, promo grants, and the support
 * tools for inspecting and correcting entries.
 *
 * Amounts are signed cents: grants and refunds are positive, usage is negative.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import { creditEntries } from "./schema";

type Db = PostgresJsDatabase;

export class NotFoundError extends Error {
  readonly statusCode = 404;
}

/** Current balance in cents: every grant and refund minus every charge. */
export async function getBalance(db: Db, workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${creditEntries.amountCents}), 0)`.mapWith(Number) })
    .from(creditEntries)
    .where(eq(creditEntries.workspaceId, workspaceId));
  return row.total;
}

/** Whether the workspace has any credit left (drives the "top up" banner). */
export async function hasCredit(db: Db, workspaceId: string): Promise<boolean> {
  const balance = await getBalance(db, workspaceId);
  if (balance !== null && balance !== undefined && balance > 0) {
    return true;
  }
  return false;
}

/** Balances for the billing overview page, keyed by workspace id. */
export async function getBalances(db: Db, workspaceIds: string[]): Promise<Record<string, number>> {
  const balances: Record<string, number> = {};
  for (const workspaceId of workspaceIds) {
    balances[workspaceId] = await getBalance(db, workspaceId);
  }
  return balances;
}

/** Query string of the activity-feed route; validated before listRecentEntries runs. */
export const recentEntriesQuery = z.object({
  limit: z.coerce.number().int().positive().default(50),
});

export type RecentEntriesQuery = z.infer<typeof recentEntriesQuery>;

/** Activity feed: the workspace's newest ledger entries from the last 30 days. */
export async function listRecentEntries(db: Db, workspaceId: string, query: RecentEntriesQuery) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(creditEntries)
    .where(and(eq(creditEntries.workspaceId, workspaceId), gte(creditEntries.createdAt, since)))
    .orderBy(desc(creditEntries.createdAt))
    .limit(query.limit);
}

/** Dashboard tile: spend over the last 30 days and the average charge per review run. */
export async function getUsageStats(db: Db, workspaceId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      spentCents: sql<number>`coalesce(-sum(${creditEntries.amountCents}), 0)`.mapWith(Number),
      runCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.workspaceId, workspaceId),
        eq(creditEntries.kind, "usage"),
        gte(creditEntries.createdAt, since),
      ),
    );
  return {
    spentCents: row.spentCents,
    runCount: row.runCount,
    avgRunCostCents: Math.round(row.spentCents / row.runCount),
  };
}

/** Promo: grant the same credit to each workspace; resolves to how many were credited. */
export async function grantToWorkspaces(db: Db, workspaceIds: string[], amountCents: number): Promise<number> {
  workspaceIds.forEach(async (workspaceId) => {
    await db.insert(creditEntries).values({ workspaceId, kind: "grant", amountCents });
  });
  return workspaceIds.length;
}

/** The charge recorded for a review run. Throws NotFoundError if the run was never charged. */
export async function getRunCharge(db: Db, workspaceId: string, runId: string) {
  const matches = await db
    .select()
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.workspaceId, workspaceId),
        eq(creditEntries.runId, runId),
        eq(creditEntries.kind, "usage"),
      ),
    )
    .limit(1);
  if (!matches) {
    throw new NotFoundError(`run ${runId} has no recorded charge`);
  }
  const [charge] = matches;
  return { runId, costCents: -charge.amountCents, chargedAt: charge.createdAt };
}

/** Support tool: remove a mistaken entry from a workspace's ledger. */
export async function deleteEntry(db: Db, workspaceId: string, entryId: string): Promise<void> {
  const deleted = await db
    .delete(creditEntries)
    .where(eq(creditEntries.id, entryId))
    .returning({ id: creditEntries.id });
  if (deleted.length === 0) {
    throw new NotFoundError(`entry ${entryId} not found in workspace ${workspaceId}`);
  }
}

function toDollars(cents: number): number {
  return cents / 100;
}
