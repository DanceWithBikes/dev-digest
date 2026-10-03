import type { GitClient, RepoRef } from '@devdigest/shared';

/** Recorded as a document's version when it was read off the clone's working tree. */
export const WORKING_TREE_VERSION = 'working-tree';

/** The PR facts a document read needs. */
export interface ContextDocPull {
  number: number;
  headSha: string;
}

/** One document read: its text and the version it came from (a SHA or `working-tree`). */
export interface ContextDocRead {
  text: string;
  version: string;
}

/** What the reader needs of the Container: a (possibly throwing) `git` getter. */
export interface ContextDocGitSource {
  readonly git: Pick<GitClient, 'readFileAt' | 'fetchPullHead' | 'resolveRef' | 'listFiles' | 'readFile'>;
}

/**
 * Reads attached Project Context documents with the same three attempts as
 * `RepoIntentSourceCollector#readSpecAtHead`, but batched: the PR head is
 * fetched AT MOST ONCE per call, however many paths are left after attempt 1.
 *  1. `git show <head_sha>:<path>` — version = head sha;
 *  2. one `fetchPullHead`, then `git show pr-<n>:<path>` — version = the
 *     resolved sha of `pr-<n>` (a ref name is not a version);
 *  3. the working tree — version = `working-tree`.
 * Every failure is per path; a path nothing can read is absent from the result.
 */
export class GitContextDocReader {
  constructor(private container: ContextDocGitSource) {}

  async readAll(repo: RepoRef, pr: ContextDocPull, paths: string[]): Promise<Map<string, ContextDocRead>> {
    const out = new Map<string, ContextDocRead>();
    let remaining = [...paths];

    let git: ContextDocGitSource['git'];
    try {
      git = this.container.git;
    } catch {
      return out;
    }

    const next: string[] = [];
    for (const path of remaining) {
      try {
        out.set(path, { text: await git.readFileAt(repo, pr.headSha, path), version: pr.headSha });
      } catch {
        next.push(path);
      }
    }
    remaining = next;

    if (remaining.length > 0) {
      let prVersion: string | null = null;
      try {
        await git.fetchPullHead(repo, pr.number);
        prVersion = await git.resolveRef(repo, `pr-${pr.number}`);
      } catch {
        // Not a GitHub remote, no network, or the PR ref is gone.
      }
      if (prVersion) {
        const left: string[] = [];
        for (const path of remaining) {
          try {
            out.set(path, { text: await git.readFileAt(repo, `pr-${pr.number}`, path), version: prVersion });
          } catch {
            left.push(path);
          }
        }
        remaining = left;
      }
    }

    // Working-tree fallback reads tracked regular files only: never `.git/**`,
    // untracked files or anything else the clone happens to hold.
    let tracked: Set<string>;
    try {
      tracked = new Set(remaining.length > 0 ? await git.listFiles(repo) : []);
    } catch {
      tracked = new Set();
    }
    for (const path of remaining) {
      if (!tracked.has(path)) continue;
      try {
        out.set(path, { text: await git.readFile(repo, path), version: WORKING_TREE_VERSION });
      } catch {
        // not found on any reachable ref
      }
    }
    return out;
  }
}
