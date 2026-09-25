import { describe, it, expect } from 'vitest';
import type { IntentSource } from '@devdigest/shared';
import {
  bodyFingerprint,
  deriveMissingContext,
  isIntentStale,
  parseIssueRef,
  parseSpecRef,
} from '../src/modules/reviews/intent-helpers.js';

/**
 * Unit coverage for the Intent Layer's honesty guarantees: the `#123`/spec-path
 * reference parsing and missing-context derivation. `deriveMissingContext` is
 * what ensures the intent never silently invents an unreachable reference.
 */

describe('deriveMissingContext', () => {
  it('reports only failed attempts, with a readable message per kind', () => {
    const attempts: IntentSource[] = [
      { kind: 'title', ref: null, ok: true },
      { kind: 'body', ref: null, ok: false },
      { kind: 'issue', ref: '#12', ok: false },
      { kind: 'spec', ref: 'docs/specs/x.md', ok: false },
      { kind: 'files', ref: null, ok: true },
    ];
    const missing = deriveMissingContext(attempts);
    expect(missing).toHaveLength(3);
    expect(missing.some((m) => /description is empty/i.test(m))).toBe(true);
    expect(missing.some((m) => m.includes('#12'))).toBe(true);
    expect(missing.some((m) => m.includes('docs/specs/x.md'))).toBe(true);
  });

  it('is empty when every attempt succeeded', () => {
    expect(deriveMissingContext([{ kind: 'title', ref: null, ok: true }])).toEqual([]);
  });
});

describe('parseIssueRef', () => {
  it('matches a bare #123', () => {
    expect(parseIssueRef('see #123 for context')).toBe(123);
  });

  it('matches "closes #123" (case-insensitive)', () => {
    expect(parseIssueRef('Closes #45')).toBe(45);
  });

  it('returns null with no reference', () => {
    expect(parseIssueRef('no ticket here')).toBeNull();
  });

  it('returns null for an empty/absent body', () => {
    expect(parseIssueRef(null)).toBeNull();
    expect(parseIssueRef(undefined)).toBeNull();
    expect(parseIssueRef('')).toBeNull();
  });
});

describe('parseSpecRef', () => {
  it('finds a docs/specs/*.md path mentioned in the body', () => {
    expect(parseSpecRef('Plan: docs/specs/intent-layer.md')).toBe('docs/specs/intent-layer.md');
  });

  it('finds a docs/design/*.md path', () => {
    expect(parseSpecRef('see docs/design/foo.md')).toBe('docs/design/foo.md');
  });

  it('returns null with no path-shaped reference', () => {
    expect(parseSpecRef('just a description, no plan link')).toBeNull();
  });
});

/**
 * Staleness is the other half of the honesty guarantee: an intent classified
 * before the PR description reached `pull_requests.body` (the body only lands
 * there on a detail sync) keeps reporting "PR description is empty" about a PR
 * that plainly has one — observed on PR #5. `head_sha` cannot catch it: editing
 * a description moves no commit.
 */
describe('deriveMissingContext — a named source vs one never referenced', () => {
  it('reports an unreadable spec but not a PR that simply links none', () => {
    const attempts: IntentSource[] = [
      { kind: 'spec', ref: 'docs/specs/x.md', ok: false },
      { kind: 'spec', ref: null, ok: false },
    ];
    // The second attempt is an absence, not a failure — the card states it in
    // its own muted line, so an amber warning here would fire on most PRs.
    expect(deriveMissingContext(attempts)).toEqual([
      'Linked spec "docs/specs/x.md" could not be read',
    ]);
  });
});

describe('isIntentStale', () => {
  const HEAD = 'abc1234';
  const BODY = 'not amazing description';

  it('is false when the head and the description are both unchanged', () => {
    const record = { head_sha: HEAD, body_sha: bodyFingerprint(BODY), sources: [] };
    expect(isIntentStale(record, { headSha: HEAD, body: BODY })).toBe(false);
  });

  it('is true when the head sha moved', () => {
    const record = { head_sha: HEAD, body_sha: bodyFingerprint(BODY), sources: [] };
    expect(isIntentStale(record, { headSha: 'deadbee', body: BODY })).toBe(true);
  });

  it('is true when only the description changed — the head sha cannot see this', () => {
    const record = { head_sha: HEAD, body_sha: bodyFingerprint(BODY), sources: [] };
    expect(isIntentStale(record, { headSha: HEAD, body: 'a much better description' })).toBe(true);
  });

  it('is true when a description was added to a PR classified without one — the PR #5 bug', () => {
    const record = { head_sha: HEAD, body_sha: bodyFingerprint(null), sources: [] };
    expect(isIntentStale(record, { headSha: HEAD, body: BODY })).toBe(true);
  });

  it('treats whitespace-only as no description, matching the body source attempt', () => {
    const record = { head_sha: HEAD, body_sha: bodyFingerprint(null), sources: [] };
    expect(isIntentStale(record, { headSha: HEAD, body: '   \n  ' })).toBe(false);
  });

  describe('records stored before body_sha existed', () => {
    it('is true when the record claims an empty description but the PR now has one', () => {
      const sources: IntentSource[] = [{ kind: 'body', ref: null, ok: false }];
      const record = { head_sha: HEAD, body_sha: undefined, sources };
      expect(isIntentStale(record, { headSha: HEAD, body: BODY })).toBe(true);
    });

    it('is false when the record and the PR agree a description exists — the text may have been edited, but flagging every legacy row would cry wolf', () => {
      const sources: IntentSource[] = [{ kind: 'body', ref: null, ok: true }];
      const record = { head_sha: HEAD, body_sha: undefined, sources };
      expect(isIntentStale(record, { headSha: HEAD, body: 'some other text' })).toBe(false);
    });
  });
});
