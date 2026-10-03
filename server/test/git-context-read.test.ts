import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

/** Real git, temp dir, no Docker: pins the listing and read-containment rules. */
describe('SimpleGitClient context reads', () => {
  let base: string;
  let client: SimpleGitClient;
  const repo = { owner: 'o', name: 'r' };

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'dd-git-'));
    const dir = join(base, 'o', 'r');
    await mkdir(join(dir, 'docs'), { recursive: true });
    await writeFile(join(dir, 'docs', 'a.md'), '# a');
    await symlink('/etc/hosts', join(dir, 'docs', 'link.md'));
    const git = simpleGit(dir);
    await git.init();
    await git.addConfig('user.email', 't@t');
    await git.addConfig('user.name', 't');
    await git.add('.');
    await git.commit('init');
    client = new SimpleGitClient(base);
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('lists regular files, omitting symlinks and .git', async () => {
    const files = await client.listFiles(repo);
    expect(files).toEqual(['docs/a.md']);
    expect(files.some((f) => f.startsWith('.git/'))).toBe(false);
  });

  it('reads a contained file', async () => {
    expect(await client.readFile(repo, 'docs/a.md')).toBe('# a');
  });

  it('rejects traversal, absolute paths and escaping symlinks', async () => {
    await expect(client.readFile(repo, '../x')).rejects.toThrow();
    await expect(client.readFile(repo, '/etc/hosts')).rejects.toThrow();
    await expect(client.readFile(repo, 'docs/link.md')).rejects.toThrow();
    await expect(client.readFileAt(repo, 'HEAD', '../x')).rejects.toThrow();
  });

  it('refuses to read anything under .git, in any case', async () => {
    await expect(client.readFile(repo, '.git/config')).rejects.toThrow();
    await expect(client.readFile(repo, '.GIT/config')).rejects.toThrow();
    await expect(client.readFile(repo, './.git/config')).rejects.toThrow();
  });

  it('resolves HEAD to a 40-char sha', async () => {
    expect(await client.resolveRef(repo, 'HEAD')).toMatch(/^[0-9a-f]{40}$/);
  });
});
