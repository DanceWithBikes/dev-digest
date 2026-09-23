import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillImportRequest, SkillRestoreRequest, SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { makeSkillsService } from './compose.js';
import { MAX_DESCRIPTION_CHARS, MAX_SKILL_BODY_CHARS } from './constants.js';

/**
 * Skills module.
 *   GET    /skills              → list (workspace-scoped, by name)
 *   GET    /skills/:id          → one skill
 *   POST   /skills              → create
 *   PUT    /skills/:id          → update body/metadata, or toggle `enabled`
 *   DELETE /skills/:id          → delete (agent links cascade)
 *   GET    /skills/:id/versions → body history (newest first)
 *   POST   /skills/:id/restore  → re-apply an old body as a NEW version
 *   POST   /skills/parse        → parse markdown or a .zip into a draft; WRITES NOTHING
 *
 * `/skills/parse` is the preview half of import: it cannot persist, so the
 * "nothing is saved until you confirm" guarantee is structural. Confirming is a
 * plain POST /skills with `source: 'imported_file'`.
 */

const CreateSkillBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(MAX_DESCRIPTION_CHARS),
  type: SkillType,
  body: z.string().min(1).max(MAX_SKILL_BODY_CHARS),
  source: SkillSource.optional(),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = CreateSkillBody.omit({ source: true }).partial();

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = makeSkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  // Registered before `/skills/:id` so "parse" is never read as a uuid param.
  app.post('/skills/parse', { schema: { body: SkillImportRequest } }, async (req) => {
    await getContext(app.container, req);
    return service.parse(req.body);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = req.body;
    const skill = await service.create(workspaceId, {
      name: body.name,
      description: body.description,
      type: body.type,
      body: body.body,
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    });
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  // Its own third segment, so it can never be confused with `/skills/:id` —
  // unlike `/skills/parse`, which had to be registered first. The service raises
  // the 404 itself: it is the only layer that can tell "no such skill" apart
  // from "no such version".
  app.post(
    '/skills/:id/restore',
    { schema: { params: IdParams, body: SkillRestoreRequest } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.restore(workspaceId, req.params.id, req.body.version);
    },
  );
}
