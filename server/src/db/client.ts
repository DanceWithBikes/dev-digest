import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { schema } from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

/**
 * Create a Drizzle client over postgres-js. Used by the app (one shared handle),
 * the Testcontainers harness (per-test handle) and the MCP stdio entrypoint.
 */
export function createDb(
  databaseUrl: string,
  opts?: { max?: number; /** postgres.js logs server NOTICEs to stdout by default; the
   *  MCP process's stdout is the JSON-RPC transport, so it must supply one. */
    onnotice?: (notice: postgres.Notice) => void },
): DbHandle {
  const sql = postgres(databaseUrl, {
    max: opts?.max ?? 10,
    ...(opts?.onnotice ? { onnotice: opts.onnotice } : {}),
  });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
