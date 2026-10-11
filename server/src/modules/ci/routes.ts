import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CiExportInput,
  CiExportResult,
  CiInstallation,
  CiPreview,
  CiPreviewQuery,
  CiRunsPage,
  CiRunsQuery,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { makeCiService } from './compose.js';

/**
 * A single `?triggers=opened` arrives as a string, repeated keys as an array;
 * normalise to an array before the shared contract validates it.
 */
const PreviewQuery = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null) return raw;
  const q = raw as Record<string, unknown>;
  return typeof q.triggers === 'string' ? { ...q, triggers: [q.triggers] } : q;
}, CiPreviewQuery);

/**
 * Export-to-CI module.
 *   GET  /agents/:id/export-ci/preview → the generated bundle for a repo (no GitHub call)
 *   POST /agents/:id/export-ci         → open/update the PR on devdigest/ci, or return a zip
 *   GET  /agents/:id/ci-installations  → the agent's CI installations
 *   GET  /ci-runs                      → refresh from GitHub, then the stored CI runs (50 per page)
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = makeCiService(app.container, app.log);

  app.get(
    '/agents/:id/export-ci/preview',
    { schema: { params: IdParams, querystring: PreviewQuery, response: { 200: CiPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.preview(workspaceId, req.params.id, req.query);
    },
  );

  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: CiExportInput, response: { 200: CiExportResult } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.export(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/agents/:id/ci-installations',
    { schema: { params: IdParams, response: { 200: z.array(CiInstallation) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listInstallations(workspaceId, req.params.id);
    },
  );

  app.get(
    '/ci-runs',
    { schema: { querystring: CiRunsQuery, response: { 200: CiRunsPage } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listRuns(workspaceId, req.query);
    },
  );
}
