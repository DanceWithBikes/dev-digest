import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Intent, PrIntentRecord, RepoRef } from '@devdigest/shared';

/**
 * The Intent Layer (L03) — the two claims named in the plan that had no
 * executing test:
 *   1. `/pulls/:id/intent` (GET + POST) is workspace-scoped, even though
 *      `pr_intent` carries no `workspace_id` of its own (the scoping is
 *      entirely `getPull(workspaceId, prId)`'s join — see repository/pull.repo.ts).
 *   2. An unreachable linked spec lands in `missing_context[]` / `sources[]`
 *      as `ok:false`, and the persisted intent is never invented from it.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/**
 * The classifier's own feature model (`review_intent`, defaults to
 * `openrouter`) is resolved independently of any review agent — without this
 * override every test here would build a REAL provider from
 * `~/.devdigest/secrets.json` (NODE_ENV=test does NOT stub secrets,
 * config.ts:74) and make a live network call. That exact trap already cost
 * this feature a 10s-timeout flake (server/docs/insights.md, "Recurring
 * Errors & Fixes"). None of this file's PR bodies contain a `#123`-style
 * issue reference, so `intent-helpers.ts#parseIssueRef` never calls
 * `container.github()` and no `github` override is needed (same reasoning
 * `reviews-skills.it.test.ts` already relies on).
 */
const CONFIDENT_INTENT: Intent = {
  intent: 'Add rate limiting to the public API, with full test coverage.',
  in_scope: ['Rate limiting middleware'],
  out_of_scope: [],
};

/**
 * `MockGitClient.readFile` always RESOLVES (to `''` for an unmapped path) —
 * it never models a real "file not found". `compose.ts#resolveSpec` only
 * demotes a source to `ok:false` when `container.git.readFile` THROWS, so a
 * plain `MockGitClient` can never exercise the unreachable-spec path. This
 * subclass makes exactly one path throw and leaves every other call
 * (including `diff()`, which `loadDiff` still needs) on the base mock.
 */
class GitWithUnreachableSpec extends MockGitClient {
  constructor(private readonly failingPath: string) {
    super({ diff: DIFF });
  }
  override async readFile(repo: RepoRef, path: string): Promise<string> {
    if (path === this.failingPath) {
      throw new Error(`ENOENT: spec not found at ${path}`);
    }
    return super.readFile(repo, path);
  }
}

let repoSeq = 0;

/** A repo + PR under a given workspace, with one patched file so `loadDiff`'s
 *  `pr_files` fallback also has something to reconstruct if `git.diff()` ever
 *  came back empty. */
async function makeRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  overrides: Partial<typeof t.pullRequests.$inferInsert> = {},
) {
  const n = repoSeq++;
  const name = `intent-fixture-${n}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 900 + n,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting.',
      ...overrides,
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('L03 Intent Layer — /pulls/:id/intent (Testcontainers pg)', () => {
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

  function appWith(opts: { intent?: Intent; git?: MockGitClient } = {}) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: opts.git ?? new MockGitClient({ diff: DIFF }),
        llm: {
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { pr_intent: opts.intent ?? CONFIDENT_INTENT },
          }),
        },
      },
    });
  }

  // ==========================================================================
  // Scenario 1 — workspace scoping
  // ==========================================================================

  it('GET /pulls/:id/intent 404s for a PR that belongs to another workspace', async () => {
    const app = await appWith();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-get-${repoSeq}` })
      .returning();
    const { pr } = await makeRepoAndPr(pg.handle.db, otherWs!.id);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    // Would wrongly be 200 (or 200 with null) if the route ever read
    // `pr_intent` — or looked the PR up — without first joining on
    // `workspaceId`, since `pr_intent` itself carries no workspace column.
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');

    await app.close();
  });

  it('POST /pulls/:id/intent 404s for a PR in another workspace and writes no pr_intent row', async () => {
    const app = await appWith();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-post-${repoSeq}` })
      .returning();
    const { pr } = await makeRepoAndPr(pg.handle.db, otherWs!.id);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(404);

    // `getPull(workspaceId, prId)` must reject BEFORE collect/classify/upsert
    // ever runs — confirm no row was written for the foreign PR despite it
    // genuinely existing (a weaker route-only check could pass even if
    // `detectIntent` classified first and only failed to return the result).
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row).toBeUndefined();

    await app.close();
  });

  // ==========================================================================
  // Scenario 2 — empty-body PR surfaces missing context
  // ==========================================================================

  it('an empty-body PR surfaces missing_context even though the model sounds confident', async () => {
    const app = await appWith({ intent: CONFIDENT_INTENT });
    const { pr } = await makeRepoAndPr(pg.handle.db, workspaceId, { body: '' });

    const posted = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(posted.statusCode).toBe(200);
    const posted_record: PrIntentRecord = posted.json();
    expect(posted_record.intent).toBe(CONFIDENT_INTENT.intent);
    // The honesty signal: no body means we flag it so the user knows the
    // intent was derived without that source (they can add it if needed).
    expect(posted_record.missing_context).toContain('PR description is empty');

    // Round-trip through the read path too — the persisted record carries the
    // missing-context flag for the UI to render.
    const got = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(got.statusCode).toBe(200);
    const got_record: PrIntentRecord = got.json();
    expect(got_record.missing_context).toContain('PR description is empty');

    await app.close();
  });

  // ==========================================================================
  // Scenario 3 — an unreachable linked spec is reported, never invented
  // ==========================================================================

  it('an unreachable linked spec lands in missing_context[] and sources[] as ok:false, and is never invented', async () => {
    const specPath = 'docs/specs/nope.md';
    const app = await appWith({ git: new GitWithUnreachableSpec(specPath) });
    const { pr } = await makeRepoAndPr(pg.handle.db, workspaceId, {
      body: `Implements the onboarding plan. See ${specPath} for the full design.`,
    });

    const posted = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(posted.statusCode).toBe(200);
    const record: PrIntentRecord = posted.json();

    // Honesty field: the failed resolution is named, not silently dropped.
    expect(record.missing_context).toContain(`Linked spec "${specPath}" could not be read`);
    // Provenance: the attempt itself is recorded as failed.
    const specSource = record.sources?.find((s) => s.kind === 'spec');
    expect(specSource).toMatchObject({ kind: 'spec', ref: specPath, ok: false });

    // Not invented: `container.git.readFile` threw BEFORE any spec text
    // reached the classifier's prompt (compose.ts's resolveSpec catch runs
    // ahead of `buildUserPrompt`), so the model only ever saw "(not
    // available)" for that source. The mock is deterministic — its output is
    // exactly the injected fixture — so the persisted intent matching it
    // (and not containing anything about "nope.md" or an invented design)
    // demonstrates nothing was fabricated to fill the gap.
    expect(record.intent).toBe(CONFIDENT_INTENT.intent);
    expect(record.intent).not.toContain('nope.md');

    await app.close();
  });
});
