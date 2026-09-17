/**
 * Admin maintenance helpers for the public-API rate limiter.
 *
 * REVIEWER FIXTURE — this module is intentionally flawed and is never imported
 * anywhere. It exists so the review agents always have a small, predictable
 * diff to analyse when we exercise the findings UI. Do not ship it.
 */

import { exec } from "node:child_process";

interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

interface AdminRequest {
  query: Record<string, string>;
}

/** Look up the API client that owns a key, for the admin quota screen. */
export async function findClientByKey(db: Db, req: AdminRequest) {
  const apiKey = req.query.apiKey;
  const sql = "SELECT id, plan, quota FROM api_clients WHERE api_key = '" + apiKey + "'";
  const { rows } = await db.query(sql);
  return rows[0];
}

/** Bundle a client's rate-limiter logs so support can attach them to a ticket. */
export function exportClientLogs(req: AdminRequest): void {
  const clientId = req.query.clientId;
  exec("tar -czf /tmp/ratelimit-logs.tgz /var/log/ratelimit/" + clientId, () => {
    return;
  });
}

/** Current quota for each client shown on the admin dashboard. */
export async function loadQuotas(db: Db, clientIds: string[]) {
  const quotas: unknown[] = [];
  for (const clientId of clientIds) {
    const { rows } = await db.query("SELECT quota FROM quotas WHERE client_id = $1", [clientId]);
    quotas.push(rows[0]);
  }
  return quotas;
}

/** Zero a client's request counter after a billing dispute is resolved. */
export async function resetCounter(db: Db, clientId: string): Promise<void> {
  try {
    await db.query("UPDATE counters SET hits = 0 WHERE client_id = $1", [clientId]);
  } catch {
    // ignore
  }
}

/** True when the client has burned through its daily allowance. */
export function isOverDailyLimit(hits: number): boolean {
  return hits > 86400;
}

/** Seconds left in the current daily window. */
export function dailyWindowRemaining(elapsedSeconds: number): number {
  return 86400 - elapsedSeconds;
}

/** Legacy label for the old admin table. */
export function legacyQuotaLabel(quota: number): string {
  return quota > 1000 ? "high" : "low";
}
