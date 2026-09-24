import { describe, it, expect } from 'vitest';
import type { RepoRef } from '@devdigest/shared';
import { makeIntentEngine } from '../src/modules/reviews/compose.js';
import type { Container } from '../src/platform/container.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import type { PrForIntent } from '../src/modules/reviews/ports.js';

/**
 * The linked spec resolves against the PR's OWN head, not the clone's working
 * tree: the clone only ever tracks the default branch, so a spec a PR adds
 * about itself is not on disk until merge — the "Linked spec … could not be
 * read" warning every self-documenting PR used to show
 * (`reviews/docs/insights.md`). Pins the three-step order in
 * `compose.ts#readSpecAtHead` and, above all, that a failure is still reported
 * honestly rather than papered over with the default branch's copy.
 */

const SPEC_PATH = 'docs/specs/intent-layer.md';
const HEAD_SHA = 'deadbee';
const REPO: RepoRef = { owner: 'DanceWithBikes', name: 'dev-digest' };

const PR: PrForIntent = {
  id: 'pr-1',
  number: 10,
  title: 'L3: intent layer',
  body: `Implements the spec at ${SPEC_PATH}.`,
  headSha: HEAD_SHA,
};

/** Only the three reads the collector performs; every other `GitClient` member
 *  is unreachable from `collect()`, so the cast stays honest. */
class FakeGit {
  public reads: string[] = [];
  public fetches: number[] = [];

  constructor(
    private readonly at: Record<string, string>,
    private readonly worktree: Record<string, string>,
    private readonly fetchable: Record<string, string> | null,
  ) {}

  async readFileAt(_repo: RepoRef, ref: string, path: string): Promise<string> {
    this.reads.push(`${ref}:${path}`);
    const source = ref.startsWith('pr-') ? this.fetched : this.at;
    const text = source?.[path];
    if (text == null) throw new Error(`fatal: path '${path}' does not exist in '${ref}'`);
    return text;
  }
  async fetchPullHead(_repo: RepoRef, n: number): Promise<void> {
    this.fetches.push(n);
    if (!this.fetchable) throw new Error('fatal: could not read from remote repository');
    this.fetched = this.fetchable;
  }
  async readFile(_repo: RepoRef, path: string): Promise<string> {
    this.reads.push(`worktree:${path}`);
    const text = this.worktree[path];
    if (text == null) throw new Error(`ENOENT: no such file '${path}'`);
    return text;
  }
  private fetched: Record<string, string> | null = null;
}

function collectWith(git: FakeGit) {
  const container = {
    git,
    // No GITHUB_TOKEN in a unit test; the body links no issue anyway.
    github: async () => {
      throw new Error('GitHub not configured');
    },
  } as unknown as Container;
  const repo = { commitsForPull: async () => [] } as unknown as ReviewRepository;
  return makeIntentEngine(container, repo).collector.collect(PR, REPO, { files: [] });
}

describe('linked spec resolution', () => {
  it('records an attempt even when the PR links no spec at all — absence is evidence, not silence', async () => {
    const git = new FakeGit({ [SPEC_PATH]: '# spec at head' }, {}, null);
    const container = {
      git,
      github: async () => {
        throw new Error('GitHub not configured');
      },
    } as unknown as Container;
    const repo = { commitsForPull: async () => [] } as unknown as ReviewRepository;
    const noSpecPr: PrForIntent = { ...PR, body: 'Just a tidy-up, nothing linked.' };

    const sources = await makeIntentEngine(container, repo).collector.collect(noSpecPr, REPO, {
      files: [],
    });

    expect(sources.spec).toBeNull();
    // `ref: null` is what tells "never referenced" apart from "named but
    // unreadable" downstream in `describeMissingSource`.
    expect(sources.attempts).toContainEqual({ kind: 'spec', ref: null, ok: false });
    // Nothing was read: there was no path to read.
    expect(git.reads).toEqual([]);
    expect(git.fetches).toEqual([]);
  });

  it('reads the spec at the PR head sha, without a network fetch, when the clone has it', async () => {
    const git = new FakeGit({ [SPEC_PATH]: '# spec at head' }, {}, null);

    const sources = await collectWith(git);

    expect(sources.spec).toEqual({ path: SPEC_PATH, text: '# spec at head' });
    expect(sources.attempts).toContainEqual({ kind: 'spec', ref: SPEC_PATH, ok: true });
    expect(git.fetches).toEqual([]);
    expect(git.reads).toEqual([`${HEAD_SHA}:${SPEC_PATH}`]);
  });

  it('fetches the PR head ref when the head sha is not in the clone — the pre-merge case', async () => {
    const git = new FakeGit({}, {}, { [SPEC_PATH]: '# spec added by this PR' });

    const sources = await collectWith(git);

    expect(sources.spec?.text).toBe('# spec added by this PR');
    expect(sources.attempts).toContainEqual({ kind: 'spec', ref: SPEC_PATH, ok: true });
    expect(git.fetches).toEqual([PR.number]);
    expect(git.reads).toEqual([`${HEAD_SHA}:${SPEC_PATH}`, `pr-${PR.number}:${SPEC_PATH}`]);
  });

  it('falls back to the working tree when neither the sha nor a fetch is available', async () => {
    const git = new FakeGit({}, { [SPEC_PATH]: '# spec on the default branch' }, null);

    const sources = await collectWith(git);

    expect(sources.spec?.text).toBe('# spec on the default branch');
    expect(git.reads.at(-1)).toBe(`worktree:${SPEC_PATH}`);
  });

  it('still reports ok:false when no reachable ref has the file — no silent substitute', async () => {
    const git = new FakeGit({}, {}, null);

    const sources = await collectWith(git);

    expect(sources.spec).toBeNull();
    expect(sources.attempts).toContainEqual({ kind: 'spec', ref: SPEC_PATH, ok: false });
    // The fetch itself failed here, so there is no `pr-10` ref to read from —
    // the attempt is spent on the fetch, then the worktree.
    expect(git.fetches).toEqual([PR.number]);
    expect(git.reads).toEqual([`${HEAD_SHA}:${SPEC_PATH}`, `worktree:${SPEC_PATH}`]);
  });
});
