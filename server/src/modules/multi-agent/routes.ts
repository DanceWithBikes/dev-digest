import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { MultiAgentRun, MultiAgentRunSummary, RunEstimate } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { makeMultiAgentService } from './compose.js';

/**
 * Multi-agent module (read side).
 *   GET /multi-agent-runs            → the 50 newest parent runs
 *   GET /multi-agent-runs/estimates  → one duration/cost estimate per agent
 *   GET /multi-agent-runs/:id        → one parent run with columns and location groups
 */
export default async function multiAgentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = makeMultiAgentService(app.container);

  app.get(
    '/multi-agent-runs',
    { schema: { response: { 200: z.array(MultiAgentRunSummary) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId);
    },
  );

  app.get(
    '/multi-agent-runs/estimates',
    { schema: { response: { 200: z.array(RunEstimate) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.estimates(workspaceId);
    },
  );

  // Not `IdParams`: a non-uuid id must answer 404, not 422 (AC-33).
  app.get(
    '/multi-agent-runs/:id',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: MultiAgentRun },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );
}
