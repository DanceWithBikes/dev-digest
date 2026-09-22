import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { FIXTURE_PRS, PR_483_DISCOUNT, PR_484_CONTRACT } from '../src/db/seed-fixtures.js';

/**
 * Guards the control experiment's single most dangerous failure mode: a fixture
 * PR whose patches don't parse produces an EMPTY diff, the agents review
 * nothing, and the with-skills / without-skills comparison shows no difference —
 * which looks exactly like the skills feature being broken.
 *
 * This reconstructs the diff the same way `diffFromPrFiles` does
 * (`modules/reviews/diff-loader.ts:33`) without needing a database.
 */

/** Mirrors diffFromPrFiles' reconstruction, minus the repo lookup. */
function diffOf(pr: (typeof FIXTURE_PRS)[number]) {
  const parts: string[] = [];
  for (const f of pr.files) {
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}

describe('seed fixture PRs', () => {
  it('every fixture file carries a patch (a missing one is silently dropped)', () => {
    for (const pr of FIXTURE_PRS) {
      expect(pr.files.length).toBeGreaterThan(0);
      for (const f of pr.files) {
        expect(f.patch.trim(), `${pr.number} ${f.path}`).not.toBe('');
        expect(f.patch, `${pr.number} ${f.path}`).toContain('@@');
      }
    }
  });

  it('every fixture parses into a non-empty diff', () => {
    for (const pr of FIXTURE_PRS) {
      const diff = diffOf(pr);
      expect(diff.files.length, `PR #${pr.number}`).toBe(pr.files.length);
    }
  });

  /** `DiffHunk` carries only line numbers; the content lives in `diff.raw`. */
  const linesOf = (raw: string, prefix: '+' | '-') =>
    raw
      .split('\n')
      .filter((l) => l.startsWith(prefix) && !l.startsWith(prefix.repeat(3)))
      .join('\n');

  it('#483 carries the branches the test-quality skills must catch', () => {
    const added = linesOf(diffOf(PR_483_DISCOUNT).raw, '+');

    // The two branches the happy-path-only test never reaches.
    expect(added).toContain('pct > 100');
    expect(added).toContain('amount === 0');
    // …and the single assertion that proves the test IS happy-path only.
    expect(added).toContain('applyDiscount(100, 10)');
  });

  it('#484 carries the breaking rename and the dropped response field', () => {
    const raw = diffOf(PR_484_CONTRACT).raw;
    const removed = linesOf(raw, '-');
    const added = linesOf(raw, '+');

    expect(removed).toContain('customer_id');
    expect(added).toContain('customerId');
    // Removed from the response and never re-added — the second breaking change.
    expect(removed).toContain('legacy_reference');
    expect(added).not.toContain('legacy_reference');
  });
});
