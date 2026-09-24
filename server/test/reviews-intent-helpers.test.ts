import { describe, it, expect } from 'vitest';
import type { IntentSource } from '@devdigest/shared';
import { deriveMissingContext, parseIssueRef, parseSpecRef } from '../src/modules/reviews/intent-helpers.js';

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
