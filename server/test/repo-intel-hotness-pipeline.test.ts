/**
 * SPEC-02 hotness wiring: both pipelines write rank = pagerank x (1 + hotness),
 * record the hotness stats, and never touch the GitHub port (AC-13).
 * No DB: an in-memory repository stub captures what the pipeline writes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { runFullIndex } from '../src/modules/repo-intel/pipeline/full.js';
import { runIncremental } from '../src/modules/repo-intel/pipeline/incremental.js';
import { computeFileRank } from '../src/modules/repo-intel/pipeline/rank.js';
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import type { IndexerFileRankRow, RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';
import type { Container } from '../src/platform/container.js';
import { MockGitClient } from '../src/adapters/mocks.js';

const FILES = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
const EDGES = [
  { from: 'src/a.ts', to: 'src/b.ts' },
  { from: 'src/c.ts', to: 'src/b.ts' },
];
const COUNTS = { commits: 20, byPath: { 'src/a.ts': 10, 'src/c.ts': 5 } };

function setup(initialState: IndexState | null) {
  let rank: IndexerFileRankRow[] = [];
  let stats: Record<string, unknown> = {};
  const stub = {
    getRepoBasics: async () => ({ id: 'r1', owner: 'acme', name: 'app', clonePath: root }),
    tryGetIndexState: async () => initialState,
    touchIndexState: async () => {},
    deleteAllForRepo: async () => {},
    deleteForFiles: async () => {},
    insertSymbols: async () => {},
    insertReferences: async () => {},
    upsertIndexState: async (s: { stats: Record<string, unknown> }) => {
      stats = s.stats;
    },
    replaceEdges: async () => {},
    replaceFileRank: async (_id: string, rows: IndexerFileRankRow[]) => {
      rank = rows;
    },
    replaceFileFacts: async () => {},
    patchFileFacts: async () => {},
    resolveReferences: async () => {},
    getRepoMapCandidates: async () => [],
    deleteRepoMapCache: async () => {},
    putRepoMapCache: async () => {},
  };
  let githubCalls = 0;
  const container = {
    git: new MockGitClient({
      head: 'sha-new',
      diffNameOnly: ['src/a.ts'],
      fileCommitCounts: COUNTS,
    }),
    github: () => {
      githubCalls++;
      throw new Error('github must not be used');
    },
    depgraph: { buildEdges: async () => EDGES },
    tokenizer: { count: (t: string) => Math.ceil(t.length / 4) },
  } as unknown as Container;
  return {
    repo: stub as unknown as RepoIntelRepository,
    container,
    rank: () => rank,
    stats: () => stats,
    githubCalls: () => githubCalls,
  };
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'repo-intel-hot-'));
  for (const f of FILES) {
    await mkdir(dirname(join(root, f)), { recursive: true });
    await writeFile(join(root, f), `export function ${f.slice(4, 5)}() { return 1; }\n`);
  }
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function expectHotRank(rows: IndexerFileRankRow[]) {
  const plain = computeFileRank(
    FILES,
    EDGES.map((e) => ({ fromFile: e.from, toFile: e.to })),
  );
  const byPath = new Map(rows.map((r) => [r.filePath, r]));
  const hot = { 'src/a.ts': 1, 'src/b.ts': 0, 'src/c.ts': 0.5 } as Record<string, number>;
  for (const f of FILES) {
    const row = byPath.get(f)!;
    const base = plain.find((p) => p.filePath === f)!.pagerank;
    expect(row.hotness).toBeCloseTo(hot[f]!, 12);
    expect(row.pagerank).toBeCloseTo(base, 12);
    expect(row.rank).toBeCloseTo(base * (1 + hot[f]!), 12);
  }
}

describe('hotness in the indexing pipelines', () => {
  it('full index: rank = pagerank x (1 + hotness), stats carry hotness, GitHub untouched', async () => {
    const s = setup(null);
    await runFullIndex(s.container, s.repo, { repoId: 'r1' });
    expectHotRank(s.rank());
    expect(s.stats().hotnessAvailable).toBe(true);
    expect(s.stats().hotnessCommits).toBe(20);
    expect(s.githubCalls()).toBe(0);
  });

  it('incremental: rank = pagerank x (1 + hotness), walk stats persisted, GitHub untouched', async () => {
    const state: IndexState = {
      repoId: 'r1',
      status: 'full',
      filesIndexed: 3,
      filesSkipped: 0,
      durationMs: 1,
      lastIndexedSha: 'sha-old',
      indexerVersion: INDEXER_VERSION,
      updatedAt: new Date(0),
    };
    const s = setup(state);
    await runIncremental(s.container, s.repo, { repoId: 'r1' });
    expect(s.stats().incremental).toBe(true);
    expectHotRank(s.rank());
    expect(s.stats().hotnessAvailable).toBe(true);
    expect(s.stats().hotnessCommits).toBe(20);
    expect(s.stats().totalCandidates).toBe(3);
    expect(s.stats().bounded).toBe(0);
    expect(s.githubCalls()).toBe(0);
  });

  it('no usable history → hotnessAvailable false and rank equals pagerank', async () => {
    const s = setup(null);
    (s.container.git as MockGitClient) = new MockGitClient({ head: 'sha-new' });
    await runFullIndex(s.container, s.repo, { repoId: 'r1' });
    expect(s.stats().hotnessAvailable).toBe(false);
    expect(s.stats().hotnessCommits).toBe(0);
    for (const r of s.rank()) expect(r.rank).toBe(r.pagerank);
  });
});

describe('AC-106: an index built before hotness is rebuilt in full on its next refresh', () => {
  const stale = (over: Partial<IndexState> = {}): IndexState => ({
    repoId: 'r1',
    status: 'full',
    filesIndexed: 3,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: 'sha-new',
    indexerVersion: INDEXER_VERSION - 1,
    updatedAt: new Date(0),
    ...over,
  });

  it('AC-106: a previous-INDEXER_VERSION index at an UNCHANGED sha still gets a full reindex that writes hotness', async () => {
    // Same sha as HEAD: without the version rule this would early-return as
    // `sha_unchanged` and never recompute rank, leaving hotness at 0.
    // 2 is the literal version that shipped before hotness: reverting the bump must fail here.
    const s = setup(stale({ indexerVersion: 2 }));
    const res = await runIncremental(s.container, s.repo, { repoId: 'r1' });
    expect(res.reason).not.toBe('sha_unchanged');
    expect(s.rank()).toHaveLength(3);
    expectHotRank(s.rank());
    expect(s.stats().hotnessAvailable).toBe(true);
    expect(s.stats().hotnessCommits).toBe(20);
    expect(s.stats().incremental).not.toBe(true);
  });

  it('AC-106: a previous-version index at a CHANGED sha is also rebuilt in full, not patched', async () => {
    const s = setup(stale({ lastIndexedSha: 'sha-old' }));
    await runIncremental(s.container, s.repo, { repoId: 'r1' });
    expectHotRank(s.rank());
    expect(s.stats().incremental).not.toBe(true);
  });

  it('AC-106: the current INDEXER_VERSION at an unchanged sha is NOT rebuilt (the rule is version-driven)', async () => {
    const s = setup(stale({ indexerVersion: INDEXER_VERSION }));
    const res = await runIncremental(s.container, s.repo, { repoId: 'r1' });
    expect(res.reason).toBe('sha_unchanged');
    expect(s.rank()).toEqual([]);
  });
});
