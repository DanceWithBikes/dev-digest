import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBrief, PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { makeBriefService } from './compose.js';

/**
 * PR Brief module (SPEC-03).
 *   GET  /pulls/:id/brief  → the stored brief, or null (never calls a model)
 *   POST /pulls/:id/brief  → generates synchronously (one model call) and returns the brief
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = makeBriefService(app.container, app.log);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getBrief(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBrief } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generate(workspaceId, req.params.id);
    },
  );
}
