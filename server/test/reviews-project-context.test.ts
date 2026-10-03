import { describe, it, expect } from 'vitest';
import type { RepoRef } from '@devdigest/shared';
import { collectContextPaths } from '../src/modules/reviews/helpers.js';
import { GitContextDocReader } from '../src/modules/_shared/context-doc-reader.js';
import type { Container } from '../src/platform/container.js';

const REPO: RepoRef = { owner: 'o', name: 'r' };
const PR = { number: 7, headSha: 'headsha' };

describe('collectContextPaths', () => {
  it('puts the agent first, then enabled skills in link order, ascending within an owner', () => {
    const out = collectContextPaths(
      ['b.md', 'a.md'],
      [
        { skill: { name: 'S1', enabled: true }, paths: ['z.md', 'c.md'] },
        { skill: { name: 'S2', enabled: false }, paths: ['off.md'] },
        { skill: { name: 'S3', enabled: true }, paths: ['d.md'] },
      ],
    );
    expect(out).toEqual([
      { path: 'a.md', origin: 'agent' },
      { path: 'b.md', origin: 'agent' },
      { path: 'c.md', origin: 'skill: S1' },
      { path: 'z.md', origin: 'skill: S1' },
      { path: 'd.md', origin: 'skill: S3' },
    ]);
  });

  it('keeps the first origin of a duplicated path', () => {
    const out = collectContextPaths(
      ['a.md'],
      [
        { skill: { name: 'S1', enabled: true }, paths: ['a.md', 'b.md'] },
        { skill: { name: 'S2', enabled: true }, paths: ['b.md'] },
      ],
    );
    expect(out).toEqual([
      { path: 'a.md', origin: 'agent' },
      { path: 'b.md', origin: 'skill: S1' },
    ]);
  });
});

function fakeGit(o: {
  head?: Record<string, string>;
  pr?: Record<string, string>;
  tree?: Record<string, string>;
  /** Paths git tracks; defaults to every `tree` path. */
  tracked?: string[];
  fetchFails?: boolean;
}) {
  const calls = { fetch: 0 };
  const git = {
    async readFileAt(_r: RepoRef, ref: string, path: string) {
      const src = ref === 'headsha' ? o.head : ref === 'pr-7' ? o.pr : undefined;
      if (src && path in src) return src[path]!;
      throw new Error('nope');
    },
    async fetchPullHead() {
      calls.fetch++;
      if (o.fetchFails) throw new Error('offline');
    },
    async resolveRef() {
      return 'resolved40';
    },
    async listFiles() {
      return o.tracked ?? Object.keys(o.tree ?? {});
    },
    async readFile(_r: RepoRef, path: string) {
      if (o.tree && path in o.tree) return o.tree[path]!;
      throw new Error('nope');
    },
  };
  return { reader: new GitContextDocReader({ git } as unknown as Container), calls };
}

describe('GitContextDocReader', () => {
  it('records the head sha when the head read hits, with no fetch', async () => {
    const { reader, calls } = fakeGit({ head: { 'a.md': 'A' } });
    const out = await reader.readAll(REPO, PR, ['a.md']);
    expect(out.get('a.md')).toEqual({ text: 'A', version: 'headsha' });
    expect(calls.fetch).toBe(0);
  });

  it('fetches the PR head once for several paths and records the resolved sha', async () => {
    const { reader, calls } = fakeGit({ pr: { 'a.md': 'A', 'b.md': 'B' } });
    const out = await reader.readAll(REPO, PR, ['a.md', 'b.md']);
    expect(calls.fetch).toBe(1);
    expect(out.get('a.md')?.version).toBe('resolved40');
    expect(out.get('b.md')?.version).toBe('resolved40');
  });

  it('falls back to the working tree', async () => {
    const { reader } = fakeGit({ fetchFails: true, tree: { 'a.md': 'T' } });
    const out = await reader.readAll(REPO, PR, ['a.md']);
    expect(out.get('a.md')).toEqual({ text: 'T', version: 'working-tree' });
  });

  it('does not read an untracked path from the working tree', async () => {
    const { reader } = fakeGit({
      fetchFails: true,
      tree: { 'a.md': 'T', '.git/config': 'token', 'untracked.md': 'U' },
      tracked: ['a.md'],
    });
    const out = await reader.readAll(REPO, PR, ['a.md', '.git/config', 'untracked.md']);
    expect(out.get('a.md')).toEqual({ text: 'T', version: 'working-tree' });
    expect(out.has('.git/config')).toBe(false);
    expect(out.has('untracked.md')).toBe(false);
  });

  it('omits a path nothing can read', async () => {
    const { reader } = fakeGit({});
    const out = await reader.readAll(REPO, PR, ['gone.md']);
    expect(out.has('gone.md')).toBe(false);
  });
});
