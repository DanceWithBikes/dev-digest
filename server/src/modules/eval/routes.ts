import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalBatch,
  EvalBatchDetail,
  EvalCaseFromFindingInput,
  EvalCaseRecord,
  EvalCaseUpsert,
  EvalOverview,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { makeEvalService } from './compose.js';

/**
 * Eval module.
 *   POST   /findings/:id/eval-case    → one-click case from a decided finding (201 new, 200 existing)
 *   GET    /agents/:id/eval-cases     → the agent's cases, each with its last run
 *   POST   /agents/:id/eval-cases     → create a manual case (201)
 *   PUT    /eval-cases/:id            → replace a case
 *   DELETE /eval-cases/:id            → delete a case and its runs (204)
 *   POST   /agents/:id/eval-runs      → start a batch in the background (202)
 *   GET    /agents/:id/eval-runs      → the agent's batches, newest first (≤ 50)
 *   GET    /eval-runs/:id             → one batch with its per-case runs
 *   GET    /eval/overview             → per-agent summaries + the 20 newest batches
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = makeEvalService(app.container, app.log);

  app.post(
    '/findings/:id/eval-case',
    {
      schema: {
        params: IdParams,
        body: EvalCaseFromFindingInput.nullish(),
        response: { 200: EvalCaseRecord, 201: EvalCaseRecord },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const { created, case: record } = await service.createFromFinding(
        workspaceId,
        req.params.id,
        req.body,
      );
      reply.status(created ? 201 : 200);
      return record;
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseRecord) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseUpsert, response: { 201: EvalCaseRecord } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createCase(workspaceId, req.params.id, req.body);
      reply.status(201);
      return created;
    },
  );

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCaseUpsert, response: { 200: EvalCaseRecord } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams, response: { 204: z.null() } } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.deleteCase(workspaceId, req.params.id);
    reply.status(204);
    return null;
  });

  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 202: EvalBatch } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const batch = await service.startBatch(workspaceId, req.params.id);
      reply.status(202);
      return batch;
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalBatch) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listBatches(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalBatchDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getBatch(workspaceId, req.params.id);
    },
  );

  app.get('/eval/overview', { schema: { response: { 200: EvalOverview } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.overview(workspaceId);
  });
}
