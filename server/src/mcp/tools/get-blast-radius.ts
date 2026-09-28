import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetBlastRadiusInput, GetBlastRadiusOutput } from '../schemas.js';

/**
 * `get_blast_radius` — STUB. The final input/output shapes are declared now
 * (`BlastRadius`, `contracts/brief.ts`) so a later lesson only swaps this
 * handler for the real `container.repoIntel.getBlastRadius` implementation.
 *
 * Always answers `isError: true`, never an empty `BlastRadius` — an empty
 * result reads as "nothing affected", a dangerous false negative for a tool
 * that has not actually looked. The SDK skips output-schema validation on an
 * `isError` result, so declaring `outputSchema` here is safe even though the
 * handler never produces `structuredContent`.
 */
export function registerGetBlastRadius(server: McpServer): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get blast radius (not implemented)',
      description:
        'Reserved for a future impact-analysis feature (which symbols a PR changes, and what calls them). ' +
        'NOT implemented yet — always returns an error. Do not call this expecting a real answer, and never ' +
        'read the absence of a result as "no impact".',
      inputSchema: GetBlastRadiusInput,
      outputSchema: GetBlastRadiusOutput,
      annotations: { title: 'Get blast radius (not implemented)', readOnlyHint: true, idempotentHint: true },
    },
    async () => ({
      content: [
        {
          type: 'text',
          text:
            'get_blast_radius is not implemented yet — no impact analysis was performed. ' +
            'Do not read this as "no impact"; it means the question was never answered.',
        },
      ],
      isError: true,
    }),
  );
}
