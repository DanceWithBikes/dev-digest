import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './platform/config.js';
import { createDb } from './db/client.js';
import { Container } from './platform/container.js';
import { buildMcpDeps } from './mcp/compose.js';
import { mcpLogger } from './mcp/logger.js';
import { createDevDigestMcpServer } from './mcp/server.js';

/**
 * MCP stdio entrypoint (`pnpm mcp`, wired from `.mcp.json`). Sibling of
 * `server.ts`, but a DIFFERENT composition root: this process speaks the
 * Model Context Protocol over stdio, never HTTP.
 *
 * stdout is the JSON-RPC transport — a single stray byte on it corrupts every
 * message the client parses afterwards. That is why:
 *  - `console.log` is redirected to stderr below (some dependency may still
 *    call it; `console.error`/`console.warn` already go to stderr natively);
 *  - `createDb` is given an `onnotice` no-op — postgres.js logs server NOTICEs
 *    (`db:migrate`'s "already exists, skipping") to stdout otherwise;
 *  - `mcpLogger` (`./mcp/logger.js`) writes structured JSON lines to stderr,
 *    never pino's default stdout transport.
 *
 * UNLIKE `app.ts`, this entrypoint never calls `reapStaleRuns` on boot: an MCP
 * session shares the same Postgres as a possibly-running API instance, and
 * reaping on every `claude mcp` launch would mark that instance's in-flight
 * runs failed out from under it. See `docs/insights.md` for the known
 * limitations of running reviews inside this (stdio-only) process.
 */

const MCP_DRAIN_MS = 20_000;

// eslint-disable-next-line no-console -- the one sanctioned reassignment: stdout is the transport.
console.log = (...args: unknown[]) => {
  process.stderr.write(`${args.map(String).join(' ')}\n`);
};

async function main(): Promise<void> {
  const config = loadConfig();
  const handle = createDb(config.databaseUrl, { onnotice: () => {} });
  const container = new Container(config, handle.db);
  const deps = buildMcpDeps(container, mcpLogger);
  const server = createDevDigestMcpServer(deps);

  process.on('unhandledRejection', (err) => {
    mcpLogger.error({ err: err instanceof Error ? err.message : String(err) }, 'devdigest-mcp: unhandled rejection');
  });

  let shuttingDown = false;
  const shutdown = async (reason: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    mcpLogger.info({ reason }, 'devdigest-mcp: shutting down');
    await deps.drain(MCP_DRAIN_MS).catch((err) => mcpLogger.error({ err }, 'devdigest-mcp: drain failed'));
    await server.close().catch(() => undefined);
    await handle.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  // The client (Claude Code) closes stdin when it ends the session — the only
  // reliable "session over" signal for a stdio server with no socket to watch.
  process.stdin.once('close', () => void shutdown('stdin closed'));

  await server.connect(new StdioServerTransport());
  mcpLogger.info({}, 'devdigest-mcp: connected over stdio');
}

main().catch((err) => {
  mcpLogger.error({ err: err instanceof Error ? err.message : String(err) }, 'devdigest-mcp: failed to start');
  process.exit(1);
});
