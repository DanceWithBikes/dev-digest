import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { OnboardingGenerateAccepted, OnboardingTourResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { makeOnboardingService } from './compose.js';

/**
 * Onboarding Tour module (SPEC-02).
 *   GET  /repos/:id/onboarding            → the stored tour (or null) + stale/generating flags
 *   POST /repos/:id/onboarding/generate   → 202; builds the tour in the background
 *
 * A generation is never started by a GET (AC-63).
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = makeOnboardingService(app.container, app.log);

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: OnboardingTourResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getTour(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding/generate',
    { schema: { params: IdParams, response: { 202: OnboardingGenerateAccepted } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const accepted = await service.requestGeneration(workspaceId, req.params.id);
      reply.status(202);
      return accepted;
    },
  );
}
