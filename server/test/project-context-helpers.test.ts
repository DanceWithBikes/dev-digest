import { describe, it, expect } from 'vitest';
import {
  compileRoots,
  docTypeFor,
  estimateTokens,
  flagMissing,
  globToRegExp,
  isExcluded,
  isMarkdown,
  matchesCompiled,
  matchesRoots,
  validateRelativePath,
  validateRoot,
} from '../src/modules/project-context/helpers.js';
import { DEFAULT_SEARCH_ROOTS } from '../src/modules/project-context/constants.js';

describe('project-context helpers', () => {
  it('default roots match docs, specs and insights folders', () => {
    expect(matchesRoots('docs/insights.md', DEFAULT_SEARCH_ROOTS)).toBe(true);
    expect(
      matchesRoots('server/src/modules/reviews/docs/specs/x.md', DEFAULT_SEARCH_ROOTS),
    ).toBe(true);
    expect(matchesRoots('a/insights/b.md', DEFAULT_SEARCH_ROOTS)).toBe(true);
    expect(matchesRoots('README.md', DEFAULT_SEARCH_ROOTS)).toBe(false);
    expect(matchesRoots('docs/a.txt', DEFAULT_SEARCH_ROOTS)).toBe(false);
  });

  it('excludes node_modules and .git whatever the roots', () => {
    expect(isExcluded('node_modules/x/docs/a.md')).toBe(true);
    expect(isExcluded('a/.git/docs/a.md')).toBe(true);
    expect(isExcluded('docs/a.md')).toBe(false);
  });

  it('globs support *, ? and **', () => {
    expect(matchesRoots('a/b.md', ['*/*.md'])).toBe(true);
    expect(matchesRoots('a/c/b.md', ['*/*.md'])).toBe(false);
    expect(matchesRoots('x.md', ['**/*.md'])).toBe(true);
    expect(matchesRoots('ab.md', ['a?.md'])).toBe(true);
  });

  it('docTypeFor applies spec first', () => {
    expect(docTypeFor('docs/specs/a.md')).toBe('spec');
    expect(docTypeFor('docs/insights.md')).toBe('insights');
    expect(docTypeFor('x/insights/a.md')).toBe('insights');
    expect(docTypeFor('docs/guide.md')).toBe('doc');
    expect(docTypeFor('specs/insights.md')).toBe('spec');
  });

  it('estimates tokens as ceil(chars/4)', () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens('abcde'.length)).toBe(2);
  });

  it('rejects unsafe paths and roots', () => {
    for (const bad of ['../a', '/a', 'a/../b', '', '  ', 'a\0b']) {
      expect(validateRelativePath(bad)).not.toBeNull();
      expect(validateRoot(bad)).not.toBeNull();
    }
    expect(validateRelativePath('docs/a.md')).toBeNull();
    expect(validateRoot('**/docs/**/*.md')).toBeNull();
  });

  it('rejects any .git segment in attachment paths, case-insensitively', () => {
    for (const bad of ['.git/config', '.GIT/config', 'a/.Git/b.md', 'a\\.git\\config']) {
      expect(validateRelativePath(bad)).not.toBeNull();
    }
    expect(validateRelativePath('.github/a.md')).toBeNull();
    expect(validateRelativePath('docs/.gitignore')).toBeNull();
  });

  it('excludes .git and node_modules segments in any case', () => {
    expect(isExcluded('.GIT/config')).toBe(true);
    expect(isExcluded('a/Node_Modules/x.md')).toBe(true);
  });

  it('rejects ReDoS-prone, oversized and uncompilable roots', () => {
    expect(validateRoot('**a**a**a**a**a**b')).not.toBeNull();
    expect(validateRoot('{a,b')).not.toBeNull();
    expect(validateRoot('a'.repeat(257))).not.toBeNull();
    expect(validateRoot('*/*/*/*/*.md')).not.toBeNull();
    expect(validateRoot('docs/{a,b}/**/*.md')).toBeNull();
  });

  it('collapses consecutive ** segments', () => {
    expect(globToRegExp('**/**/**/a.md').source).toBe(globToRegExp('**/a.md').source);
    expect(matchesRoots('x/y/a.md', ['**/**/a.md'])).toBe(true);
  });

  it('compiles roots once and matches against them', () => {
    const compiled = compileRoots(['docs/**']);
    expect(matchesCompiled('docs/a.md', compiled)).toBe(true);
    expect(matchesCompiled('src/a.md', compiled)).toBe(false);
  });

  it('isMarkdown is case-insensitive', () => {
    expect(isMarkdown('a/B.MD')).toBe(true);
    expect(isMarkdown('docs/readme.txt')).toBe(false);
  });

  it('flags missing attachments', () => {
    expect(flagMissing(['a', 'b'], new Set(['a']))).toEqual([
      { path: 'a', missing: false },
      { path: 'b', missing: true },
    ]);
  });
});
