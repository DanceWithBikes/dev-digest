/**
 * Smart Diff summaries (step 8): `GET /pulls/:id/smart-diff` stays LLM-free and
 * only ever serves a cached `pseudocode_summary` whose `patch_sha` still
 * matches; `POST /pulls/:id/smart-diff/summaries` is the only thing that calls
 * a model, and only for uncached `core`-group files. Gated on Docker, matching
 * the other pulls integration tests (`pulls-comments.it.test.ts`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { PullsRepository } from '../src/modules/pulls/repository.js';
import * as t from '../src/db/schema.js';
import type { SmartDiff, SmartDiffFile } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string, patch: string) {
  const name = `smart-diff-summaries-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 900 + repoSeq,
      title: 'Add token-bucket limiter',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef',
      additions: 10,
      deletions: 0,
      filesCount: 2,
      status: 'open',
    })
    .returning();
  await db.insert(t.prFiles).values([
    { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0, patch }, // core
    { prId: pr!.id, path: 'README.md', additions: 2, deletions: 0, patch: '(docs)' }, // docs — never summarised
  ]);
  return { repo: repo!, pr: pr! };
}

function fileByPath(diff: SmartDiff, path: string): SmartDiffFile {
  const found = diff.groups.flatMap((g) => g.files).find((f) => f.path === path);
  if (!found) throw new Error(`no such file in SmartDiff: ${path}`);
  return found;
}

const PATCH_A = '@@ -1,1 +1,1 @@\n-old\n+new-a';
const PATCH_B = '@@ -1,1 +1,1 @@\n-old\n+new-b';

d('Smart Diff summaries (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('GET never calls a model: every pseudocode_summary is null before any POST', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, PATCH_A);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const diff = res.json() as SmartDiff;
    expect(fileByPath(diff, 'src/config.ts').pseudocode_summary).toBeNull();
    expect(fileByPath(diff, 'README.md').pseudocode_summary).toBeNull();
  });

  it('POST summarises only the uncached core-group file; GET then serves it from cache', async () => {
    const llm = new MockLLMProvider('openai', { completionText: 'Adds a rate-limit check.' });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openrouter: llm } },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, PATCH_A);

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/smart-diff/summaries` });
    expect(post.statusCode).toBe(200);
    const posted = post.json() as SmartDiff;
    expect(fileByPath(posted, 'src/config.ts').pseudocode_summary).toBe('Adds a rate-limit check.');
    // docs-group file is never sent to the summarizer, regardless of cache state.
    expect(fileByPath(posted, 'README.md').pseudocode_summary).toBeNull();
    expect(llm.calls.filter((c) => c.method === 'complete')).toHaveLength(1);

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    const diff = get.json() as SmartDiff;
    expect(fileByPath(diff, 'src/config.ts').pseudocode_summary).toBe('Adds a rate-limit check.');

    // A second POST finds nothing left to summarise (already cached, same patch).
    llm.calls.length = 0;
    const secondPost = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/smart-diff/summaries` });
    expect(secondPost.statusCode).toBe(200);
    expect(llm.calls).toHaveLength(0);
  });

  it('a cached summary survives a replaceFiles refresh with the same patch, and goes stale when the patch changes', async () => {
    const llm = new MockLLMProvider('openai', { completionText: 'Adds a rate-limit check.' });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openrouter: llm } },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, PATCH_A);
    const repo = new PullsRepository(pg.handle.db);

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/smart-diff/summaries` });

    // `replaceFiles` deletes-and-reinserts `pr_files` (what every GET /pulls/:id
    // detail refresh does) — the SAME patch text must not invalidate the cache,
    // because `pr_file_summary` is a separate table keyed on `patch_sha`.
    await repo.replaceFiles(pr.id, [
      { path: 'src/config.ts', additions: 4, deletions: 0, patch: PATCH_A },
      { path: 'README.md', additions: 2, deletions: 0, patch: '(docs)' },
    ]);
    const afterSamePatch = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })
    ).json() as SmartDiff;
    expect(fileByPath(afterSamePatch, 'src/config.ts').pseudocode_summary).toBe('Adds a rate-limit check.');

    // A refresh that changes the patch invalidates the cached summary — served
    // as null, not deleted (a later re-generation can still overwrite the row).
    await repo.replaceFiles(pr.id, [
      { path: 'src/config.ts', additions: 4, deletions: 0, patch: PATCH_B },
      { path: 'README.md', additions: 2, deletions: 0, patch: '(docs)' },
    ]);
    const afterChangedPatch = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })
    ).json() as SmartDiff;
    expect(fileByPath(afterChangedPatch, 'src/config.ts').pseudocode_summary).toBeNull();
  });
});
