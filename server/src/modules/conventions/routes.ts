import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConventionCandidatePatch, ConventionSkillRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { makeConventionsService } from './compose.js';

/**
 * Conventions module.
 *   GET   /repos/:id/conventions          → every candidate for the repo
 *   POST  /repos/:id/conventions/extract  → run (or re-run) the scan, persist
 *   GET   /repos/:id/conventions/preview  → the skill the accepted ones would make
 *   POST  /repos/:id/conventions/skill    → write that skill, link it to an agent
 *   PATCH /conventions/:id                → accept / reject / edit one candidate
 *
 * Extraction runs inline rather than as a background job: it is one model call
 * over a bounded sample, and the page has nothing to show until it returns.
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = makeConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.get('/repos/:id/conventions/preview', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.previewBody(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: ConventionSkillRequest } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return skill;
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: ConventionCandidatePatch } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidate = await service.patch(workspaceId, req.params.id, req.body);
      if (!candidate) throw new NotFoundError('Convention candidate not found');
      return candidate;
    },
  );
}
