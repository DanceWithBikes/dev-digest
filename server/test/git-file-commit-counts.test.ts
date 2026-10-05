import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

/** Real git, temp dirs, no Docker, no network (the remote is a local path). */
describe('SimpleGitClient.countFileCommits', () => {
  let base: string;
  const repo = { owner: 'o', name: 'r' };
  const TOTAL = 60;
  let full: SimpleGitClient;
  let depth1: SimpleGitClient;
  let depth60: SimpleGitClient;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'dd-count-'));
    const origin = join(base, 'origin');
    await mkdir(origin, { recursive: true });
    const git = simpleGit(origin);
    await git.init();
    await git.addConfig('user.email', 't@t');
    await git.addConfig('user.name', 't');
    for (let i = 1; i <= TOTAL; i++) {
      await writeFile(join(origin, 'hot.txt'), String(i));
      if (i % 2 === 0) await writeFile(join(origin, 'even.txt'), String(i));
      if (i === TOTAL) await writeFile(join(origin, 'café.txt'), 'x');
      await git.add('.');
      await git.commit(`c${i}`);
    }
    const url = `file://${origin}`;
    for (const [dir, depth] of [['full', 0], ['d1', 1], ['d60', 60]] as const) {
      await mkdir(join(base, dir, 'o'), { recursive: true });
      const args = depth ? ['--depth', String(depth)] : [];
      await simpleGit(base).clone(url, join(base, dir, 'o', 'r'), args);
    }
    full = new SimpleGitClient(join(base, 'full'));
    depth1 = new SimpleGitClient(join(base, 'd1'));
    depth60 = new SimpleGitClient(join(base, 'd60'));
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('a depth-1 clone has only a boundary commit, so nothing is counted', async () => {
    expect(await depth1.countFileCommits(repo, 50)).toEqual({ commits: 0, byPath: {} });
  });

  it('counts at most maxCommits commits', async () => {
    const r = await full.countFileCommits(repo, 50);
    expect(r.commits).toBe(50);
    expect(r.byPath['hot.txt']).toBe(50);
    expect(r.byPath['even.txt']).toBe(25);
  });

  it('treats the oldest commit of a --depth N clone as boundary even when N covers the history', async () => {
    // git records the root in `shallow` for a depth-60 clone of a 60-commit
    // history, and a root lists every file as added, so it is excluded: 59.
    const r = await depth60.countFileCommits(repo, 100);
    expect(r.commits).toBe(TOTAL - 1);
  });

  it('excludes the boundary of a clone shallower than the history', async () => {
    await mkdir(join(base, 'd10', 'o'), { recursive: true });
    await simpleGit(base).clone(`file://${join(base, 'origin')}`, join(base, 'd10', 'o', 'r'), ['--depth', '10']);
    const r = await new SimpleGitClient(join(base, 'd10')).countFileCommits(repo, 50);
    expect(r.commits).toBe(9);
    // the boundary commit would have listed every file; hot.txt is touched by all 9 real commits
    expect(r.byPath['hot.txt']).toBe(9);
  });

  it('counts a non-ASCII path verbatim', async () => {
    const r = await full.countFileCommits(repo, 50);
    expect(r.byPath['café.txt']).toBe(1);
  });

  it('is deterministic', async () => {
    expect(await full.countFileCommits(repo, 50)).toEqual(await full.countFileCommits(repo, 50));
  });
});
