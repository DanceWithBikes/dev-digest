/**
 * SPEC-05 multi-agent domain rules (pure, no Docker): parent status and totals
 * (AC-34-AC-41), column order, location grouping (AC-42-AC-49), takes and
 * conflicts (AC-51-AC-56), estimates (AC-59, AC-60).
 */
import { describe, it, expect } from 'vitest';
import {
  buildLocationGroups,
  buildTakes,
  columnScore,
  deriveParentStatus,
  groupFindings,
  isConflict,
  median,
  normaliseTitle,
  orderColumns,
  parentTotals,
  titleSimilarity,
  toEstimate,
  type ChildRun,
  type ChildStatus,
  type EstimateSample,
  type GroupableFinding,
} from '../src/modules/multi-agent/domain.js';

function child(id: string, over: Partial<ChildRun> = {}): ChildRun {
  return {
    id,
    agentId: `agent-${id}`,
    agentName: `Agent ${id}`,
    provider: 'openai',
    model: 'm',
    status: 'done',
    error: null,
    score: 80,
    summary: null,
    verdict: null,
    durationMs: 1000,
    costUsd: 0.01,
    startedAt: null,
    finishedAt: null,
    ...over,
  };
}

function finding(id: string, runId: string, over: Partial<GroupableFinding> = {}): GroupableFinding {
  return {
    id,
    severity: 'WARNING',
    category: 'bug',
    title: 'Missing null check',
    file: 'a.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'r',
    suggestion: null,
    confidence: 0.5,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    review_id: 'rev',
    accepted_at: null,
    dismissed_at: null,
    learned_at: null,
    agentId: `agent-${runId}`,
    runId,
    ...over,
  };
}

const withStatuses = (...s: ChildStatus[]) => s.map((status, i) => child(`c${i}`, { status }));

describe('deriveParentStatus - status matrix', () => {
  it('is running while any child is queued or running (AC-34)', () => {
    expect(deriveParentStatus(withStatuses('done', 'queued'))).toBe('running');
    expect(deriveParentStatus(withStatuses('failed', 'running'))).toBe('running');
  });
  it('is done when every child is done (AC-35)', () => {
    expect(deriveParentStatus(withStatuses('done', 'done'))).toBe('done');
  });
  it('is failed when every child failed or was cancelled (AC-36)', () => {
    expect(deriveParentStatus(withStatuses('failed', 'cancelled'))).toBe('failed');
  });
  it('is partial when settled with at least one done and one failed/cancelled (AC-37)', () => {
    expect(deriveParentStatus(withStatuses('done', 'failed'))).toBe('partial');
    expect(deriveParentStatus(withStatuses('done', 'cancelled'))).toBe('partial');
  });
  it('treats a parent with no children as failed', () => {
    expect(deriveParentStatus([])).toBe('failed');
  });
});

describe('parentTotals - duration, cost and partial flag', () => {
  const at = (s: string) => new Date(`2026-05-12T09:30:${s}Z`);

  it('sums the recorded costs (AC-38)', () => {
    const t = parentTotals([child('a', { costUsd: 0.012 }), child('b', { costUsd: 0.018 })]);
    expect(t.total_cost_usd).toBeCloseTo(0.03);
    expect(t.cost_partial).toBe(false);
  });
  it('flags cost_partial and sums only known costs when one child has none (AC-39)', () => {
    const t = parentTotals([child('a', { costUsd: 0.5 }), child('b', { costUsd: null })]);
    expect(t.total_cost_usd).toBe(0.5);
    expect(t.cost_partial).toBe(true);
  });
  it('reports a null total when no child has a cost', () => {
    const t = parentTotals([child('a', { costUsd: null })]);
    expect(t.total_cost_usd).toBeNull();
    expect(t.cost_partial).toBe(true);
  });
  it('measures duration from the earliest start to the latest finish (AC-40)', () => {
    const t = parentTotals([
      child('a', { startedAt: at('05'), finishedAt: at('10') }),
      child('b', { startedAt: at('01'), finishedAt: at('07') }),
      child('c', { startedAt: at('03'), finishedAt: at('20') }),
    ]);
    expect(t.total_duration_ms).toBe(19_000);
  });
  it('is 0 when nothing has started or finished yet', () => {
    expect(parentTotals([child('a', { startedAt: null, finishedAt: null })]).total_duration_ms).toBe(0);
  });
  it('measures to the latest finish so far while others still run', () => {
    const t = parentTotals([
      child('a', { startedAt: at('01'), finishedAt: at('04') }),
      child('b', { status: 'running', startedAt: at('02'), finishedAt: null }),
    ]);
    expect(t.total_duration_ms).toBe(3000);
  });
});

describe('columnScore (AC-41)', () => {
  it('keeps the score of a done child and nulls it for every other status', () => {
    expect(columnScore(child('a', { status: 'done', score: 72 }))).toBe(72);
    for (const status of ['queued', 'running', 'failed', 'cancelled'] as const) {
      expect(columnScore(child('a', { status, score: 72 }))).toBeNull();
    }
  });
});

describe('orderColumns - selection order and deleted agents', () => {
  it('follows the selection order, not the child order', () => {
    const kids = [child('a'), child('b'), child('c')];
    const ordered = orderColumns(['agent-c', 'agent-a', 'agent-b'], kids);
    expect(ordered.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
  it('puts a deleted-agent child in the first slot nobody claimed', () => {
    const kids = [child('a'), child('gone', { agentId: null, agentName: null }), child('c')];
    // agent-b was deleted: its slot (2nd) is filled by the orphan.
    const ordered = orderColumns(['agent-a', 'agent-b', 'agent-c'], kids);
    expect(ordered.map((c) => c.id)).toEqual(['a', 'gone', 'c']);
  });
  it('appends surplus orphans after the selected slots', () => {
    const kids = [child('a'), child('x', { agentId: null })];
    expect(orderColumns(['agent-a'], kids).map((c) => c.id)).toEqual(['a', 'x']);
  });
});

describe('titleSimilarity - normalisation (AC-43)', () => {
  it('lower-cases, splits on non-alphanumerics and drops empty tokens', () => {
    expect(normaliseTitle('  Foo--BAR, baz!! ')).toEqual(['foo', 'bar', 'baz']);
  });
  it('is intersection over union of the token sets', () => {
    expect(titleSimilarity('a b c', 'b c d')).toBeCloseTo(2 / 4);
    expect(titleSimilarity('a a b', 'a b')).toBe(1);
  });
  it('is 0 when both titles have no tokens', () => {
    expect(titleSimilarity('!!!', '---')).toBe(0);
  });
});

describe('groupFindings - location grouping', () => {
  it('groups findings of the same file whose ranges overlap and titles match (AC-42)', () => {
    const groups = groupFindings(
      [finding('1', 'r1'), finding('2', 'r2', { start_line: 10, end_line: 12 })],
      ['r1', 'r2'],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members.map((m) => m.id)).toEqual(['1', '2']);
  });
  it('joins ranges exactly 3 lines apart but not 4 (gap boundary)', () => {
    const near = groupFindings(
      [finding('1', 'r1', { start_line: 10, end_line: 10 }), finding('2', 'r2', { start_line: 13, end_line: 13 })],
      ['r1', 'r2'],
    );
    expect(near).toHaveLength(1);
    const far = groupFindings(
      [finding('1', 'r1', { start_line: 10, end_line: 10 }), finding('2', 'r2', { start_line: 14, end_line: 14 })],
      ['r1', 'r2'],
    );
    expect(far).toHaveLength(2);
  });
  it('joins at similarity exactly 0.5 but not below it', () => {
    expect(titleSimilarity('a b', 'a b c d')).toBe(0.5);
    const half = groupFindings(
      [finding('1', 'r1', { title: 'a b' }), finding('2', 'r2', { title: 'a b c d' })],
      ['r1', 'r2'],
    );
    expect(half).toHaveLength(1);
    const below = groupFindings(
      [finding('1', 'r1', { title: 'a b' }), finding('2', 'r2', { title: 'a b c d e' })],
      ['r1', 'r2'],
    );
    expect(below).toHaveLength(2);
  });
  it('never groups across files', () => {
    const groups = groupFindings([finding('1', 'r1'), finding('2', 'r2', { file: 'b.ts' })], ['r1', 'r2']);
    expect(groups).toHaveLength(2);
  });
  it('merges a transitive chain A-B-C into one group (AC-44)', () => {
    // A (line 10) ~ B (line 13) ~ C (line 16); A and C are 6 lines apart.
    const groups = groupFindings(
      [
        finding('A', 'r1', { start_line: 10, end_line: 10 }),
        finding('B', 'r2', { start_line: 13, end_line: 13 }),
        finding('C', 'r3', { start_line: 16, end_line: 16 }),
      ],
      ['r1', 'r2', 'r3'],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members.map((m) => m.id).sort()).toEqual(['A', 'B', 'C']);
  });
  it('puts every finding in exactly one group (AC-45)', () => {
    const fs = [finding('1', 'r1'), finding('2', 'r2'), finding('3', 'r1', { file: 'z.ts' })];
    const groups = groupFindings(fs, ['r1', 'r2']);
    expect(groups.flatMap((g) => g.members.map((m) => m.id)).sort()).toEqual(['1', '2', '3']);
  });
  it('keeps the original finding ids and agent ids on members (AC-46)', () => {
    const [g] = groupFindings([finding('1', 'r1', { agentId: 'ag-1' })], ['r1']);
    expect(g!.members[0]).toMatchObject({ id: '1', agentId: 'ag-1' });
  });
  it('orders groups by file in code-unit order, then start line (AC-47)', () => {
    const groups = groupFindings(
      [
        finding('1', 'r1', { file: 'b.ts', start_line: 1, end_line: 1 }),
        finding('2', 'r1', { file: 'B.ts', start_line: 50, end_line: 50 }),
        finding('3', 'r1', { file: 'a.ts', start_line: 90, end_line: 90 }),
        finding('4', 'r1', { file: 'a.ts', start_line: 5, end_line: 5, title: 'other thing' }),
      ],
      ['r1'],
    );
    // Code-unit order puts uppercase 'B.ts' before lowercase 'a.ts'.
    expect(groups.map((g) => g.members[0]!.id)).toEqual(['2', '4', '3', '1']);
  });
  it('spans the lowest start to the highest end line (AC-48)', () => {
    const [g] = groupFindings(
      [finding('1', 'r1', { start_line: 10, end_line: 12 }), finding('2', 'r2', { start_line: 8, end_line: 20 })],
      ['r1', 'r2'],
    );
    expect([g!.startLine, g!.endLine]).toEqual([8, 20]);
  });
  describe('title of the group (AC-49)', () => {
    const titled = (a: Partial<GroupableFinding>, b: Partial<GroupableFinding>, order = ['r1', 'r2']) =>
      groupFindings(
        [finding('1', 'r1', { title: 'Null check missing', ...a }), finding('2', 'r2', { title: 'Missing null check', ...b })],
        order,
      )[0]!.title;
    it('takes the most severe member', () => {
      expect(titled({ severity: 'WARNING' }, { severity: 'CRITICAL' })).toBe('Missing null check');
    });
    it('breaks a severity tie by higher confidence', () => {
      expect(titled({ confidence: 0.9 }, { confidence: 0.2 })).toBe('Null check missing');
    });
    it('breaks a full tie by the earlier selection order', () => {
      expect(titled({}, {}, ['r2', 'r1'])).toBe('Missing null check');
      expect(titled({}, {}, ['r1', 'r2'])).toBe('Null check missing');
    });
  });
});

describe('buildTakes and isConflict', () => {
  const cols = [child('r1'), child('r2'), child('r3', { status: 'failed' })];
  const group = (members: GroupableFinding[]) => ({ file: 'a.ts', startLine: 1, endLine: 1, title: 't', members });

  it('gives exactly one take per column, in column order (AC-53)', () => {
    const takes = buildTakes(group([finding('1', 'r1')]), cols);
    expect(takes.map((t) => t.agent_id)).toEqual(['agent-r1', 'agent-r2', 'agent-r3']);
  });
  it('carries the most severe member severity and its title as note (AC-54)', () => {
    const takes = buildTakes(
      group([
        finding('1', 'r1', { severity: 'WARNING', title: 'minor' }),
        finding('2', 'r1', { severity: 'CRITICAL', title: 'major' }),
      ]),
      cols,
    );
    expect(takes[0]).toMatchObject({ verdict: 'CRITICAL', note: 'major' });
  });
  it('marks a done column without members ignored with a null note (AC-55)', () => {
    const takes = buildTakes(group([finding('1', 'r1')]), cols);
    expect(takes[1]).toMatchObject({ verdict: 'ignored', note: null });
  });
  it('marks an unfinished column no_result (AC-56)', () => {
    const takes = buildTakes(group([finding('1', 'r1')]), cols);
    expect(takes[2]).toMatchObject({ verdict: 'no_result', note: null });
  });

  const take = (verdict: string) => ({ agent_id: 'a', persona: 'p', verdict, note: null }) as never;
  it('is a conflict when a done agent did not flag a flagged location (AC-51)', () => {
    expect(isConflict([take('WARNING'), take('ignored')])).toBe(true);
  });
  it('is a conflict when flagging agents differ in verdict (AC-52)', () => {
    expect(isConflict([take('WARNING'), take('CRITICAL')])).toBe(true);
  });
  it('is no conflict when everyone flagged at the same severity', () => {
    expect(isConflict([take('WARNING'), take('WARNING')])).toBe(false);
  });
  it('is no conflict when the only silent agent has no result', () => {
    expect(isConflict([take('WARNING'), take('no_result')])).toBe(false);
  });
  it('compares take verdicts, not every member severity (AC-52 reading)', () => {
    const r1 = child('r1');
    const r2 = child('r2');
    const groups = buildLocationGroups(
      [r1, r2],
      [
        finding('1', 'r1', { severity: 'CRITICAL' }),
        finding('2', 'r1', { severity: 'WARNING' }),
        finding('3', 'r2', { severity: 'CRITICAL' }),
      ],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.takes.map((t) => t.verdict)).toEqual(['CRITICAL', 'CRITICAL']);
    expect(groups[0]!.conflict).toBe(false);
  });
});

describe('buildLocationGroups - only done columns feed groups', () => {
  it('ignores findings of a failed run and gives its take no_result in every group', () => {
    const done = child('r1');
    const failed = child('r2', { status: 'failed' });
    const groups = buildLocationGroups(
      [done, failed],
      [finding('1', 'r1'), finding('2', 'r2', { file: 'ghost.ts' })],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members).toEqual([{ finding_id: '1', agent_id: 'agent-r1' }]);
    expect(groups[0]!.takes[1]!.verdict).toBe('no_result');
  });
});

describe('median / toEstimate (AC-59, AC-60)', () => {
  const sample = (d: number | null, c: number | null): EstimateSample => ({ agentId: 'a', durationMs: d, costUsd: c });

  it('median of odd and even counts, null for none', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('uses only the 10 newest samples', () => {
    const samples = [...Array.from({ length: 10 }, () => sample(100, 1)), ...Array.from({ length: 5 }, () => sample(99999, 99))];
    expect(toEstimate('a', samples)).toEqual({ agent_id: 'a', median_duration_ms: 100, median_cost_usd: 1, runs: 10 });
  });
  it('rounds the duration median to an integer', () => {
    expect(toEstimate('a', [sample(1, 0), sample(2, 0)]).median_duration_ms).toBe(2);
  });
  it('skips null values in the medians but counts the run', () => {
    expect(toEstimate('a', [sample(null, null), sample(500, 0.2)])).toEqual({
      agent_id: 'a',
      median_duration_ms: 500,
      median_cost_usd: 0.2,
      runs: 2,
    });
  });
  it('yields nulls and runs 0 with no samples', () => {
    expect(toEstimate('a', [])).toEqual({ agent_id: 'a', median_duration_ms: null, median_cost_usd: null, runs: 0 });
  });
});
