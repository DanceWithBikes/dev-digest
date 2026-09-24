import { describe, it, expect } from 'vitest';
import type { PrIntentRecord } from '@devdigest/shared';
import {
  renderCommitsDigest,
  renderFilesDigest,
  renderHunkHeader,
  renderIntentForPrompt,
} from '../src/modules/reviews/intent-sources.js';
import { buildUserPrompt, SYSTEM_PROMPT } from '../src/modules/reviews/intent-prompt.js';
import type { GatheredIntentSources, IntentDiffFile } from '../src/modules/reviews/ports.js';

describe('SYSTEM_PROMPT', () => {
  it('instructs the model to always answer in English regardless of the source language', () => {
    expect(SYSTEM_PROMPT).toMatch(/always answer in english/i);
  });
});

describe('renderHunkHeader', () => {
  it('re-renders the @@ header from the numbers alone', () => {
    expect(renderHunkHeader({ oldStart: 10, oldLines: 3, newStart: 12, newLines: 5 })).toBe(
      '@@ -10,3 +12,5 @@',
    );
  });
});

describe('renderFilesDigest', () => {
  it('lists each file with its hunk headers, no line content', () => {
    const files: IntentDiffFile[] = [
      {
        path: 'src/a.ts',
        hunks: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 3 }],
      },
      { path: 'src/b.ts', hunks: [] },
    ];
    const digest = renderFilesDigest(files);
    expect(digest).toContain('src/a.ts');
    expect(digest).toContain('@@ -1,2 +1,3 @@');
    expect(digest).toContain('src/b.ts');
  });

  it('degrades to a placeholder with no changed files', () => {
    expect(renderFilesDigest([])).toBe('(no changed files)');
  });
});

describe('renderCommitsDigest', () => {
  it('renders one bullet per commit, subject line only', () => {
    const digest = renderCommitsDigest(['feat: add thing\n\nlonger body here', 'fix: typo']);
    expect(digest).toBe('- feat: add thing\n- fix: typo');
    expect(digest).not.toContain('longer body here');
  });

  it('degrades to a placeholder with no commits', () => {
    expect(renderCommitsDigest([])).toBe('(no commits)');
  });
});

/**
 * Pins the plan §1 structural invariant: the classifier prompt is built from
 * `IntentDiffFile[]` (path + hunk numbers), which has no `.raw` field at all
 * — unlike `UnifiedDiff`, whose `.raw` holds the ENTIRE diff text
 * (`vendor/shared/adapters.ts:186`). Even when a caller accidentally hands the
 * collector a `UnifiedDiff`-shaped object (structurally assignable, since its
 * `files[]` are a superset of `IntentDiffFile[]`), the assembled prompt must
 * never contain the raw diff text — because nothing here ever reads `.raw`.
 */
describe('buildUserPrompt — diff.raw can never reach the prompt', () => {
  const SECRET_RAW_DIFF = 'RAW_DIFF_MARKER_should_never_appear_in_any_prompt';

  function sourcesWithFullDiffShape(): GatheredIntentSources {
    // A `UnifiedDiff`-shaped value (has `.raw`) assigned into `files` the way
    // a careless caller might, e.g. `collector.collect(pr, repo, diff)` where
    // `diff` is a full `UnifiedDiff` — still only `.files` is read.
    const diffLike = {
      raw: SECRET_RAW_DIFF,
      files: [
        {
          path: 'src/a.ts',
          additions: 1,
          deletions: 0,
          hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, newLineNumbers: [2] }],
        },
      ],
    };
    return {
      pr: { id: 'pr-1', number: 1, title: 'A PR', body: 'A body' },
      issue: null,
      spec: null,
      files: diffLike.files,
      commitMessages: ['feat: add a.ts'],
      attempts: [],
    };
  }

  it('never contains the raw diff text, however the sources were assembled', () => {
    const prompt = buildUserPrompt(sourcesWithFullDiffShape());
    expect(prompt).not.toContain(SECRET_RAW_DIFF);
    // Sanity: the hunk header IS present (so the test isn't vacuous).
    expect(prompt).toContain('@@ -1,1 +1,2 @@');
  });
});

describe('buildUserPrompt — wrapUntrusted coverage', () => {
  it('wraps title, body, issue and spec in <untrusted> blocks', () => {
    const sources: GatheredIntentSources = {
      pr: { id: 'pr-1', number: 9, title: 'Fix bug', body: 'Fixes a thing' },
      issue: { number: 12, title: 'Bug report', body: 'Steps to reproduce' },
      spec: { path: 'docs/specs/x.md', text: 'The plan text' },
      files: [],
      commitMessages: [],
      attempts: [],
    };
    const prompt = buildUserPrompt(sources);
    expect(prompt).toContain('<untrusted source="title">');
    expect(prompt).toContain('<untrusted source="body">');
    expect(prompt).toContain('<untrusted source="issue">');
    expect(prompt).toContain('<untrusted source="spec">');
  });

  it('reports an unreferenced/unresolved issue and spec as not available, never invented', () => {
    const sources: GatheredIntentSources = {
      pr: { id: 'pr-1', number: 9, title: 'Fix bug', body: null },
      issue: null,
      spec: null,
      files: [],
      commitMessages: [],
      attempts: [],
    };
    const prompt = buildUserPrompt(sources);
    expect(prompt).toContain('## Linked issue\n(not available)');
    expect(prompt).toContain('## Linked plan/spec\n(not available)');
  });
});

/**
 * Renders a stored `PrIntentRecord` for `ReviewInput.intent` (plan §5): the
 * summary plus in/out-of-scope bullets and, importantly, the
 * `missing_context` gaps — so the reviewer sees what evidence was thin, not
 * just a confident-sounding sentence.
 */
describe('renderIntentForPrompt', () => {
  function record(over: Partial<PrIntentRecord> = {}): PrIntentRecord {
    return {
      pr_id: 'pr-1',
      intent: 'Add a caching layer for repo indexing.',
      in_scope: [],
      out_of_scope: [],
      sources: [],
      missing_context: [],
      head_sha: 'abc123',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      generated_at: '2026-09-24T00:00:00.000Z',
      ...over,
    };
  }

  it('always includes the summary sentence', () => {
    const text = renderIntentForPrompt(record());
    expect(text).toContain('Add a caching layer for repo indexing.');
  });

  it('renders in-scope and out-of-scope bullets when present', () => {
    const text = renderIntentForPrompt(
      record({ in_scope: ['Cache warmup on index'], out_of_scope: ['Cache eviction policy'] }),
    );
    expect(text).toContain('In scope:');
    expect(text).toContain('- Cache warmup on index');
    expect(text).toContain('Out of scope:');
    expect(text).toContain('- Cache eviction policy');
  });

  it('omits the in-scope/out-of-scope sections when empty', () => {
    const text = renderIntentForPrompt(record());
    expect(text).not.toContain('In scope:');
    expect(text).not.toContain('Out of scope:');
  });

  it('includes missing_context so the reviewer sees the gaps too', () => {
    const text = renderIntentForPrompt(
      record({ missing_context: ['Linked spec "docs/specs/x.md" could not be read'] }),
    );
    expect(text).toContain('Missing context');
    expect(text).toContain('Linked spec "docs/specs/x.md" could not be read');
  });

  it('omits the missing-context section when nullish or empty', () => {
    expect(renderIntentForPrompt(record({ missing_context: null }))).not.toContain('Missing context');
    expect(renderIntentForPrompt(record({ missing_context: [] }))).not.toContain('Missing context');
  });
});
