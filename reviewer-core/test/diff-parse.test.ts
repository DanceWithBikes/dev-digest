import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff, fileDiff } from '../src/index.js';
import { DIFF_CORPUS } from './fixtures/diff-corpus.js';
import golden from './fixtures/diff-parse.golden.json';

/**
 * The golden file was captured by running the HEAD version of the server's
 * `adapters/git/diff-parser.ts` over DIFF_CORPUS before the parser moved
 * (AC-8, AC-9) - equivalence is proven against the old implementation, not
 * against itself.
 */
describe('parseUnifiedDiff (moved)', () => {
  for (const [name, raw] of Object.entries(DIFF_CORPUS)) {
    it(`matches the HEAD parser: ${name}`, () => {
      expect(parseUnifiedDiff(raw)).toEqual((golden as Record<string, unknown>)[name]);
    });
  }

  it('golden file covers every corpus entry', () => {
    expect(Object.keys(golden).sort()).toEqual(Object.keys(DIFF_CORPUS).sort());
  });
});

describe('fileDiff', () => {
  const patch = '@@ -1,2 +1,3 @@\n a\n+b\n c';

  it('prepends the --- / +++ header', () => {
    expect(fileDiff('src/x.ts', patch).startsWith('--- a/src/x.ts\n+++ b/src/x.ts\n@@')).toBe(true);
  });

  it('turns a headerless patch into exactly 1 file with that path', () => {
    expect(parseUnifiedDiff(patch).files).toHaveLength(0);
    const parsed = parseUnifiedDiff(fileDiff('src/x.ts', patch));
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]?.path).toBe('src/x.ts');
    expect(parsed.files[0]?.additions).toBe(1);
  });
});

describe('parseUnifiedDiff hunk-count awareness', () => {
  it('keeps the file and line numbers when content lines start with ++ / --', () => {
    const raw = [
      'diff --git a/a.md b/a.md',
      '--- a/a.md',
      '+++ b/a.md',
      '@@ -1,3 +1,3 @@',
      ' keep',
      '--- removed rule',
      '+++ added rule',
      ' tail',
    ].join('\n');
    const parsed = parseUnifiedDiff(raw);
    expect(parsed.files).toHaveLength(1);
    const f = parsed.files[0]!;
    expect(f.path).toBe('a.md');
    expect(f.additions).toBe(1);
    expect(f.deletions).toBe(1);
    expect(f.hunks[0]?.newLineNumbers).toEqual([1, 2, 3]);
  });

  it('parses two concatenated fileDiff() outputs as 2 files', () => {
    const a = fileDiff('a.ts', '@@ -1,2 +1,2 @@\n x\n-y\n+z');
    const b = fileDiff('b.ts', '@@ -1 +1,2 @@\n p\n+q');
    const parsed = parseUnifiedDiff(`${a}\n${b}`);
    expect(parsed.files.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
    expect(parsed.files[1]?.hunks[0]?.newLineNumbers).toEqual([1, 2]);
  });
});
