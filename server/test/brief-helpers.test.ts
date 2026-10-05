/**
 * Pins the PR Brief input-selection and grounding rules (SPEC-03) as pure
 * functions, derived from the acceptance criteria text:
 * AC-17..AC-19, AC-21..AC-25, AC-27..AC-32, AC-36..AC-42, AC-44 (counts), AC-45.
 * Decisions 2026-10-03: AC-31/32 stop at the first overflowing patch and count
 * only patches that existed and were withheld.
 * Hunk fixtures are built from header text, never from line arithmetic.
 */
import { describe, it, expect } from 'vitest';
import type { BlastRadius, Risk, ReviewFocusItem } from '@devdigest/shared';
import {
  allowedPaths,
  applyDiffBudget,
  applyDocBudget,
  blastMissing,
  callerLines,
  capBody,
  collectBriefDocPaths,
  groundBrief,
  intentMissing,
  newSideRanges,
  parseRefPath,
} from '../src/modules/brief/helpers.js';
import type { AttachmentOwner, BriefFile, StoredIntent } from '../src/modules/brief/domain.js';

const file = (over: Partial<BriefFile> = {}): BriefFile => ({
  path: 'src/a.ts',
  additions: 1,
  deletions: 0,
  patch: null,
  ...over,
});

const blastOf = (over: Partial<BlastRadius> = {}): BlastRadius => ({
  changed_symbols: [],
  downstream: [],
  summary: 'summary',
  ...over,
});

const withCaller = (fileName: string, line: number): BlastRadius =>
  blastOf({
    downstream: [
      {
        symbol: 'sym',
        callers: [{ name: 'caller', file: fileName, line }],
        endpoints_affected: [],
        crons_affected: [],
      },
    ],
  });

const risk = (refs: string[], over: Partial<Risk> = {}): Risk => ({
  kind: 'k',
  title: 't',
  explanation: 'e',
  severity: 'low',
  file_refs: refs,
  ...over,
});

const focus = (f: string, line: number): ReviewFocusItem => ({ file: f, line, reason: 'r' });

const owner = (over: Partial<AttachmentOwner> & { name: string }): AttachmentOwner => ({
  id: over.name,
  createdAt: new Date(0),
  paths: [],
  skills: [],
  ...over,
});

describe('brief helpers - intent missing entries (AC-18, AC-19)', () => {
  const intent = (headSha: string | null): StoredIntent => ({
    intent: 'x',
    in_scope: [],
    out_of_scope: [],
    headSha,
  });

  it('reports "no intent derived for this PR" when no intent is stored', () => {
    expect(intentMissing(null, 'abc')).toEqual({
      source: 'intent',
      reason: 'no intent derived for this PR',
    });
  });

  it('reports a stale intent when its head SHA differs from the PR head', () => {
    const m = intentMissing(intent('1111111aaaa'), '2222222bbbb');
    expect(m?.source).toBe('intent');
    expect(m?.reason).toMatch(/stale/);
  });

  it('treats an intent with an unknown head SHA as stale', () => {
    expect(intentMissing(intent(null), 'abc')?.reason).toMatch(/stale/);
  });

  it('adds nothing when the intent matches the head SHA', () => {
    expect(intentMissing(intent('abc'), 'abc')).toBeNull();
  });
});

describe('brief helpers - blast missing entries (AC-21, AC-22)', () => {
  it('reports "blast radius unavailable" when the map could not be read', () => {
    expect(blastMissing(null)).toEqual({ source: 'blast', reason: 'blast radius unavailable' });
  });

  it('puts the degradation reason code into the reason', () => {
    const m = blastMissing(blastOf({ degraded: true, reason: 'repo_too_large' }));
    expect(m?.source).toBe('blast');
    expect(m?.reason).toContain('repo_too_large');
  });

  it('adds nothing for a healthy map', () => {
    expect(blastMissing(blastOf())).toBeNull();
  });
});

describe('brief helpers - document collection order (AC-23..AC-25)', () => {
  it('orders agents by name ascending', () => {
    const out = collectBriefDocPaths([
      owner({ name: 'zeta', paths: ['z.md'] }),
      owner({ name: 'alpha', paths: ['a.md'] }),
    ]);
    expect(out).toEqual(['a.md', 'z.md']);
  });

  it('puts an agent own paths first (ascending), then skills in link order with ascending paths', () => {
    const out = collectBriefDocPaths([
      owner({
        name: 'agent',
        paths: ['b.md', 'a.md'],
        skills: [
          { id: 's-late', name: 'late', order: 2, paths: ['d.md', 'c.md'] },
          { id: 's-early', name: 'early', order: 1, paths: ['z.md', 'y.md'] },
        ],
      }),
    ]);
    expect(out).toEqual(['a.md', 'b.md', 'y.md', 'z.md', 'c.md', 'd.md']);
  });

  it('keeps a path attached more than once only at its first position', () => {
    const out = collectBriefDocPaths([
      owner({ name: 'a', paths: ['shared.md', 'a.md'] }),
      owner({
        name: 'b',
        paths: ['shared.md'],
        skills: [{ id: 's', name: 's', order: 1, paths: ['a.md', 'new.md'] }],
      }),
    ]);
    expect(out).toEqual(['a.md', 'shared.md', 'new.md']);
  });

  it('returns nothing when no owner has attachments', () => {
    expect(collectBriefDocPaths([owner({ name: 'a' })])).toEqual([]);
  });
});

describe('brief helpers - document token budget (AC-27..AC-30)', () => {
  const reads = (entries: Record<string, number>) =>
    new Map(Object.entries(entries).map(([p, n]) => [p, { text: 'x'.repeat(n) }]));

  it('sends a document of exactly 20,000 estimated tokens (80,000 chars)', () => {
    const r = applyDocBudget(['a.md'], reads({ 'a.md': 80_000 }));
    expect(r.sent.map((d) => d.path)).toEqual(['a.md']);
    expect(r.missing).toEqual([]);
  });

  it('skips a document at 20,001 estimated tokens, rounding characters / 4 up', () => {
    const r = applyDocBudget(['a.md'], reads({ 'a.md': 80_001 }));
    expect(r.sent).toEqual([]);
    expect(r.missing).toHaveLength(1);
  });

  it('skips only the document that would cross the budget and still sends a later one that fits', () => {
    const r = applyDocBudget(
      ['a.md', 'big.md', 'c.md'],
      reads({ 'a.md': 60_000, 'big.md': 40_000, 'c.md': 20_000 }),
    );
    expect(r.sent.map((d) => d.path)).toEqual(['a.md', 'c.md']);
    expect(r.missing).toHaveLength(1);
  });

  it('names the skipped path and the 20,000-token budget in the missing entry', () => {
    const r = applyDocBudget(['big.md'], reads({ 'big.md': 90_000 }));
    expect(r.missing[0]).toMatchObject({ source: 'specs' });
    expect(r.missing[0]!.reason).toContain('big.md');
    expect(r.missing[0]!.reason).toMatch(/exceeded.*20,000-token budget/);
  });

  it('sends documents whole and in collection order', () => {
    const r = applyDocBudget(['b.md', 'a.md'], reads({ 'a.md': 4, 'b.md': 8 }));
    expect(r.sent).toEqual([
      { path: 'b.md', text: 'x'.repeat(8) },
      { path: 'a.md', text: 'x'.repeat(4) },
    ]);
  });

  it('reports an unreadable document by path with the words "not found"', () => {
    const r = applyDocBudget(['gone.md', 'a.md'], reads({ 'a.md': 4 }));
    expect(r.sent.map((d) => d.path)).toEqual(['a.md']);
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0]!.source).toBe('specs');
    expect(r.missing[0]!.reason).toContain('gone.md');
    expect(r.missing[0]!.reason).toContain('not found');
  });

  it('reports "no project context documents attached" when nothing was planned', () => {
    expect(applyDocBudget([], new Map())).toEqual({
      sent: [],
      missing: [{ source: 'specs', reason: 'no project context documents attached' }],
    });
  });
});

describe('brief helpers - diff patch budget (AC-31, AC-32)', () => {
  const patchFile = (path: string, n: number): BriefFile => file({ path, patch: 'p'.repeat(n) });

  it('sends every patch when the total is exactly 60,000 chars', () => {
    const r = applyDiffBudget([patchFile('a', 30_000), patchFile('b', 30_000)]);
    expect(r.files.every((f) => f.patch !== null)).toBe(true);
    expect(r.withheld).toBe(0);
    expect(r.missing).toBeNull();
  });

  it('withholds the patch that would cross 60,000 chars and every later one, even a small one that would fit', () => {
    const r = applyDiffBudget([
      patchFile('a', 40_000),
      patchFile('b', 30_000),
      patchFile('c', 10),
    ]);
    expect(r.files.map((f) => f.patch !== null)).toEqual([true, false, false]);
    expect(r.withheld).toBe(2);
  });

  it('keeps path, additions and deletions of a file sent without its patch', () => {
    const r = applyDiffBudget([
      patchFile('a', 60_000),
      { path: 'b', additions: 7, deletions: 3, patch: 'x' },
    ]);
    expect(r.files[1]).toEqual({ path: 'b', additions: 7, deletions: 3, patch: null });
  });

  it('keeps the PR file order', () => {
    const r = applyDiffBudget([patchFile('z', 1), patchFile('a', 1), patchFile('m', 1)]);
    expect(r.files.map((f) => f.path)).toEqual(['z', 'a', 'm']);
  });

  it('does not count a file that never had a patch as truncated', () => {
    const r = applyDiffBudget([file({ path: 'bin', patch: null }), patchFile('a', 10)]);
    expect(r.withheld).toBe(0);
    expect(r.missing).toBeNull();
  });

  it('reports "diff truncated (N files)" with N = files sent without a patch', () => {
    const r = applyDiffBudget([patchFile('a', 60_000), patchFile('b', 1), patchFile('c', 1)]);
    expect(r.missing).toEqual({ source: 'diff', reason: 'diff truncated (2 files)' });
  });

  it('reports "diff truncated (1 file)" in the singular when N is 1 (AC-32, plan decision)', () => {
    const r = applyDiffBudget([patchFile('a', 60_000), patchFile('b', 1)]);
    expect(r.missing?.reason).toBe('diff truncated (1 file)');
  });
});

describe('brief helpers - body cap', () => {
  it('leaves a short body untouched', () => {
    expect(capBody('hi')).toEqual({ text: 'hi', truncated: false });
  });

  it('truncates an oversized body and flags it', () => {
    const r = capBody('x'.repeat(20_000));
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThan(20_000);
  });
});

describe('brief helpers - allowed path set (AC-36)', () => {
  it('is the changed files plus every blast caller file', () => {
    const set = allowedPaths([file({ path: 'src/a.ts' })], withCaller('src/caller.ts', 3));
    expect([...set].sort()).toEqual(['src/a.ts', 'src/caller.ts']);
  });

  it('is just the changed files when the blast map is null', () => {
    expect([...allowedPaths([file({ path: 'src/a.ts' })], null)]).toEqual(['src/a.ts']);
  });

  it('does not include changed symbol files that are not callers', () => {
    const blast = blastOf({ changed_symbols: [{ name: 's', file: 'src/sym.ts', kind: 'function' }] });
    expect(allowedPaths([file()], blast).has('src/sym.ts')).toBe(false);
  });

  it('collects the caller lines per file', () => {
    expect(callerLines(withCaller('src/c.ts', 9)).get('src/c.ts')).toEqual(new Set([9]));
  });
});

describe('brief helpers - file ref path part (AC-37)', () => {
  it.each([
    ['src/a.ts', 'src/a.ts'],
    ['src/a.ts:12', 'src/a.ts'],
    ['src/a.ts:12-30', 'src/a.ts'],
  ])('takes the text before an optional line suffix of %s', (ref, path) => {
    expect(parseRefPath(ref)).toBe(path);
  });

  it('does not strip a suffix that is not a line number', () => {
    expect(parseRefPath('src/a.ts:abc')).toBe('src/a.ts:abc');
  });
});

describe('brief helpers - new-side hunk ranges', () => {
  it('reads start and length from the header text', () => {
    expect(newSideRanges('@@ -1,3 +10,4 @@\n x\n@@ -20,2 +30,2 @@ fn\n y')).toEqual([
      [10, 13],
      [30, 31],
    ]);
  });

  it('treats a header without a length as one line', () => {
    expect(newSideRanges('@@ -1 +5 @@\n x')).toEqual([[5, 5]]);
  });

  it('skips a pure-deletion hunk with new length 0', () => {
    expect(newSideRanges('@@ -4,2 +3,0 @@\n-x')).toEqual([]);
  });
});

describe('brief helpers - grounding risks (AC-37, AC-38, AC-44, AC-45)', () => {
  const files = [file({ path: 'src/a.ts' })];

  it('removes file refs outside the allowed set and keeps those with a line suffix whose path is allowed', () => {
    const r = groundBrief(
      {
        summary: 's',
        risks: [risk(['src/a.ts:5-9', 'src/invented.ts:3', 'src/a.ts'])],
        review_focus: [],
      },
      { files, blast: null },
    );
    expect(r.risks[0]!.file_refs).toEqual(['src/a.ts:5-9', 'src/a.ts']);
    expect(r.dropped.fileRefs).toBe(1);
  });

  it('accepts a caller file from the blast map as a ref', () => {
    const r = groundBrief(
      { summary: 's', risks: [risk(['src/caller.ts:3'])], review_focus: [] },
      { files, blast: withCaller('src/caller.ts', 3) },
    );
    expect(r.risks).toHaveLength(1);
  });

  it('drops a risk left with no file ref and counts it', () => {
    const r = groundBrief(
      { summary: 's', risks: [risk(['nope.ts']), risk(['src/a.ts'], { title: 'kept' })], review_focus: [] },
      { files, blast: null },
    );
    expect(r.risks.map((x) => x.title)).toEqual(['kept']);
    expect(r.dropped).toEqual({ fileRefs: 1, risks: 1, focus: 0 });
  });

  it('drops a risk that had no file refs to begin with', () => {
    const r = groundBrief({ summary: 's', risks: [risk([])], review_focus: [] }, { files, blast: null });
    expect(r.risks).toEqual([]);
    expect(r.dropped.risks).toBe(1);
  });

  it('returns empty lists with zero drops for an empty model output', () => {
    const r = groundBrief({ summary: 's', risks: [], review_focus: [] }, { files, blast: null });
    expect(r).toEqual({ risks: [], review_focus: [], dropped: { fileRefs: 0, risks: 0, focus: 0 } });
  });

  it('leaves everything empty when nothing survives grounding', () => {
    const r = groundBrief(
      { summary: 's', risks: [risk(['x.ts'])], review_focus: [focus('x.ts', 1)] },
      { files, blast: null },
    );
    expect(r.risks).toEqual([]);
    expect(r.review_focus).toEqual([]);
    expect(r.dropped).toEqual({ fileRefs: 1, risks: 1, focus: 1 });
  });
});

describe('brief helpers - grounding review focus (AC-39..AC-41)', () => {
  const patch = '@@ -1,3 +10,4 @@\n a\n@@ -20,2 +30,2 @@\n b';
  const files = [file({ path: 'src/a.ts', patch }), file({ path: 'src/nopatch.ts', patch: null })];

  const ground = (items: ReviewFocusItem[], blast: BlastRadius | null = null) =>
    groundBrief({ summary: 's', risks: [], review_focus: items }, { files, blast });

  it('drops an item whose file is not allowed', () => {
    const r = ground([focus('src/other.ts', 1)]);
    expect(r.review_focus).toEqual([]);
    expect(r.dropped.focus).toBe(1);
  });

  it('keeps a line inside a new-side hunk, including both range ends', () => {
    const r = ground([focus('src/a.ts', 10), focus('src/a.ts', 13), focus('src/a.ts', 31)]);
    expect(r.review_focus.map((i) => i.line)).toEqual([10, 13, 31]);
  });

  it('moves a line outside every hunk to the start of the first new-side hunk', () => {
    const r = ground([focus('src/a.ts', 500), focus('src/a.ts', 14), focus('src/a.ts', 1)]);
    expect(r.review_focus.map((i) => i.line)).toEqual([10, 10, 10]);
  });

  it('keeps the line of a changed file that has no patch', () => {
    const r = ground([focus('src/nopatch.ts', 77)]);
    expect(r.review_focus[0]!.line).toBe(77);
  });

  it('keeps a blast-only file item only when its line equals a listed caller line', () => {
    const blast = withCaller('src/caller.ts', 42);
    const r = ground([focus('src/caller.ts', 42), focus('src/caller.ts', 43)], blast);
    expect(r.review_focus.map((i) => i.line)).toEqual([42]);
    expect(r.dropped.focus).toBe(1);
  });

  it('keeps the reason and file unchanged when only the line is corrected', () => {
    const r = ground([{ file: 'src/a.ts', line: 999, reason: 'why' }]);
    expect(r.review_focus[0]).toEqual({ file: 'src/a.ts', line: 10, reason: 'why' });
  });
});

describe('brief helpers - grounding caps (AC-42)', () => {
  it('keeps the first 6 risks in model order', () => {
    const risks = Array.from({ length: 9 }, (_, i) => risk(['src/a.ts'], { title: `r${i}` }));
    const r = groundBrief({ summary: 's', risks, review_focus: [] }, { files: [file()], blast: null });
    expect(r.risks.map((x) => x.title)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
  });

  it('keeps the first 10 review focus items in model order', () => {
    const items = Array.from({ length: 13 }, (_, i) => focus('src/a.ts', i + 1));
    const r = groundBrief({ summary: 's', risks: [], review_focus: items }, { files: [file()], blast: null });
    expect(r.review_focus.map((i) => i.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('applies the cap after dropping, so surviving later items fill the slots', () => {
    const risks = [risk(['bad.ts']), ...Array.from({ length: 6 }, (_, i) => risk(['src/a.ts'], { title: `r${i}` }))];
    const r = groundBrief({ summary: 's', risks, review_focus: [] }, { files: [file()], blast: null });
    expect(r.risks.map((x) => x.title)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
  });
});
