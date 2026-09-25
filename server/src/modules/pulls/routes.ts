import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrMeta, PrDetail, PrReviewComment, SmartDiff } from '@devdigest/shared';
import { PrCommentInput, SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { makePullsService } from './compose.js';

/**
 * F1 — pulls module. PR import via Octokit (list + per-PR detail).
 *   GET  /repos/:id/pulls     → list PRs for a repo (open + recently merged/closed,
 *                               synced from GitHub, persisted). `status` is GitHub's
 *                               merge state (open/merged/closed).
 *   GET  /pulls/:id           → full PR detail (diff/files, commits, body, linked issue)
 *   GET  /pulls/:id/comments  → inline review comments, proxied live from GitHub
 *   POST /pulls/:id/comments  → create one inline comment / reply
 *   GET  /pulls/:id/smart-diff → Smart Diff: files grouped by role, with finding
 *                               anchors (Files-changed tab). No GitHub call, no
 *                               model call — cached summaries only.
 *   POST /pulls/:id/smart-diff/summaries → generate `pseudocode_summary` for
 *                               uncached `core`-group files (capped, rate-limited).
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL
 * and owned by A2 — this module only imports/reads.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = makePullsService(container, app.log);

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    return service.detail(workspaceId, req.params.id);
  });

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req): Promise<SmartDiff> => {
      const { workspaceId } = await getContext(container, req);
      return service.smartDiff(workspaceId, req.params.id);
    },
  );

  // Tight per-route limit, same as POST /pulls/:id/review and /pulls/:id/intent:
  // each call is up to SMART_DIFF_SUMMARY_LIMIT LLM completions.
  app.post(
    '/pulls/:id/smart-diff/summaries',
    {
      schema: { params: IdParams, response: { 200: SmartDiffResponse } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req): Promise<SmartDiff> => {
      const { workspaceId } = await getContext(container, req);
      return service.generateSummaries(workspaceId, req.params.id);
    },
  );

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listComments(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      return service.createComment(workspaceId, req.params.id, req.body);
    },
  );
}
