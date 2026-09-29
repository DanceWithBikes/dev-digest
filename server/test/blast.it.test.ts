/**
 * `GET /pulls/:id/blast` end-to-end over a real Postgres index — modelled on
 * `test/repo-intel-symbol-clamp.it.test.ts:20-36`. Writes the same rows the
 * T3 indexer pipeline would (`symbols`, `references`, `file_rank`,
 * `file_facts`, `repo_index_state`) through `RepoIntelRepository`, then hits
 * the route and asserts the P1/P2 acceptance criteria hermetically.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import type { BlastRadius } from '@devdigest/shared';
import { BlastRadius as BlastRadiusSchema } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const CHANGED_FILE = 'src/lib/rate.ts';
const CALLER_FILE_ENDPOINT = 'src/api/public/items.ts';
const CALLER_FILE_CRON = 'src/jobs/cleanup.ts';
const SHA = 'sha-full-index';

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'blast-fixture', fullName: 'acme/blast-fixture' })
      .returning();
    repoId = repo!.id;

    const repoIntelRepo = new RepoIntelRepository(pg.handle.db);

    await repoIntelRepo.insertSymbols([
      {
        repoId,
        path: CHANGED_FILE,
        name: 'rateLimit',
        kind: 'function',
        line: 1,
        endLine: 5,
        exported: true,
        signature: null,
        contentHash: 'h-rate',
      },
      {
        repoId,
        path: CALLER_FILE_ENDPOINT,
        name: 'listItems',
        kind: 'function',
        line: 10,
        endLine: 20,
        exported: true,
        signature: null,
        contentHash: 'h-items',
      },
      {
        repoId,
        path: CALLER_FILE_CRON,
        name: 'cleanupJob',
        kind: 'function',
        line: 5,
        endLine: 15,
        exported: true,
        signature: null,
        contentHash: 'h-cleanup',
      },
    ]);

    // `insertReferences` never resolves `decl_file` — insert the rows with it
    // already set, the same shape `resolveReferences` would leave behind.
    await pg.handle.db.insert(t.references).values([
      { repoId, fromPath: CALLER_FILE_ENDPOINT, toSymbol: 'rateLimit', line: 12, declFile: CHANGED_FILE },
      { repoId, fromPath: CALLER_FILE_CRON, toSymbol: 'rateLimit', line: 7, declFile: CHANGED_FILE },
      // Same-file reference: rateLimit's own file calling itself — must be
      // excluded from its own caller list (D1 self-file filter).
      { repoId, fromPath: CHANGED_FILE, toSymbol: 'rateLimit', line: 3, declFile: CHANGED_FILE },
    ]);

    // getResolvedCallers INNER JOINs file_rank by (repoId, fromPath) — every
    // fromPath above (including the changed file's own self-reference) needs one.
    await repoIntelRepo.replaceFileRank(repoId, [
      { filePath: CHANGED_FILE, pagerank: 0.1, hotness: 0, rank: 10, percentile: 50 },
      { filePath: CALLER_FILE_ENDPOINT, pagerank: 0.3, hotness: 0, rank: 90, percentile: 90 },
      { filePath: CALLER_FILE_CRON, pagerank: 0.2, hotness: 0, rank: 80, percentile: 80 },
    ]);

    await repoIntelRepo.replaceFileFacts(repoId, [
      { filePath: CALLER_FILE_ENDPOINT, endpoints: ['GET /api/public/items'], crons: [] },
      { filePath: CALLER_FILE_CRON, endpoints: [], crons: ['nightly-cleanup'] },
    ]);

    await repoIntelRepo.upsertIndexState({
      repoId,
      lastIndexedSha: SHA,
      indexerVersion: INDEXER_VERSION,
      status: 'full',
      filesIndexed: 3,
      filesSkipped: 0,
      stats: {},
    });
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makePr(opts: { withFiles: boolean; number: number }) {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: opts.number,
        title: 'Tighten the shared rate limiter',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: SHA,
        additions: 4,
        deletions: 1,
        filesCount: 1,
        status: 'open',
      })
      .returning();
    if (opts.withFiles) {
      await pg.handle.db.insert(t.prFiles).values({ prId: pr!.id, path: CHANGED_FILE, additions: 4, deletions: 1 });
    }
    return pr!;
  }

  it('maps ≥2 real callers and ≥1 endpoint, puts the cron under crons_affected, and excludes the self-file caller', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const pr = await makePr({ withFiles: true, number: 101 });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);

    const parsed = BlastRadiusSchema.parse(res.json());
    const body: BlastRadius = parsed;

    expect(body.downstream).toHaveLength(1);
    const group = body.downstream[0]!;
    expect(group.symbol).toBe('rateLimit');
    // 2 real callers (listItems, cleanupJob) — the self-file reference is excluded.
    expect(group.callers).toHaveLength(2);
    expect(group.callers.some((c) => c.file === CHANGED_FILE)).toBe(false);
    expect(group.callers.map((c) => c.file).sort()).toEqual(
      [CALLER_FILE_ENDPOINT, CALLER_FILE_CRON].sort(),
    );
    expect(group.endpoints_affected).toContain('GET /api/public/items');
    expect(group.crons_affected).toContain('nightly-cleanup');
    expect(body.degraded).toBeFalsy();
  });

  it('404s for an unknown PR id', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const res = await app.inject({ method: 'GET', url: '/pulls/00000000-0000-4000-a000-000000000000/blast' });
    expect(res.statusCode).toBe(404);
  });

  it('a second PR with no repo-intel index for its repo reports degraded:true', async () => {
    const [otherRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'no-index', fullName: 'acme/no-index' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: otherRepo!.id,
        number: 202,
        title: 'Unrelated change',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'sha-no-index',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/other.ts', additions: 1, deletions: 0 });

    const app = await buildApp({ config: config(), db: pg.handle.db });
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusSchema.parse(res.json());
    expect(body.degraded).toBe(true);
  });
});
