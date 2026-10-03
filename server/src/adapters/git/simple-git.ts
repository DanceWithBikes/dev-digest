import { simpleGit, type SimpleGit } from 'simple-git';
import { join, sep, resolve } from 'node:path';
import { mkdir, readFile, access, rm, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 */
export class SimpleGitClient implements GitClient {
  constructor(private cloneDir: string) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  private git(repo: RepoRef): SimpleGit {
    return simpleGit(this.clonePathFor(repo));
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }> {
    const dest = this.clonePathFor(repo);
    await mkdir(join(this.cloneDir, repo.owner), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → fetch latest
      await simpleGit(dest).fetch();
      return { path: dest };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    const args: string[] = [];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    await simpleGit(this.cloneDir).clone(url, dest, args);
    return { path: dest };
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    await this.git(repo).fetch(['origin', `pull/${n}/head:pr-${n}`]);
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    const g = this.git(repo);
    await g.fetch(['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]);
    await g.reset(['--hard', `origin/${branch}`]);
    return { head: (await g.revparse(['HEAD'])).trim() };
  }

  async currentHead(repo: RepoRef): Promise<string> {
    return (await this.git(repo).revparse(['HEAD'])).trim();
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    const raw = await this.git(repo).diff([`${base}...${head}`]);
    return parseUnifiedDiff(raw);
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    const raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
    return parseBlamePorcelain(raw);
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    const log = await this.git(repo).log(path ? { file: path } : undefined);
    return log.all.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  /**
   * Working-tree read, contained to the clone: the path must be repo-relative
   * with no `..` segment, and after resolving symlinks the target must still
   * sit inside the clone (a committed symlink to `/etc/hosts` must not read).
   */
  async readFile(repo: RepoRef, path: string): Promise<string> {
    assertRelativePath(path);
    assertNotGitDir(path);
    const root = await realpath(this.clonePathFor(repo));
    const target = await realpath(join(root, path));
    if (!target.startsWith(root + sep)) throw new Error(`path escapes the clone: ${path}`);
    // The resolved target may sit in `.git` via a symlink or a case-folded name.
    assertNotGitDir(target.slice(root.length + 1));
    return readFile(target, 'utf8');
  }

  /**
   * Regular files tracked at HEAD. `-z` avoids git's quoting of unusual names;
   * mode 120000 (symlink) and 160000 (submodule) entries are skipped. Everything
   * in the index is tracked, so nothing under `.git/` can appear.
   */
  async listFiles(repo: RepoRef): Promise<string[]> {
    const raw = await this.git(repo).raw(['ls-tree', '-r', '-z', '--full-tree', 'HEAD']);
    const out: string[] = [];
    for (const entry of raw.split('\0')) {
      if (!entry) continue;
      const tab = entry.indexOf('\t');
      if (tab < 0) continue;
      const mode = entry.slice(0, entry.indexOf(' '));
      if (mode === '120000' || mode === '160000') continue;
      out.push(entry.slice(tab + 1));
    }
    return out;
  }

  /**
   * One `git log -n <max> --name-only -z` read over the local clone (no network).
   * `core.quotepath=off` plus `-z` keep non-ASCII paths verbatim. Shallow-boundary
   * commits (listed in the file `git rev-parse --git-path shallow` names) are
   * excluded from both `commits` and `byPath`: git shows a boundary commit as a
   * root that adds every file. `--name-only` lists nothing for merge commits, so a
   * merge adds to `commits` but contributes 0 file touches.
   */
  async countFileCommits(
    repo: RepoRef,
    maxCommits: number,
  ): Promise<{ commits: number; byPath: Record<string, number> }> {
    const g = this.git(repo);
    const boundary = await this.shallowBoundary(repo);
    const raw = await g.raw([
      '-c',
      'core.quotepath=off',
      'log',
      '-n',
      String(Math.max(0, Math.floor(maxCommits))),
      '--name-only',
      '-z',
      '--format=%x01%H%x02',
    ]);
    const byPath: Record<string, number> = {};
    let commits = 0;
    for (const chunk of raw.split('\x01')) {
      const end = chunk.indexOf('\x02');
      if (end < 0) continue;
      const sha = chunk.slice(0, end);
      if (boundary.has(sha)) continue;
      commits++;
      const seen = new Set<string>();
      for (const name of chunk.slice(end + 1).split('\0')) {
        const path = name.replace(/^\n+/, '');
        if (!path || seen.has(path)) continue;
        seen.add(path);
        byPath[path] = (byPath[path] ?? 0) + 1;
      }
    }
    return { commits, byPath };
  }

  /** Shas in the clone's `shallow` file; empty when the clone is not shallow. */
  private async shallowBoundary(repo: RepoRef): Promise<Set<string>> {
    const out = (await this.git(repo).raw(['rev-parse', '--git-path', 'shallow'])).trim();
    try {
      const text = await readFile(resolve(this.clonePathFor(repo), out), 'utf8');
      return new Set(text.split('\n').map((l) => l.trim()).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  async resolveRef(repo: RepoRef, ref: string): Promise<string> {
    const sha = await this.git(repo).raw(['rev-parse', '--verify', `${ref}^{commit}`]);
    return sha.trim();
  }

  /**
   * `git show <ref>:<path>` — the blob as of `ref`, read straight out of the
   * object store. Deliberately NOT a checkout: the clone is a shared read-only
   * mirror and moving its worktree would corrupt any concurrent read (`sync`
   * already owns HEAD). Throws when `ref` is not in the clone or the path does
   * not exist there, which is how callers detect "fetch the PR head first".
   */
  async readFileAt(repo: RepoRef, ref: string, path: string): Promise<string> {
    assertRelativePath(path);
    return this.git(repo).raw(['show', `${ref}:${path}`]);
  }
}

/** Lexical guard shared by the two read paths: repo-relative, no `..` segment, no NUL. */
function assertRelativePath(path: string): void {
  if (
    !path ||
    path.includes('\0') ||
    path.startsWith('/') ||
    path.startsWith('\\') ||
    /^[A-Za-z]:/.test(path) ||
    path.split(/[\\/]/).includes('..')
  ) {
    throw new Error(`invalid repo-relative path: ${path}`);
  }
}

/** The clone's `.git` holds the remote URL with its token: never readable as a file. */
function assertNotGitDir(clonePath: string): void {
  if (clonePath.split(/[\\/]/)[0]!.toLowerCase() === '.git') {
    throw new Error(`path is inside .git: ${clonePath}`);
  }
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}
