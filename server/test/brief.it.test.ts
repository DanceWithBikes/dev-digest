import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import type { StructuredRequest, StructuredResult, PrBrief, RepoRef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { PR_482_BRIEF } from '../src/db/seed-fixtures.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * PR Brief (SPEC-03) — `GET|POST /pulls/:id/brief` over a real Postgres, with every
 * model provider and GitHub mocked (an unmocked `risk_brief` provider would make a
 * LIVE call, server/docs/insights.md "expected 'running' to be 'done'").
 *
 * Pins: AC-9..AC-14 (read never generates, one call, replace), AC-11 (workspace
 * scoping through the PR join: `pr_brief` has no workspace column), AC-23 (enabled
 * agents/skills decide the documents sent), AC-46 (failure keeps the old brief),
 * AC-48 (409), AC-49 (429), OQ-6 (corrupt stored JSON reads as null), AC-84/85
 * (seed idempotency, never overwrites a regenerated brief), and that a nullable
 * 200 is serialised as the JSON literal `null`.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const WRITTEN = {
  summary: 'Adds a stripe key to the config and nothing else.',
  risks: [] as unknown[],
  review_focus: [{ file: 'src/config.ts', line: 11, reason: 'New secret literal' }],
};

/** Mock that parks every structured call until `release()` — models a slow provider. */
class DeferredLLM extends MockLLMProvider {
  private entered = false;
  private gate: Promise<void>;
  private open!: () => void;
  constructor() {
    super('openai', { structuredBySchema: { pr_brief: WRITTEN } });
    this.gate = new Promise<void>((r) => (this.open = r));
  }
  release() {
    this.open();
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.entered = true;
    await this.gate;
    return super.completeStructured(req);
  }
  async started(): Promise<void> {
    while (!this.entered) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

/** Writer that always fails with provider text that must never reach the client. */
class FailingLLM extends MockLLMProvider {
  override async completeStructured<T>(): Promise<StructuredResult<T>> {
    throw new Error('SECRET-PROVIDER-TEXT');
  }
}

/** Reads of unknown paths throw (the stock mock resolves to ''); records the reads. */
class GitWithDocs extends MockGitClient {
  constructor(private docs: Record<string, string>) {
    super({ files: docs });
  }
  override async readFile(repo: RepoRef, path: string): Promise<string> {
    if (!(path in this.docs)) throw new Error(`ENOENT ${path}`);
    return super.readFile(repo, path);
  }
}

const structuredCalls = (m: MockLLMProvider) => m.calls.filter((c) => c.method === 'completeStructured');

d('PR Brief — /pulls/:id/brief (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function appWith(opts: { openai?: MockLLMProvider; openrouter?: MockLLMProvider; git?: MockGitClient } = {}) {
    const openai = opts.openai ?? new MockLLMProvider('openai', { structuredBySchema: { pr_brief: WRITTEN } });
    const openrouter =
      opts.openrouter ?? new MockLLMProvider('openai', { structuredBySchema: { pr_brief: WRITTEN } });
    return {
      openai,
      openrouter,
      app: await buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          embedder: new MockEmbedder(),
          github: new MockGitHubClient(),
          git: opts.git ?? new MockGitClient(),
          llm: { openai, openrouter },
        },
      }),
    };
  }

  async function makePr(ws: string = workspaceId) {
    const n = seq++;
    const name = `brief-fixture-${n}-${ws.slice(0, 4)}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 700 + n,
        title: 'Add stripe key',
        author: 'marisa.koch',
        branch: 'feat/x',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Adds a key.',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return { repo: repo!, pr: pr! };
  }

  async function otherWorkspace() {
    const [ws] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `brief-other-${seq++}` })
      .returning();
    return ws!;
  }

  const storedJson = async (prId: string) =>
    (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId)))[0]?.json;

  it('GET returns the JSON literal null (200) when no brief was generated, and never calls a model', async () => {
    const { app, openai, openrouter } = await appWith();
    const { pr } = await makePr();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });

    // Would be 500 / "{}" / empty body if the nullable response schema were not serialised as null.
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('null');
    expect(res.json()).toBeNull();
    expect(structuredCalls(openai)).toHaveLength(0);
    expect(structuredCalls(openrouter)).toHaveLength(0);
    await app.close();
  });

  it('POST generates one brief with exactly one structured call, stores it, and GET then returns the same brief without calling the writer again', async () => {
    const { app, openai, openrouter } = await appWith();
    const { pr } = await makePr();

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(post.statusCode).toBe(200);
    const brief = post.json() as PrBrief;
    expect(brief.summary).toBe(WRITTEN.summary);
    expect(brief.head_sha).toBe('a1b2c3d4');

    const calls = [...structuredCalls(openai), ...structuredCalls(openrouter)];
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as StructuredRequest<unknown>;
    expect(req.schemaName).toBe('pr_brief');
    expect(brief.model).toBe(req.model);
    expect(await storedJson(pr.id)).toMatchObject({ summary: WRITTEN.summary });

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual(brief);
    expect([...structuredCalls(openai), ...structuredCalls(openrouter)]).toHaveLength(1);
    await app.close();
  });

  it('a second POST regenerates and replaces the stored brief (one row, new content)', async () => {
    const { app } = await appWith();
    const { pr } = await makePr();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    await pg.handle.db
      .update(t.prBrief)
      .set({ json: { ...((await storedJson(pr.id)) as object), summary: 'STALE' } })
      .where(eq(t.prBrief.prId, pr.id));

    const second = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });

    expect(second.statusCode).toBe(200);
    expect(second.json().summary).toBe(WRITTEN.summary);
    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(rows).toHaveLength(1);
    expect((rows[0]!.json as PrBrief).summary).toBe(WRITTEN.summary);
    await app.close();
  });

  it('GET and POST return 404 for a PR in another workspace, and POST calls no model and stores nothing', async () => {
    const { app, openai, openrouter } = await appWith();
    const other = await otherWorkspace();
    const { pr } = await makePr(other.id);
    // A brief row exists for it: a missing workspace join would leak it.
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: PR_482_BRIEF });

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });

    expect(get.statusCode).toBe(404);
    expect(post.statusCode).toBe(404);
    expect(structuredCalls(openai)).toHaveLength(0);
    expect(structuredCalls(openrouter)).toHaveLength(0);
    expect((await storedJson(pr.id)) as PrBrief).toMatchObject({ model: 'seed' });
    await app.close();
  });

  it('a failing writer yields a server error without provider text and keeps the previous brief', async () => {
    const good = await appWith();
    const { pr } = await makePr();
    const first = await good.app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    await good.app.close();

    const bad = await appWith({
      openai: new FailingLLM('openai'),
      openrouter: new FailingLLM('openai'),
    });
    const res = await bad.app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });

    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(res.body).not.toContain('SECRET-PROVIDER-TEXT');
    const get = await bad.app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(get.json()).toEqual(first.json());
    await bad.app.close();
  });

  it('a POST while one is in flight for the same PR gets 409, and the first still completes and stores', async () => {
    const slow = new DeferredLLM();
    const { app } = await appWith({ openai: slow, openrouter: slow });
    const { pr } = await makePr();

    const firstP = app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    await slow.started();
    const second = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    slow.release();
    const first = await firstP;

    expect(second.statusCode).toBe(409);
    expect(first.statusCode).toBe(200);
    expect(await storedJson(pr.id)).toMatchObject({ summary: WRITTEN.summary });
    await app.close();
  });

  it('the sixth POST within a minute in one workspace gets 429 and calls no model', async () => {
    const { app, openai, openrouter } = await appWith();
    const { pr } = await makePr();

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).statusCode);
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect([...structuredCalls(openai), ...structuredCalls(openrouter)]).toHaveLength(5);
    await app.close();
  });

  it('stored JSON that fails the contract is read as no brief: GET returns null, not an error', async () => {
    const { app } = await appWith();
    const { pr } = await makePr();
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { summary: 42, unexpected: true } });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    await app.close();
  });

  it('sends documents attached to enabled agents and enabled skills, and omits those of disabled ones', async () => {
    const docs = {
      'docs/agent-on.md': 'DOC-AGENT-ON',
      'docs/agent-off.md': 'DOC-AGENT-OFF',
      'docs/skill-on.md': 'DOC-SKILL-ON',
      'docs/skill-off.md': 'DOC-SKILL-OFF',
    };
    const { app, openai, openrouter } = await appWith({ git: new GitWithDocs(docs) });
    const { pr, repo } = await makePr();
    const db = pg.handle.db;
    const mkAgent = async (name: string, enabled: boolean) =>
      (
        await db
          .insert(t.agents)
          .values({ workspaceId, name, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x', enabled })
          .returning()
      )[0]!;
    const mkSkill = async (name: string, enabled: boolean) =>
      (
        await db
          .insert(t.skills)
          .values({ workspaceId, name, description: 'd', type: 'custom', source: 'manual', body: 'b', enabled })
          .returning()
      )[0]!;
    const n = seq++;
    const aOn = await mkAgent(`brief-on-${n}`, true);
    const aOff = await mkAgent(`brief-off-${n}`, false);
    const sOn = await mkSkill(`brief-skill-on-${n}`, true);
    const sOff = await mkSkill(`brief-skill-off-${n}`, false);
    const att = (agentId: string, path: string) => ({ workspaceId, agentId, repoId: repo.id, path });
    await db.insert(t.agentContextAttachments).values([att(aOn.id, 'docs/agent-on.md'), att(aOff.id, 'docs/agent-off.md')]);
    await db.insert(t.agentSkills).values([
      { agentId: aOn.id, skillId: sOn.id, order: 0 },
      { agentId: aOn.id, skillId: sOff.id, order: 1 },
    ]);
    await db.insert(t.skillContextAttachments).values([
      { workspaceId, skillId: sOn.id, repoId: repo.id, path: 'docs/skill-on.md' },
      { workspaceId, skillId: sOff.id, repoId: repo.id, path: 'docs/skill-off.md' },
    ]);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });

    expect(res.statusCode).toBe(200);
    const [call] = [...structuredCalls(openai), ...structuredCalls(openrouter)];
    const prompt = JSON.stringify((call!.req as StructuredRequest<unknown>).messages);
    expect(prompt).toContain('DOC-AGENT-ON');
    expect(prompt).toContain('DOC-SKILL-ON');
    expect(prompt).not.toContain('DOC-AGENT-OFF');
    expect(prompt).not.toContain('DOC-SKILL-OFF');
    await app.close();
  });

  it('seed() run again leaves exactly one PR #482 brief; a regenerated brief survives a re-seed; GET #482 timing is recorded', async () => {
    const db = pg.handle.db;
    const [pr] = await db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, 482)));
    const count = async () => (await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr!.id))).length;

    await seed(db);
    expect(await count()).toBe(1);

    const { app } = await appWith();
    const seeded = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/brief` });
    expect(seeded.json()).toEqual(PR_482_BRIEF);

    await db.update(t.prBrief).set({ json: { ...PR_482_BRIEF, model: 'regenerated' } }).where(eq(t.prBrief.prId, pr!.id));
    await seed(db);
    expect(await count()).toBe(1);
    expect(((await storedJson(pr!.id)) as PrBrief).model).toBe('regenerated');

    // NFR-1 (indicative only): 20 timed GETs.
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      const r = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/brief` });
      times.push(performance.now() - t0);
      expect(r.statusCode).toBe(200);
    }
    times.sort((a, b) => a - b);
    console.info(`[NFR-1 indicative] GET /pulls/#482/brief p95 = ${times[18]!.toFixed(1)} ms (n=20)`);
    expect(times[18]!).toBeLessThan(1000);
    await app.close();
  });
});
