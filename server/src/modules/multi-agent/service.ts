import type { MultiAgentRun, MultiAgentRunSummary, RunEstimate } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { isUuid } from '../_shared/uuid.js';
import { LIST_LIMIT } from './constants.js';
import { toEstimate, type EstimateSample } from './domain.js';
import { toMultiAgentRunDto, toSummaryDto } from './helpers.js';
import type { MultiAgentStore } from './ports.js';

export interface MultiAgentServiceDeps {
  store: MultiAgentStore;
}

export class MultiAgentService {
  constructor(private readonly deps: MultiAgentServiceDeps) {}

  async list(workspaceId: string): Promise<MultiAgentRunSummary[]> {
    const rows = await this.deps.store.listParents(workspaceId, LIST_LIMIT);
    return rows.map((r) => toSummaryDto(r.parent, r.children));
  }

  /** A non-uuid id names no run, so it is a 404 like any missing one (AC-33). */
  async get(workspaceId: string, id: string): Promise<MultiAgentRun> {
    if (!isUuid(id)) throw new NotFoundError('Multi-agent run not found');
    const detail = await this.deps.store.getParent(workspaceId, id);
    if (!detail) throw new NotFoundError('Multi-agent run not found');
    return toMultiAgentRunDto(detail.parent, detail.children, detail.findings);
  }

  /** One estimate per agent of the workspace; agents with no finished run get runs 0. */
  async estimates(workspaceId: string): Promise<RunEstimate[]> {
    const [agentIds, samples] = await Promise.all([
      this.deps.store.listAgentIds(workspaceId),
      this.deps.store.estimateSamples(workspaceId),
    ]);
    const byAgent = new Map<string, EstimateSample[]>();
    for (const s of samples) byAgent.set(s.agentId, [...(byAgent.get(s.agentId) ?? []), s]);
    return agentIds.map((id) => toEstimate(id, byAgent.get(id) ?? []));
  }
}
