/**
 * Pure helpers of the eval module: kind mapping, one-click diff, case-diff
 * validation, snapshotting, batch finalisation and trend order. No I/O.
 * Covers AC-23..AC-26, AC-39, AC-40, AC-48, AC-54, AC-55, AC-57, AC-62.
 */
import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff, scoreCase } from '@devdigest/reviewer-core';
import type { Finding } from '@devdigest/shared';
import {
  batchLogFields,
  buildOverview,
  expectationFromFinding,
  finaliseBatch,
  oneClickDiff,
  skillBodies,
  snapshotOf,
  trendOf,
  validateCaseDiff,
  withRequestDeadline,
} from '../src/modules/eval/helpers.js';
import type { CaseResult, StoredBatch } from '../src/modules/eval/domain.js';

const PATCH = '@@ -1,2 +1,3 @@\n a\n+b\n c';

const finding = (over: Partial<Parameters<typeof expectationFromFinding>[0]> = {}) => ({
  id: 'f1',
  file: 'src/a.ts',
  startLine: 2,
  endLine: 2,
  title: 'Hardcoded key',
  severity: 'critical',
  category: 'security',
  acceptedAt: null,
  dismissedAt: null,
  ...over,
});

const f = (id: string, file: string, s: number, e: number): Finding => ({
  id,
  severity: 'warning',
  category: 'security',
  title: 't',
  file,
  start_line: s,
  end_line: e,
  rationale: 'r',
  confidence: 0.9,
});

describe('expectationFromFinding', () => {
  it('maps accepted to must_find with title/severity/category', () => {
    expect(expectationFromFinding(finding({ acceptedAt: new Date() }))).toEqual({
      kind: 'must_find',
      file: 'src/a.ts',
      start_line: 2,
      end_line: 2,
      title: 'Hardcoded key',
      severity: 'critical',
      category: 'security',
    });
  });
  it('maps dismissed to must_not_flag and undecided to null', () => {
    expect(expectationFromFinding(finding({ dismissedAt: new Date() }))?.kind).toBe('must_not_flag');
    expect(expectationFromFinding(finding())).toBeNull();
  });
});

describe('oneClickDiff / validateCaseDiff', () => {
  it('parses to exactly one file with the finding path', () => {
    const parsed = parseUnifiedDiff(oneClickDiff('src/a.ts', PATCH));
    expect(parsed.files.map((x) => x.path)).toEqual(['src/a.ts']);
  });
  it('accepts a valid diff', () => {
    expect(validateCaseDiff(oneClickDiff('src/a.ts', PATCH), [{ file: 'src/a.ts' }])).toBeNull();
  });
  it('rejects a diff that parses to 0 files', () => {
    expect(validateCaseDiff(PATCH, [{ file: 'src/a.ts' }])).toMatch(/no files/);
  });
  it('rejects an expectation file that is not in the diff', () => {
    expect(validateCaseDiff(oneClickDiff('src/a.ts', PATCH), [{ file: 'src/other.ts' }])).toMatch(
      /src\/other\.ts/,
    );
  });
});

describe('snapshot', () => {
  const links = [
    { skill: { name: 'one', body: 'B1', enabled: true } },
    { skill: { name: 'off', body: 'B2', enabled: false } },
    { skill: { name: 'two', body: 'B3', enabled: true } },
  ];
  it('renders enabled skills as ### name blocks and stores names only', () => {
    expect(skillBodies(links)).toEqual(['### one\nB1', '### two\nB3']);
    const snap = snapshotOf(
      { id: 'a', name: 'A', version: 3, systemPrompt: 'P', provider: 'openrouter', model: 'm', strategy: null },
      links,
    );
    expect(snap).toEqual({
      agentVersion: 3,
      systemPrompt: 'P',
      provider: 'openrouter',
      model: 'm',
      skills: ['one', 'two'],
    });
  });
});

describe('finaliseBatch', () => {
  const exps = [{ kind: 'must_find' as const, file: 'a.ts', start_line: 1, end_line: 3 }];
  const ok = (cost: number | null): CaseResult => ({
    score: scoreCase(exps, [f('x', 'a.ts', 2, 2)], 1),
    error: null,
    tokensIn: 10,
    tokensOut: 5,
    costUsd: cost,
  });
  const bad = (error: string): CaseResult => ({ score: null, error, tokensIn: null, tokensOut: null, costUsd: null });

  it('is done with micro-averaged metrics, summed tokens and summed cost', () => {
    const c = finaliseBatch([ok(0.5), ok(0.25), bad('boom')], 1234);
    expect(c.status).toBe('done');
    expect(c.casesTotal).toBe(3);
    expect(c.casesPassed).toBe(2);
    expect(c.recall).toBeCloseTo(1);
    expect(c.citationAccuracy).toBeCloseTo(0.5);
    expect(c.tokensIn).toBe(20);
    expect(c.tokensOut).toBe(10);
    expect(c.costUsd).toBeCloseTo(0.75);
    expect(c.durationMs).toBe(1234);
  });
  it('has null cost when no case reported one', () => {
    expect(finaliseBatch([ok(null)], 1).costUsd).toBeNull();
  });
  it('fails with "all N cases failed" + first error and null metrics', () => {
    const c = finaliseBatch([bad('first'), bad('second')], 5);
    expect(c.status).toBe('failed');
    expect(c.error).toBe('all 2 cases failed: first');
    expect(c).toMatchObject({ casesTotal: 2, casesPassed: 0, recall: null, precision: null, citationAccuracy: null });
  });
  it('fails (non-empty error) when no case was left to run', () => {
    const c = finaliseBatch([], 1);
    expect(c.status).toBe('failed');
    expect(c.error).toBeTruthy();
  });
  it('log fields carry ids, counts and metrics only', () => {
    const fields = batchLogFields('b', 'a', finaliseBatch([ok(0.1)], 1), { agentVersion: 3, model: 'm-x' });
    expect(Object.keys(fields)).not.toContain('error');
    expect(fields.batch_id).toBe('b');
    expect(fields.agent_version).toBe(3);
    expect(fields.model).toBe('m-x');
  });
});

const batch = (id: string, agentId: string, minutesAgo: number, status: StoredBatch['status'] = 'done'): StoredBatch => ({
  id,
  workspaceId: 'ws',
  agentId,
  snapshot: { agentVersion: 1, systemPrompt: 'p', provider: 'openrouter', model: 'm', skills: [] },
  status,
  error: null,
  ranAt: new Date(Date.UTC(2026, 0, 1, 12, 0) - minutesAgo * 60_000),
  finishedAt: null,
  casesTotal: 1,
  casesPassed: 1,
  mustFindTotal: 1,
  mustFindMatched: 1,
  keptTotal: 1,
  noiseTotal: 0,
  droppedTotal: 0,
  recall: 1,
  precision: 1,
  citationAccuracy: 1,
  durationMs: 1,
  tokensIn: null,
  tokensOut: null,
  costUsd: null,
});

describe('trendOf / buildOverview', () => {
  it('keeps the newest 10 done batches, oldest first', () => {
    const many = Array.from({ length: 12 }, (_, i) => batch(`b${i}`, 'a', i)); // b0 newest
    const trend = trendOf([...many, batch('run', 'a', -5, 'running'), batch('bad', 'a', -6, 'failed')]);
    expect(trend).toHaveLength(10);
    expect(trend.map((b) => b.id)).toEqual(['b9', 'b8', 'b7', 'b6', 'b5', 'b4', 'b3', 'b2', 'b1', 'b0']);
  });
  it('lists every agent, with its latest batch of any status and a done trend', () => {
    const o = buildOverview({
      agents: [
        { agentId: 'a', name: 'A', model: 'm', casesTotal: 2 },
        { agentId: 'z', name: 'Z', model: 'm', casesTotal: 0 },
      ],
      latestBatches: [batch('r', 'a', 0, 'running')],
      doneBatches: [batch('d1', 'a', 10), batch('d2', 'a', 5)],
      recent: [batch('r', 'a', 0, 'running')],
    });
    expect(o.agents[0]!.latest_batch?.id).toBe('r');
    expect(o.agents[0]!.trend.map((b) => b.id)).toEqual(['d1', 'd2']);
    expect(o.agents[1]).toMatchObject({ cases_total: 0, latest_batch: null, trend: [] });
    expect(o.recent_batches).toHaveLength(1);
  });
});

describe('withRequestDeadline', () => {
  it('forces timeoutMs and singleAttempt, keeps other fields, returns the inner result', async () => {
    const seen: unknown[] = [];
    const result = { data: 1, model: 'm', tokensIn: 1, tokensOut: 2, costUsd: null, raw: '{}', attempts: 1 };
    const inner = {
      id: 'openrouter',
      listModels: async () => [],
      complete: async () => ({ text: '', model: 'm', tokensIn: 0, tokensOut: 0, costUsd: null }),
      completeStructured: async (req: unknown) => {
        seen.push(req);
        return result;
      },
      embed: async () => [],
    } as unknown as Parameters<typeof withRequestDeadline>[0];
    const wrapped = withRequestDeadline(inner, 5000);
    const req = { model: 'x', schemaName: 's', messages: [], maxRetries: 2, timeoutMs: 1 } as never;
    expect(await wrapped.completeStructured(req)).toBe(result);
    expect(seen[0]).toMatchObject({ model: 'x', schemaName: 's', maxRetries: 2, timeoutMs: 5000, singleAttempt: true });
    expect(wrapped.id).toBe('openrouter');
  });
});
