/**
 * Structured JSON-line logger for the MCP stdio process — STDERR only.
 *
 * stdout is the JSON-RPC transport for this process; a single stray line on
 * it (a `console.log`, a library's own logger, a Postgres NOTICE) corrupts
 * every message the client tries to parse afterwards. Everything that would
 * normally go to pino here goes to `process.stderr` instead.
 *
 * Shape matches the pino-compatible `Logger` `modules/reviews/run-executor.ts`
 * expects (`info`/`warn`/`error`/`debug`, `(obj, msg?)`) — declared locally,
 * not imported from there, so this file stays free of `src/modules/` per
 * `mcp-tools-talk-to-ports`. `compose.ts` passes this logger into
 * `ReviewService#runReview`, where TypeScript's structural typing accepts it
 * without either side importing the other's type.
 */
export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

function toFields(obj: unknown): Record<string, unknown> {
  if (obj instanceof Error) return { err: obj.message, stack: obj.stack };
  if (obj && typeof obj === 'object') return obj as Record<string, unknown>;
  if (obj === undefined) return {};
  return { data: obj };
}

function write(level: keyof Logger, obj: unknown, msg?: string): void {
  const line = { level, time: new Date().toISOString(), msg: msg ?? null, ...toFields(obj) };
  process.stderr.write(`${JSON.stringify(line)}\n`);
}

export const mcpLogger: Logger = {
  info: (obj, msg) => write('info', obj, msg),
  warn: (obj, msg) => write('warn', obj, msg),
  error: (obj, msg) => write('error', obj, msg),
  debug: (obj, msg) => write('debug', obj, msg),
};
