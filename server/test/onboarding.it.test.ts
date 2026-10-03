import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { FEATURE_MODELS, OnboardingTourResponse, type OnboardingTourResponse as TourResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import { OnboardingRepository } from '../src/modules/onboarding/repository.js';
import * as t from '../src/db/schema.js';

/**
 * Onboarding Tour API (SPEC-02, AC-6, AC-12, AC-13, AC-32..AC-37, AC-52..AC-55,
 * AC-60..AC-62, NFR-1, NFR-5) against a real Postgres, written from the
 * acceptance criteria. Invariants pinned: GET never generates; POST answers 202
 * and the tour appears asynchronously; exactly one structured model call with
 * `singleAttempt`; the 6th POST in a minute is a 429; a failed regeneration
 * keeps the good tour and records the failure, a good one clears it; a corrupt
 * stored body reads as "no tour"; every read is scoped to the workspace; the
 * GitHub port is never touched.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const ONBOARDING_MODEL = FEATURE_MODELS.find((f) => f.id === 'onboarding')!;

const FILES: Record<string, string> = {
  'package.json': JSON.stringify({ scripts: { dev: 'tsx watch src/index.ts' }, dependencies: { fastify: '5' } }),
  'pnpm-lock.yaml': 'lock',
  'README.md': '# Demo\n```sh\npnpm install\n```\n',
  '.env': 'SECRET=hunter2',
  '.env.local': 'SECRET=hunter2',
  'secrets.json': '{}',
  'deploy.pem': 'KEY',
  '../outside/package.json': '{"scripts":{"evil":"x"}}',
  '/abs/package.json': '{"scripts":{"evil":"x"}}',
  'src/app.ts': '',
};

class CountingGit extends MockGitClient {
  public reads: string[] = [];
  override async readFile(repo: Parameters<MockGitClient['readFile']>[0], path: string) {
    this.reads.push(path);
    return super.readFile(repo, path);
  }
}

/** A provider whose structured answer can be switched to a failure between runs. */
class SwitchableLLM extends MockLLMProvider {
  public fail = false;
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0] & { schema: never }) {
    if (this.fail) {
      this.calls.push({ method: 'completeStructured', req });
      throw new Error('provider exploded');
    }
    return super.completeStructured(req) as Promise<never> as Promise<T> as never;
  }
}

const FIXTURE = {
  architecture: 'Three layers.',
  critical_paths: [{ path: 'src/core.ts', reason: 'the core' }],
  reading_path: [{ path: 'src/util.ts', reason: 'start here' }],
  run_steps: ['pnpm run dev', 'rm -rf /'],
  first_tasks: [{ title: 'Add a test', description: 'Cover core.', paths: ['src/core.ts', 'src/ghost.ts'] }],
};

/** A GitHub client that records any use at all (AC-13). */
function countingGithub() {
  const calls: string[] = [];
  const client = new Proxy(
    {},
    {
      get: (_t, prop) => (...args: unknown[]) => {
        calls.push(String(prop));
        void args;
        throw new Error('GitHub must not be called');
      },
    },
  );
  return { client: client as never, calls };
}

d('Onboarding Tour API (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let otherWorkspaceId: string;

  const newRepo = async (name: string, over: Partial<typeof t.repos.$inferInsert> = {}, ws = workspaceId) => {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}`, clonePath: `/mock/clones/acme/${name}`, ...over })
      .returning();
    return repo!.id;
  };

  /** Seeds an index: ranks (unsorted on purpose), edges, endpoints and the state row. */
  const seedIndex = async (
    repoId: string,
    over: { sha?: string; status?: 'full' | 'partial' | 'degraded' | 'failed'; stats?: Record<string, unknown>; ranks?: Array<[string, number]> } = {},
  ) => {
    const ranks: Array<[string, number]> = over.ranks ?? [
      ['src/util.ts', 0.3],
      ['src/core.ts', 0.9],
      ['src/core.test.ts', 2],
      ['lib/x.ts', 0.1],
      ['src/api.ts', 0.5],
    ];
    await pg.handle.db.insert(t.fileRank).values(
      ranks.map(([filePath, rank]) => ({ repoId, filePath, pagerank: rank, hotness: 0, rank, percentile: 50 })),
    );
    await pg.handle.db.insert(t.fileEdges).values([
      { repoId, fromFile: 'src/core.ts', toFile: 'src/util.ts' },
      { repoId, fromFile: 'src/api.ts', toFile: 'src/core.ts' },
      { repoId, fromFile: 'lib/x.ts', toFile: 'src/util.ts' },
    ]);
    await pg.handle.db.insert(t.fileFacts).values({ repoId, filePath: 'src/api.ts', endpoints: ['GET /things'], crons: [] });
    await pg.handle.db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: over.sha ?? 'sha-1',
      indexerVersion: 3,
      status: over.status ?? 'full',
      filesIndexed: ranks.length,
      stats: over.stats ?? { totalCandidates: ranks.length, bounded: 0, hotnessAvailable: true, hotnessCommits: 7 },
    });
  };

  const makeApp = (opts: { llm?: MockLLMProvider; git?: MockGitClient; github?: never; noKeys?: boolean } = {}) => {
    const llm = opts.llm ?? new SwitchableLLM('openai', { structured: FIXTURE });
    const git = opts.git ?? new CountingGit({ files: FILES });
    return {
      llm,
      git,
      app: buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          embedder: new MockEmbedder(),
          git,
          github: opts.github,
          secrets: new MockSecretsProvider({}),
          llm: opts.noKeys ? {} : { openrouter: llm },
        },
      }),
    };
  };

  const get = async (app: Awaited<ReturnType<typeof buildApp>>, repoId: string) => {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    return { status: res.statusCode, body: res.json() as TourResponse };
  };
  const post = (app: Awaited<ReturnType<typeof buildApp>>, repoId: string) =>
    app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });

  /** Polls GET until no generation is in flight and `done(body)` holds. */
  const settle = async (
    app: Awaited<ReturnType<typeof buildApp>>,
    repoId: string,
    done: (b: TourResponse) => boolean = (b) => b.tour !== null,
  ) => {
    const start = Date.now();
    for (;;) {
      const { body } = await get(app, repoId);
      if (!body.generating && done(body)) return body;
      if (Date.now() - start > 10_000) throw new Error(`generation never settled: ${JSON.stringify(body).slice(0, 300)}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'someone-else' }).returning();
    otherWorkspaceId = other!.id;
  }, 120_000);
  afterAll(async () => {
    await pg?.stop();
  });

  it('AC-60: GET answers 200 with a null tour, not generating, when none is stored, and never starts a generation', async () => {
    const repoId = await newRepo('empty');
    await seedIndex(repoId);
    const { app, llm } = makeApp();
    const a = await app;
    const res = await get(a, repoId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tour: null, stale: false, generating: false, last_failed: null });
    await new Promise((r) => setTimeout(r, 100));
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(0);
    await a.close();
  });

  it('AC-61: a repo that does not exist in the workspace is a 404 for GET and POST, including a repo of another workspace', async () => {
    const foreign = await newRepo('foreign', {}, otherWorkspaceId);
    const a = await makeApp().app;
    for (const id of [foreign, '00000000-0000-4000-8000-000000000000']) {
      expect((await a.inject({ method: 'GET', url: `/repos/${id}/onboarding` })).statusCode).toBe(404);
      expect((await post(a, id)).statusCode).toBe(404);
    }
    await a.close();
  });

  it('AC-32/AC-36/AC-37/AC-35: POST answers 202 at once; the tour then appears from exactly one single-attempt structured call on the onboarding feature model', async () => {
    const repoId = await newRepo('one-call');
    await seedIndex(repoId);
    const { app, llm } = makeApp();
    const a = await app;
    const res = await post(a, repoId);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ generating: true });
    const body = await settle(a, repoId);
    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as { model: string; schemaName: string; singleAttempt: boolean; maxTokens: number; timeoutMs: number; messages: Array<{ role: string; content: string }> };
    expect(req.singleAttempt).toBe(true);
    expect(req.maxTokens).toBe(4_000);
    expect(req.timeoutMs).toBe(60_000);
    expect(req.model).toBe(ONBOARDING_MODEL.defaultModel);
    expect(req.messages[0]?.role).toBe('system');
    expect(body.tour).toMatchObject({ status: 'ready', provider: ONBOARDING_MODEL.defaultProvider, model: ONBOARDING_MODEL.defaultModel, model_call_made: true, commit_sha: 'sha-1', repo_full_name: 'acme/one-call' });
    expect(OnboardingTourResponse.safeParse(body).success).toBe(true);
    await a.close();
  });

  it('AC-18/AC-27/AC-28/AC-31: the stored sections use the index ranks (highest first, tests left out), the computed reading order and only grounded model text', async () => {
    const repoId = await newRepo('grounded');
    await seedIndex(repoId);
    const a = await makeApp().app;
    await post(a, repoId);
    const { tour } = await settle(a, repoId);
    const [arch, critical, run, reading, tasks] = tour!.sections;
    // ranks: core .9, api .5, util .3, x .1 (core.test.ts excluded). util is imported by core and x.
    expect(reading.entries.map((e) => e.path)).toEqual(['src/util.ts', 'src/core.ts', 'src/api.ts', 'lib/x.ts']);
    expect(JSON.stringify(tour)).not.toContain('core.test.ts');
    expect(reading.entries.find((e) => e.path === 'src/util.ts')?.reason).toBe('start here');
    expect(critical.entries.map((e) => e.path)).not.toContain('src/ghost.ts');
    expect(run.steps.map((s) => s.command)).toEqual(['pnpm run dev']);
    expect(tasks.tasks[0]?.paths).toEqual(['src/core.ts']);
    expect(arch.origin).toBe('model');
    expect(arch.directories).toEqual([{ path: 'src', files: 4 }, { path: 'lib', files: 1 }]);
    await a.close();
  });

  it('AC-25/AC-26/AC-13: .env, key, secrets, absolute and escaping paths are never read, and the GitHub port is never touched', async () => {
    const repoId = await newRepo('no-secrets');
    await seedIndex(repoId);
    const git = new CountingGit({ files: FILES });
    const gh = countingGithub();
    const a = await makeApp({ git, github: gh.client }).app;
    await post(a, repoId);
    await settle(a, repoId);
    expect(git.reads.length).toBeGreaterThan(0);
    for (const bad of ['.env', '.env.local', 'secrets.json', 'deploy.pem', '../outside/package.json', '/abs/package.json']) {
      expect(git.reads, bad).not.toContain(bad);
    }
    expect(gh.calls).toEqual([]);
    await a.close();
  });

  it('AC-40: no API key for the onboarding model ends llm_not_configured with no model call', async () => {
    const repoId = await newRepo('no-key');
    await seedIndex(repoId);
    const { app, llm } = makeApp({ noKeys: true });
    const a = await app;
    await post(a, repoId);
    const { tour } = await settle(a, repoId);
    expect(tour?.status).toBe('llm_not_configured');
    expect(tour?.model_call_made).toBe(false);
    expect(tour?.tokens_in).toBe(0);
    expect(tour?.cost_usd).toBeNull();
    expect(tour?.sections.every((s) => s.origin === 'skeleton')).toBe(true);
    expect(llm.calls).toHaveLength(0);
    await a.close();
  });

  it('AC-38: a repo with no clone or no index state ends no_data, without a model call', async () => {
    const noClone = await newRepo('no-clone', { clonePath: null });
    const noIndex = await newRepo('no-index');
    const { app, llm } = makeApp();
    const a = await app;
    for (const id of [noClone, noIndex]) {
      await post(a, id);
      expect((await settle(a, id)).tour?.status).toBe('no_data');
    }
    expect(llm.calls).toHaveLength(0);
    await a.close();
  });

  it('AC-49: an index with no JS/TS candidates ends unsupported_language', async () => {
    const repoId = await newRepo('python');
    await pg.handle.db.insert(t.repoIndexState).values({ repoId, lastIndexedSha: 'sha-py', indexerVersion: 3, status: 'full', stats: { totalCandidates: 0, bounded: 0 } });
    const a = await makeApp().app;
    await post(a, repoId);
    const { tour } = await settle(a, repoId);
    expect(tour?.status).toBe('unsupported_language');
    expect(tour?.sections[1]).toMatchObject({ origin: 'skeleton', entries: [] });
    expect(tour?.sections[3]).toMatchObject({ origin: 'skeleton', entries: [] });
    await a.close();
  });

  it('AC-33/AC-34/NFR-5: the 6th POST within a minute is a 429 with no extra model call; the limit is per repo', async () => {
    const repoId = await newRepo('limited');
    const otherRepo = await newRepo('not-limited');
    await seedIndex(repoId);
    await seedIndex(otherRepo);
    const { app, llm } = makeApp();
    const a = await app;
    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1) codes.push((await post(a, repoId)).statusCode);
    await settle(a, repoId);
    const callsAfter = llm.calls.filter((c) => c.method === 'completeStructured').length;
    expect(codes.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
    expect(codes[5]).toBe(429);
    expect(callsAfter).toBeLessThanOrEqual(5);
    expect(callsAfter).toBeGreaterThanOrEqual(1);
    expect((await post(a, repoId)).statusCode).toBe(429);
    await new Promise((r) => setTimeout(r, 100));
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(callsAfter);
    expect((await post(a, otherRepo)).statusCode).toBe(202);
    await a.close();
  });

  it('AC-52/AC-53/AC-54/AC-55: a failed regeneration keeps the good tour and records the failure; a later success replaces it and clears the record; there is one row per repo', async () => {
    const repoId = await newRepo('lifecycle');
    await seedIndex(repoId);
    const llm = new SwitchableLLM('openai', { structured: FIXTURE });
    const a = await makeApp({ llm }).app;
    await post(a, repoId);
    const good = await settle(a, repoId);
    expect(good.tour?.status).toBe('ready');

    llm.fail = true;
    await post(a, repoId);
    const kept = await settle(a, repoId, (b) => b.last_failed !== null);
    expect(kept.tour).toEqual(good.tour);
    expect(kept.last_failed?.status).toBe('llm_failed');
    expect(Number.isNaN(Date.parse(kept.last_failed!.at))).toBe(false);
    const [row] = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(row?.status).toBe('ready');
    expect(row?.lastFailedStatus).toBe('llm_failed');

    llm.fail = false;
    await post(a, repoId);
    const replaced = await settle(a, repoId, (b) => b.last_failed === null);
    expect(replaced.tour?.status).toBe('ready');
    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastFailedStatus).toBeNull();
    expect(rows[0]?.lastFailedAt).toBeNull();
    await a.close();
  });

  it('AC-52/AC-55: a failed generation with no good tour stores the failure outline as the tour', async () => {
    const repoId = await newRepo('first-fail');
    await seedIndex(repoId);
    const llm = new SwitchableLLM('openai', { structured: FIXTURE });
    llm.fail = true;
    const a = await makeApp({ llm }).app;
    await post(a, repoId);
    const { tour, last_failed } = await settle(a, repoId);
    expect(tour?.status).toBe('llm_failed');
    expect(tour?.sections.every((s) => s.origin === 'skeleton')).toBe(true);
    expect(last_failed).toBeNull();
    await a.close();
  });

  it('AC-62: stale turns true when the index moves past the tour commit, and is false while it matches', async () => {
    const repoId = await newRepo('stale');
    await seedIndex(repoId, { sha: 'sha-a' });
    const a = await makeApp().app;
    await post(a, repoId);
    expect((await settle(a, repoId)).stale).toBe(false);
    await pg.handle.db.update(t.repoIndexState).set({ lastIndexedSha: 'sha-b' }).where(eq(t.repoIndexState.repoId, repoId));
    const res = await get(a, repoId);
    expect(res.body.stale).toBe(true);
    expect(res.body.tour?.commit_sha).toBe('sha-a');
    await a.close();
  });

  it('AC-6/AC-60: a stored body that no longer parses reads as tour: null (200, not a 500), keeping the last failed attempt', async () => {
    const repoId = await newRepo('corrupt');
    await pg.handle.db.insert(t.onboarding).values({
      repoId,
      workspaceId,
      json: { junk: true },
      commitSha: 'x',
      status: 'ready',
      generatedAt: new Date(),
      lastFailedStatus: 'timed_out',
      lastFailedAt: new Date('2026-10-03T00:00:00Z'),
    });
    const a = await makeApp().app;
    const res = await get(a, repoId);
    expect(res.status).toBe(200);
    expect(res.body.tour).toBeNull();
    expect(res.body.stale).toBe(false);
    expect(res.body.last_failed).toEqual({ status: 'timed_out', at: '2026-10-03T00:00:00.000Z' });
    await a.close();
  });

  it('AC-12: GET /repos/:id/index-state reports whether hotness was available and how many commits were counted', async () => {
    const repoId = await newRepo('hotness-state');
    await seedIndex(repoId, { stats: { totalCandidates: 5, bounded: 0, hotnessAvailable: true, hotnessCommits: 42 } });
    const cold = await newRepo('cold-state');
    await seedIndex(cold, { stats: { totalCandidates: 5, bounded: 0, hotnessAvailable: false, hotnessCommits: 0 } });
    const a = await makeApp().app;
    const hot = (await a.inject({ method: 'GET', url: `/repos/${repoId}/index-state` })).json();
    expect(hot).toMatchObject({ hotnessAvailable: true, hotnessCommits: 42 });
    const none = (await a.inject({ method: 'GET', url: `/repos/${cold}/index-state` })).json();
    expect(none).toMatchObject({ hotnessAvailable: false, hotnessCommits: 0 });
    await a.close();
  });

  it('AC-61: the repository is workspace-scoped: another workspace cannot read, see or mark a repo tour', async () => {
    const repoId = await newRepo('scoped');
    await seedIndex(repoId);
    const a = await makeApp().app;
    await post(a, repoId);
    await settle(a, repoId);
    const repo = new OnboardingRepository(pg.handle.db);
    expect(await repo.getRepo(otherWorkspaceId, repoId)).toBeNull();
    expect((await repo.getRepo(workspaceId, repoId))?.fullName).toBe('acme/scoped');
    expect((await repo.getTour(otherWorkspaceId, repoId)).tour).toBeNull();
    expect((await repo.getTour(workspaceId, repoId)).tour).not.toBeNull();
    await repo.recordFailedAttempt(otherWorkspaceId, repoId, 'timed_out', new Date());
    expect((await repo.getTour(workspaceId, repoId)).lastFailed).toBeNull();
    await a.close();
  });

  it('NFR-1 (indicative): GET /repos/:id/onboarding answers in p95 <= 300 ms for a repo with 5,000 indexed files', async () => {
    const repoId = await newRepo('big');
    const ranks: Array<[string, number]> = Array.from({ length: 5_000 }, (_, i) => [`pkg${i % 40}/src/f${i}.ts`, 1 - i / 5_000]);
    await seedIndex(repoId, { ranks, stats: { totalCandidates: 5_000, bounded: 0, hotnessAvailable: true, hotnessCommits: 50 } });
    const a = await makeApp().app;
    await post(a, repoId);
    await settle(a, repoId);
    const times: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const t0 = performance.now();
      await get(a, repoId);
      times.push(performance.now() - t0);
    }
    times.sort((x, y) => x - y);
    expect(times[Math.floor(times.length * 0.95)]).toBeLessThanOrEqual(300);
    await a.close();
  }, 60_000);
});
