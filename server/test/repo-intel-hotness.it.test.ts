/**
 * AC-106 against a real Postgres: a repo whose index was built before hotness
 * existed (INDEXER_VERSION 2) is rebuilt IN FULL on its next refresh, even when
 * HEAD has not moved, so that every `file_rank` row gains hotness and the index
 * state reports it (AC-12). Also pins AC-7/AC-9/AC-11/AC-13 on persisted rows:
 * rank = pagerank x (1 + hotness) and the GitHub port is never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import { runIncremental } from '../src/modules/repo-intel/pipeline/incremental.js';
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const FILES = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
const EDGES = [
  { from: 'src/a.ts', to: 'src/b.ts' },
  { from: 'src/c.ts', to: 'src/b.ts' },
];

d('AC-106: a pre-hotness index is rebuilt in full on its next refresh (Testcontainers pg)', () => {
  let pg: PgFixture;
  let root: string;
  let repoId: string;
  let githubCalls = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    root = await mkdtemp(join(tmpdir(), 'dd-ac106-'));
    for (const f of FILES) {
      await mkdir(dirname(join(root, f)), { recursive: true });
      await writeFile(join(root, f), `export const v = 1;\n`);
    }
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'old-index', fullName: 'acme/old-index', clonePath: root })
      .returning();
    repoId = repo!.id;
    // The index as an earlier release left it: version 2, HEAD unchanged, hotness 0 everywhere.
    await pg.handle.db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: 'sha-same',
      indexerVersion: 2,
      status: 'full',
      filesIndexed: 3,
      stats: { totalCandidates: 3, bounded: 0 },
    });
    await pg.handle.db.insert(t.fileRank).values(
      FILES.map((filePath) => ({ repoId, filePath, pagerank: 0.3, hotness: 0, rank: 0.3, percentile: 50 })),
    );
  }, 120_000);
  afterAll(async () => {
    await pg?.stop();
    await rm(root, { recursive: true, force: true });
  });

  it('AC-106/AC-7/AC-9/AC-11/AC-12/AC-13: the refresh rebuilds in full, every file_rank row gains hotness, the state reports it, GitHub is untouched', async () => {
    const container = {
      git: new MockGitClient({ head: 'sha-same', fileCommitCounts: { commits: 20, byPath: { 'src/a.ts': 10, 'src/c.ts': 5 } } }),
      github: () => {
        githubCalls += 1;
        throw new Error('github must not be used');
      },
      depgraph: { buildEdges: async () => EDGES },
      tokenizer: { count: (s: string) => Math.ceil(s.length / 4) },
    } as unknown as Container;

    const result = await runIncremental(container, new RepoIntelRepository(pg.handle.db), { repoId });
    expect(result.reason).not.toBe('sha_unchanged');

    const rows = await pg.handle.db.select().from(t.fileRank).where(eq(t.fileRank.repoId, repoId));
    const by = new Map(rows.map((r) => [r.filePath, r]));
    expect(rows).toHaveLength(3);
    expect(by.get('src/a.ts')!.hotness).toBeCloseTo(1, 12);
    expect(by.get('src/c.ts')!.hotness).toBeCloseTo(0.5, 12);
    expect(by.get('src/b.ts')!.hotness).toBe(0);
    for (const r of rows) expect(r.rank).toBeCloseTo(r.pagerank * (1 + r.hotness), 12);

    const [state] = await pg.handle.db.select().from(t.repoIndexState).where(eq(t.repoIndexState.repoId, repoId));
    expect(state!.indexerVersion).toBe(INDEXER_VERSION);
    expect(state!.stats).toMatchObject({ hotnessAvailable: true, hotnessCommits: 20 });
    expect(githubCalls).toBe(0);
  });

  it('AC-106: once rebuilt, an unchanged HEAD is a no-op again (the rebuild happens once, not on every refresh)', async () => {
    const container = {
      git: new MockGitClient({ head: 'sha-same' }),
      github: () => {
        throw new Error('github must not be used');
      },
      depgraph: { buildEdges: async () => EDGES },
      tokenizer: { count: (s: string) => Math.ceil(s.length / 4) },
    } as unknown as Container;
    const result = await runIncremental(container, new RepoIntelRepository(pg.handle.db), { repoId });
    expect(result.reason).toBe('sha_unchanged');
  });
});
