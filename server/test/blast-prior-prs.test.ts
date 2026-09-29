import { describe, it, expect } from 'vitest';
import type { CommitPullRef } from '@devdigest/shared';
import { aggregatePriorPrs, type PriorPrCandidate } from '../src/modules/blast/helpers.js';
import { PRIOR_PRS_LIMIT } from '../src/modules/blast/constants.js';

function pr(overrides: Partial<CommitPullRef>): CommitPullRef {
  return {
    number: 1,
    title: 't',
    author: 'a',
    mergedAt: '2026-01-01T00:00:00Z',
    state: 'closed',
    ...overrides,
  };
}

describe('blast/helpers — aggregatePriorPrs', () => {
  it('dedupes by PR number and unions files_overlap across files', () => {
    const candidates: PriorPrCandidate[] = [
      { file: 'src/a.ts', pr: pr({ number: 401 }) },
      { file: 'src/b.ts', pr: pr({ number: 401 }) }, // same PR touched a second changed file
    ];
    const { history } = aggregatePriorPrs(candidates, 999);
    expect(history).toHaveLength(1);
    expect(history[0]!.pr_number).toBe(401);
    expect(history[0]!.files_overlap.sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(history[0]!.notes).toBe('touched 2 of these files');
  });

  it('excludes the current PR and keeps merged PRs only', () => {
    const candidates: PriorPrCandidate[] = [
      { file: 'src/a.ts', pr: pr({ number: 401 }) },
      { file: 'src/a.ts', pr: pr({ number: 500, mergedAt: null, state: 'open' }) }, // not merged
      { file: 'src/a.ts', pr: pr({ number: 999 }) }, // the current PR
    ];
    const { history } = aggregatePriorPrs(candidates, 999);
    expect(history.map((h) => h.pr_number)).toEqual([401]);
  });

  it('sorts by merged_at desc and caps at PRIOR_PRS_LIMIT', () => {
    const candidates: PriorPrCandidate[] = Array.from({ length: PRIOR_PRS_LIMIT + 5 }, (_, i) => ({
      file: 'src/a.ts',
      pr: pr({ number: 1000 + i, mergedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` }),
    }));
    const { history } = aggregatePriorPrs(candidates, -1);
    expect(history).toHaveLength(PRIOR_PRS_LIMIT);
    // newest merge (highest day number → highest PR number here) first
    expect(history[0]!.pr_number).toBe(1000 + candidates.length - 1);
    expect(history.map((h) => h.merged_at)).toEqual(
      [...history.map((h) => h.merged_at)].sort().reverse(),
    );
  });

  it('returns an empty history when nothing qualifies', () => {
    expect(aggregatePriorPrs([], 1)).toEqual({ history: [] });
  });
});
