import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { BlastRadius, PrHistory } from '@devdigest/shared';
import { BlastRadiusResponse, PrHistoryResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { makeBlastService } from './compose.js';

/**
 * Blast Radius — which callers, HTTP endpoints and crons a PR's changed
 * symbols can affect, read from the precomputed repo-intel index (no
 * re-parsing, no model call).
 *   GET /pulls/:id/blast      → the map (studio card, `get_blast_radius` MCP tool)
 *   GET /pulls/:id/prior-prs  → merged PRs that previously touched these files
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = makeBlastService(container, app.log);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req): Promise<BlastRadius> => {
      const { workspaceId } = await getContext(container, req);
      return service.forPull(workspaceId, req.params.id);
    },
  );

  // Tight per-route limit, same precedent as pulls/routes.ts's smart-diff-summaries
  // route: each call fans out to GitHub per changed file.
  app.get(
    '/pulls/:id/prior-prs',
    {
      schema: { params: IdParams, response: { 200: PrHistoryResponse } },
      config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
    },
    async (req): Promise<PrHistory> => {
      const { workspaceId } = await getContext(container, req);
      return service.priorPrs(workspaceId, req.params.id);
    },
  );
}
