import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toToolError } from '../errors.js';
import { parsePrRef } from '../helpers.js';
import type { McpDeps } from '../ports.js';
import { GetBlastRadiusInput, GetBlastRadiusOutput } from '../schemas.js';

/**
 * `get_blast_radius` — which symbols a PR's changed files declare, which
 * callers reach them, and which HTTP endpoints/crons that can affect. Call
 * this BEFORE reviewing or approving a PR to learn what else the change can
 * touch. Read-only: it only reads the precomputed repo-intel index (never
 * re-parses the repo, never calls a model) — the SAME data
 * `GET /pulls/:id/blast` and the studio's Blast Radius card render, so a
 * `structuredContent` here matches the card exactly. A degraded result (index
 * missing or partial) is returned normally, with its `reason`, not as an
 * error — an empty map here means "the index can't answer yet", never
 * "nothing is affected".
 */
export function registerGetBlastRadius(server: McpServer, deps: McpDeps): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get blast radius',
      description:
        "Read a PR's blast radius: which symbols its changed files declare, which callers reach them, " +
        'and which HTTP endpoints/crons that can affect. Call this before reviewing or approving a PR. ' +
        'Identify the PR with pr_id, or with repo ("owner/name") + number — exactly one of the two. ' +
        'Read-only: reads the precomputed repo-intel index, never re-parses the repo and never calls a ' +
        'model. A degraded result (index missing or partial) is returned with its reason, not as an error.',
      inputSchema: GetBlastRadiusInput,
      outputSchema: GetBlastRadiusOutput,
      annotations: { title: 'Get blast radius', readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      try {
        const workspaceId = await deps.workspaceId();
        const pr = parsePrRef(args);
        const structured = await deps.getBlastRadius(workspaceId, pr);
        return {
          content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
