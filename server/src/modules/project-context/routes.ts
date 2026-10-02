import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AgentContextSelection,
  ContextListing,
  ContextPreview,
  ContextSelection,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { makeProjectContextService } from './compose.js';
import { MAX_GLOB_LENGTH, MAX_ROOTS } from './constants.js';
import { validateRelativePath, validateRoot } from './helpers.js';

/**
 * Project Context module.
 *   GET  /repos/:id/context                  → live listing of the repo's documents
 *   POST /repos/:id/context/reindex          → rescan, same shape
 *   GET  /repos/:id/context/file?path=       → one document's full text
 *   PUT  /repos/:id/context/roots            → save the repo's search roots
 *   GET/PUT /repos/:id/context/agents/:agentId → an agent's attached paths
 *   GET/PUT /repos/:id/context/skills/:skillId → a skill's attached paths
 *
 * Invalid roots or paths answer 422 (the house convention for validation).
 */
const pathValue = z.string().refine((p) => validateRelativePath(p) === null, {
  message: 'path must be repo-relative, non-empty and free of ".." and ".git" segments',
});
const rootValue = z
  .string()
  .max(MAX_GLOB_LENGTH)
  .refine((r) => validateRoot(r) === null, {
    message: 'search root must be a relative, valid glob without ".." segments',
  });

const RootsBody = z.object({ roots: z.array(rootValue).max(MAX_ROOTS) });
const SelectionBody = z.object({ paths: z.array(pathValue) });
const FileQuery = z.object({ path: pathValue });
const AgentParams = IdParams.extend({ agentId: z.string().uuid() });
const SkillParams = IdParams.extend({ skillId: z.string().uuid() });

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = makeProjectContextService(app.container);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ContextListing } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/context/reindex',
    { schema: { params: IdParams, response: { 200: ContextListing } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.reindex(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery, response: { 200: ContextPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.preview(workspaceId, req.params.id, req.query.path);
    },
  );

  app.put(
    '/repos/:id/context/roots',
    { schema: { params: IdParams, body: RootsBody, response: { 200: ContextListing } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.saveRoots(workspaceId, req.params.id, req.body.roots);
    },
  );

  app.get(
    '/repos/:id/context/agents/:agentId',
    { schema: { params: AgentParams, response: { 200: AgentContextSelection } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getAgentSelection(workspaceId, req.params.id, req.params.agentId);
    },
  );

  app.put(
    '/repos/:id/context/agents/:agentId',
    {
      schema: { params: AgentParams, body: SelectionBody, response: { 200: AgentContextSelection } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.saveAgentSelection(
        workspaceId,
        req.params.id,
        req.params.agentId,
        req.body.paths,
      );
    },
  );

  app.get(
    '/repos/:id/context/skills/:skillId',
    { schema: { params: SkillParams, response: { 200: ContextSelection } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getSkillSelection(workspaceId, req.params.id, req.params.skillId);
    },
  );

  app.put(
    '/repos/:id/context/skills/:skillId',
    { schema: { params: SkillParams, body: SelectionBody, response: { 200: ContextSelection } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.saveSkillSelection(
        workspaceId,
        req.params.id,
        req.params.skillId,
        req.body.paths,
      );
    },
  );
}
