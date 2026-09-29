import type { BlastRadius, ReviewRecord } from '@devdigest/shared';
import type { Container } from '../platform/container.js';
import { makeConventionsService } from '../modules/conventions/compose.js';
import { AgentsService } from '../modules/agents/service.js';
import { makePullsService } from '../modules/pulls/compose.js';
import { ReviewService } from '../modules/reviews/service.js';
import { makeBlastService } from '../modules/blast/compose.js';
import type { Logger } from './logger.js';
import type { AgentSelection, McpDeps, PrRef, RepoRef } from './ports.js';

/**
 * The only file in `src/mcp/` that sees the `Container` or a module's
 * service — same role `platform/container.ts` / `app.ts` play for the HTTP
 * surface (`mcp-compose-uses-services-not-repositories`: it wires SERVICES,
 * never a `repository.ts`, into `McpDeps`).
 *
 * Also tracks the run ids `run_agent_on_pr` started here, so `src/mcp.ts` can
 * drain them on shutdown — a run started by this process lives and dies with
 * it (stdio-only, no HTTP step: see `AGENTS.md`).
 */
export interface McpDepsWithLifecycle extends McpDeps {
  /** run ids this process has started via `run_agent_on_pr`, for shutdown drain. */
  trackedRunIds(): string[];
  /** Wait up to `ms` for tracked runs to finish, then cancel any still running. */
  drain(ms: number): Promise<void>;
}

export function buildMcpDeps(container: Container, log: Logger): McpDepsWithLifecycle {
  const pulls = makePullsService(container, log);
  const reviews = new ReviewService(container);
  const agents = new AgentsService(container);
  const conventions = makeConventionsService(container);
  const blast = makeBlastService(container, log);
  const startedRunIds = new Set<string>();

  async function workspaceId(): Promise<string> {
    const workspace = await container.auth.currentWorkspace(undefined);
    return workspace.id;
  }

  async function resolveRepo(workspaceId: string, ref: RepoRef) {
    return pulls.resolveRepo(workspaceId, ref);
  }

  /** Either `pr.prId` directly, or a repo+number lookup — shared by `runAgentOnPr` and `getBlastRadius`. */
  async function resolvePrId(workspaceId: string, pr: PrRef): Promise<string> {
    if (pr.kind === 'id') return pr.prId;
    const repo = await pulls.resolveRepo(workspaceId, { fullName: pr.fullName });
    const pull = await pulls.resolvePull(workspaceId, repo.id, pr.number);
    return pull.id;
  }

  async function getBlastRadius(workspaceId: string, pr: PrRef): Promise<BlastRadius> {
    const prId = await resolvePrId(workspaceId, pr);
    return blast.forPull(workspaceId, prId);
  }

  async function runAgentOnPr(workspaceId: string, pr: PrRef, selection: AgentSelection) {
    const prId = await resolvePrId(workspaceId, pr);
    const targets = await reviews.resolveTargets(
      workspaceId,
      selection.kind === 'all' ? { all: true } : { agentId: selection.agentId },
    );
    const { runs } = await reviews.runReview(workspaceId, prId, targets, log);
    for (const run of runs) startedRunIds.add(run.run_id);
    return { pr_id: prId, runs };
  }

  async function drain(ms: number): Promise<void> {
    if (startedRunIds.size === 0) return;
    const ws = await workspaceId();
    const deadline = Date.now() + ms;
    let pending = [...startedRunIds];
    while (pending.length > 0 && Date.now() < deadline) {
      const statuses = await Promise.all(
        pending.map(async (runId) => {
          try {
            const { run } = await reviews.getRunResult(ws, runId);
            return { runId, running: run.status === 'queued' || run.status === 'running' };
          } catch {
            return { runId, running: false };
          }
        }),
      );
      pending = statuses.filter((s) => s.running).map((s) => s.runId);
      if (pending.length > 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    for (const runId of pending) {
      log.info({ runId }, 'devdigest-mcp: draining — cancelling a run still in flight at shutdown');
      await reviews.cancelRun(runId).catch(() => undefined);
    }
  }

  return {
    workspaceId,
    listAgents: (ws) => agents.list(ws),
    resolveRepo,
    runAgentOnPr,
    // `ReviewService#getRunResult`'s `verdict` is a bare `string | null` (read
    // straight off the `text` column); the transport contract narrows it to
    // the `Verdict` enum every persisted value actually satisfies (the model's
    // structured output is schema-constrained before it is ever stored).
    getRunResult: async (ws, runId) => {
      const result = await reviews.getRunResult(ws, runId);
      return { run: result.run, review: result.review as ReviewRecord | null };
    },
    listConventions: (ws, repoId) => conventions.list(ws, repoId),
    previewConventionsSkillBody: async (ws, repoId) => (await conventions.previewBody(ws, repoId)).body,
    getBlastRadius,
    trackedRunIds: () => [...startedRunIds],
    drain,
  };
}
