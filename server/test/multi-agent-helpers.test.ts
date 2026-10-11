/**
 * SPEC-05 multi-agent DTO mappers and read service (pure; the service runs on
 * an in-memory MultiAgentStore fake). Pins the contract shapes (AC-4-AC-12),
 * the 404 for non-uuid ids (AC-33), one estimate per agent (AC-58) and that no
 * model call is made (AC-57: the service has no LLM dependency at all).
 */
import { describe, it, expect } from 'vitest';
import { MultiAgentRun, MultiAgentRunSummary, RunEstimate } from '@devdigest/shared';
import { toFindingRecord, toMultiAgentRunDto, toSummaryDto } from '../src/modules/multi-agent/helpers.js';
import { MultiAgentService } from '../src/modules/multi-agent/service.js';
import { LIST_LIMIT } from '../src/modules/multi-agent/constants.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { ChildRun, GroupableFinding, ParentRow, EstimateSample } from '../src/modules/multi-agent/domain.js';
import type { MultiAgentStore, ParentDetail, ParentWithChildren } from '../src/modules/multi-agent/ports.js';

const parent: ParentRow = {
  id: '11111111-1111-4111-8111-111111111111',
  prId: 'pr-1',
  prNumber: 484,
  prTitle: 'Rename param',
  agentIds: ['ag-b', 'ag-a'],
  createdAt: '2026-05-12T09:30:00.000Z',
};

function child(id: string, agentId: string | null, over: Partial<ChildRun> = {}): ChildRun {
  return {
    id,
    agentId,
    agentName: agentId ? `Name ${agentId}` : null,
    provider: 'openai',
    model: 'gpt',
    status: 'done',
    error: null,
    score: 70,
    summary: 'sum',
    verdict: 'comment',
    durationMs: 2000,
    costUsd: 0.01,
    startedAt: new Date('2026-05-12T09:30:01Z'),
    finishedAt: new Date('2026-05-12T09:30:05Z'),
    ...over,
  };
}

function finding(id: string, runId: string, agentId: string): GroupableFinding {
  return {
    id,
    severity: 'WARNING',
    category: 'bug',
    title: 'Breaking rename',
    file: 'a.ts',
    start_line: 5,
    end_line: 5,
    rationale: 'r',
    suggestion: null,
    confidence: 0.7,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    review_id: 'rev',
    accepted_at: null,
    dismissed_at: null,
    learned_at: null,
    agentId,
    runId,
  };
}

describe('multi-agent DTO mappers', () => {
  it('toFindingRecord drops the grouping-only fields', () => {
    const rec = toFindingRecord(finding('f1', 'r1', 'ag-a'));
    expect(rec).not.toHaveProperty('agentId');
    expect(rec).not.toHaveProperty('runId');
    expect(rec.id).toBe('f1');
  });

  it('toSummaryDto matches the summary contract with status and totals', () => {
    const dto = toSummaryDto(parent, [child('r1', 'ag-a'), child('r2', 'ag-b', { costUsd: null, status: 'failed' })]);
    expect(MultiAgentRunSummary.parse(dto)).toEqual(dto);
    expect(dto).toMatchObject({
      id: parent.id,
      pr_number: 484,
      ran_at: parent.createdAt,
      status: 'partial',
      agent_count: 2,
      total_cost_usd: 0.01,
      cost_partial: true,
      total_duration_ms: 4000,
    });
  });

  it('toMultiAgentRunDto orders columns by selection, scopes findings per column and nulls a failed score', () => {
    const kids = [child('r-a', 'ag-a'), child('r-b', 'ag-b', { status: 'failed', error: 'boom' })];
    const dto = toMultiAgentRunDto(parent, kids, [finding('f1', 'r-a', 'ag-a')]);
    expect(MultiAgentRun.parse(dto)).toEqual(dto);
    expect(dto.columns.map((c) => c.agent_id)).toEqual(['ag-b', 'ag-a']);
    expect(dto.columns[0]).toMatchObject({ status: 'failed', score: null, error: 'boom', findings: [] });
    expect(dto.columns[1]!.score).toBe(70);
    expect(dto.columns[1]!.findings.map((f) => f.id)).toEqual(['f1']);
    expect(dto.groups).toHaveLength(1);
    expect(dto.groups[0]!.takes.map((t) => t.verdict)).toEqual(['no_result', 'WARNING']);
  });
});

class FakeStore implements MultiAgentStore {
  listLimits: number[] = [];
  constructor(
    private parents: ParentWithChildren[] = [],
    private detail: ParentDetail | null = null,
    private agentIds: string[] = [],
    private samples: EstimateSample[] = [],
  ) {}
  async listParents(_w: string, limit: number) {
    this.listLimits.push(limit);
    return this.parents;
  }
  async getParent() {
    return this.detail;
  }
  async listAgentIds() {
    return this.agentIds;
  }
  async estimateSamples() {
    return this.samples;
  }
}

describe('MultiAgentService (in-memory store)', () => {
  it('list asks the store for LIST_LIMIT parents and maps each to a summary', async () => {
    const store = new FakeStore([{ parent, children: [child('r1', 'ag-a')] }]);
    const out = await new MultiAgentService({ store }).list('ws');
    expect(store.listLimits).toEqual([LIST_LIMIT]);
    expect(out).toHaveLength(1);
    expect(out[0]!.status).toBe('done');
  });

  it('get throws NotFoundError for a non-uuid id without querying the store (AC-33)', async () => {
    const store = new FakeStore(
      [],
      { parent, children: [], findings: [] },
    );
    await expect(new MultiAgentService({ store }).get('ws', 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('get throws NotFoundError when the store has no such parent (AC-33)', async () => {
    const svc = new MultiAgentService({ store: new FakeStore() });
    await expect(svc.get('ws', parent.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('get returns the full run when found', async () => {
    const store = new FakeStore([], { parent, children: [child('r-a', 'ag-a')], findings: [] });
    const run = await new MultiAgentService({ store }).get('ws', parent.id);
    expect(run.columns).toHaveLength(1);
  });

  it('estimates returns one row per agent, runs 0 for an agent without samples (AC-58, AC-60)', async () => {
    const store = new FakeStore([], null, ['ag-a', 'ag-b'], [
      { agentId: 'ag-a', durationMs: 1000, costUsd: 0.1 },
      { agentId: 'ag-a', durationMs: 3000, costUsd: 0.3 },
    ]);
    const out = await new MultiAgentService({ store }).estimates('ws');
    expect(RunEstimate.array().parse(out)).toEqual(out);
    expect(out).toEqual([
      { agent_id: 'ag-a', median_duration_ms: 2000, median_cost_usd: 0.2, runs: 2 },
      { agent_id: 'ag-b', median_duration_ms: null, median_cost_usd: null, runs: 0 },
    ]);
  });
});
