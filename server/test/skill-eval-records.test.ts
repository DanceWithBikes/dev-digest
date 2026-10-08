import { describe, it, expect } from 'vitest';
import {
  parseNodeId,
  parseRecordLine,
  recordsForSkill,
  runIdToDate,
} from '../src/modules/skills/eval-records.js';

const NODE = '/abs/evals/skills/engineering-insights/x.eval.ts > skill:engineering-insights > refuses noise';

const line = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    run_id: '20261008T102101',
    git_sha: 'abc1234',
    dirty: true,
    config: 'candidate',
    nodeid: NODE,
    outcome: true,
    score: 0.75,
    threshold: 0.7,
    practices: [{ practice: 'p', passed: true, evidence: 'quote' }],
    num_turns: 3,
    metrics: { durationMs: 1200.4, inputTokens: 10, outputTokens: 20 },
    ...over,
  });

describe('parseNodeId', () => {
  it('extracts the skill and case name', () => {
    expect(parseNodeId(NODE)).toEqual({ skillName: 'engineering-insights', caseName: 'refuses noise' });
  });
  it('keeps a case title that itself contains the separator', () => {
    expect(parseNodeId('/a.ts > skill:s > one > two')?.caseName).toBe('one > two');
  });
  it('ignores agent / workflow records', () => {
    expect(parseNodeId('/a.ts > workflow:review > case')).toBeNull();
    expect(parseNodeId('/a.ts > agent:x > case')).toBeNull();
  });
});

describe('runIdToDate', () => {
  it('reads the run id as UTC', () => {
    expect(runIdToDate('20261008T102101')?.toISOString()).toBe('2026-10-08T10:21:01.000Z');
  });
  it('rejects malformed ids', () => {
    expect(runIdToDate('nope')).toBeNull();
  });
});

describe('parseRecordLine', () => {
  it('normalises a skill record', () => {
    const p = parseRecordLine(line());
    expect(p.kind).toBe('record');
    if (p.kind !== 'record') return;
    expect(p.record).toMatchObject({
      skillName: 'engineering-insights',
      caseName: 'refuses noise',
      grounded: null,
      durationMs: 1200,
      gitSha: 'abc1234',
    });
  });
  it('flags malformed JSON and bad shapes as invalid, other suites as foreign', () => {
    expect(parseRecordLine('{oops').kind).toBe('invalid');
    expect(parseRecordLine(line({ outcome: 'yes' })).kind).toBe('invalid');
    expect(parseRecordLine(line({ config: 'weird' })).kind).toBe('invalid');
    expect(parseRecordLine(line({ nodeid: '/a > workflow:x > y' })).kind).toBe('foreign');
    expect(parseRecordLine(line({ nodeid: '/a > skill:z > y', outcome: 1 }), 'engineering-insights').kind).toBe('foreign');
  });
});

describe('recordsForSkill', () => {
  it('filters by skill, counts only malformed lines as skipped and de-duplicates', () => {
    const text = [
      line(),
      line({ outcome: false }), // same key: last wins
      line({ nodeid: '/a > skill:other > c' }),
      '{broken',
      '',
    ].join('\n');
    const { records, skipped } = recordsForSkill(text, 'engineering-insights');
    expect(skipped).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0]!.outcome).toBe(false);
  });

  it('keeps a record whose failed practice has evidence: null, normalised to an empty string', () => {
    const rec = parseRecordLine(line({ outcome: false, practices: [{ practice: 'p', passed: false, evidence: null }] }));
    expect(rec.kind).toBe('record');
    if (rec.kind === 'record') {
      expect(rec.record.practices).toEqual([{ practice: 'p', passed: false, evidence: '' }]);
    }
  });
});
