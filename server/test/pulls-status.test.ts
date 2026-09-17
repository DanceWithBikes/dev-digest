/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS and tallies its FINDINGS for the list. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived here from head vs lastReviewedSha
 * + age, so it gets unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveReviewStatus,
  rollupSeverities,
  toFindingPreviews,
  FINDING_PREVIEW_LIMIT,
  FINDING_PREVIEW_RATIONALE_MAX,
  STALE_DAYS,
} from '../src/modules/pulls/status.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11);

describe('deriveReviewStatus', () => {
  it('needs_review when never reviewed, or when head moved since the last review', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: null, headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'old', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
  });

  it('reviewed when the current head was reviewed and the PR is recent', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now - DAY), now }),
    ).toBe('reviewed');
  });

  it('stale when the current head was reviewed but the PR is older than STALE_DAYS', () => {
    expect(
      deriveReviewStatus({
        ghStatus: 'open',
        lastReviewedSha: 'abc',
        headSha: 'abc',
        updatedAt: new Date(now - (STALE_DAYS + 1) * DAY),
        now,
      }),
    ).toBe('stale');
  });

  it('keeps merged/closed regardless of review state', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'merged', lastReviewedSha: null, headSha: 'abc', updatedAt: null, now }),
    ).toBe('merged');
    expect(
      deriveReviewStatus({ ghStatus: 'closed', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('closed');
  });
});

describe('rollupSeverities', () => {
  it('tallies findings into critical / warning / suggestion buckets (ignores unknown)', () => {
    expect(
      rollupSeverities([
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
        { severity: 'WEIRD' },
      ]),
    ).toEqual({ critical: 2, warning: 1, suggestion: 1 });
  });

  it('is all-zero for no findings', () => {
    expect(rollupSeverities([])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe('toFindingPreviews', () => {
  const row = (o: Partial<Parameters<typeof toFindingPreviews>[0][number]> = {}) => ({
    id: 'f1',
    severity: 'WARNING',
    category: 'perf',
    title: 'N+1 query',
    file: 'src/api/users.ts',
    startLine: 45,
    endLine: 52,
    confidence: 0.86,
    rationale: 'Loop issues one query per user.',
    ...o,
  });

  it('maps DB rows to the contract shape (snake_case line fields)', () => {
    expect(toFindingPreviews([row()])).toEqual([
      {
        id: 'f1',
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query',
        file: 'src/api/users.ts',
        start_line: 45,
        end_line: 52,
        confidence: 0.86,
        rationale: 'Loop issues one query per user.',
      },
    ]);
  });

  it('orders worst-first (CRITICAL → WARNING → SUGGESTION), not alphabetically', () => {
    const previews = toFindingPreviews([
      row({ id: 'a', severity: 'SUGGESTION' }),
      row({ id: 'b', severity: 'WARNING' }),
      row({ id: 'c', severity: 'CRITICAL' }),
    ]);
    expect(previews.map((p) => p.severity)).toEqual(['CRITICAL', 'WARNING', 'SUGGESTION']);
  });

  it('caps the list and truncates long rationales', () => {
    const many = Array.from({ length: FINDING_PREVIEW_LIMIT + 5 }, (_, i) => row({ id: `f${i}` }));
    expect(toFindingPreviews(many)).toHaveLength(FINDING_PREVIEW_LIMIT);

    const [long] = toFindingPreviews([row({ rationale: 'x'.repeat(FINDING_PREVIEW_RATIONALE_MAX + 50) })]);
    expect(long!.rationale).toHaveLength(FINDING_PREVIEW_RATIONALE_MAX + 1); // + the ellipsis
    expect(long!.rationale.endsWith('…')).toBe(true);
  });

  it('does not mutate the input array order', () => {
    const rows = [row({ id: 'a', severity: 'SUGGESTION' }), row({ id: 'b', severity: 'CRITICAL' })];
    toFindingPreviews(rows);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
