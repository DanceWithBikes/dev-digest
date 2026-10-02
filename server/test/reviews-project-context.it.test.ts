import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Intent, Review, RunTrace } from '@devdigest/shared';

/**
 * What a review run SENDS and RECORDS for Project Context (SPEC-01, AC-4,
 * AC-22..AC-34, AC-37). A real run with a stubbed LLM; assertions read the
 * persisted trace. Invariants: documents are ordered agent -> skills (link
 * order), deduped by first origin, never taken from a disabled skill or another
 * repo; an unreadable document is skipped (not-found log line + `not_found`
 * entry) without failing the run; the text sent is recorded verbatim and never
 * logged; zero extra LLM calls; with nothing collected the prompt is unchanged.
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

const REVIEW_FIXTURE: Review = { verdict: 'comment', summary: 'Nothing blocking.', score: 80, findings: [] };
// Shared Intent Layer pre-work must not hit a real provider (see reviews-skills.it.test.ts).
const INTENT_FIXTURE: Intent = {
  intent: 'Apply a coupon discount to the checkout flow.',
  in_scope: ['Coupon discount calculation'],
  out_of_scope: [],
};

const FILES: Record<string, string> = {
  'docs/a.md': 'BODY-A shared doc',
  'docs/b.md': 'BODY-B agent doc',
  'specs/s1.md': 'BODY-S1 first skill doc',
  'docs/z.md': 'BODY-Z second skill doc',
  'docs/disabled.md': 'BODY-DISABLED must never be sent',
  'docs/other.md': 'BODY-OTHER other repo doc',
};
const MISSING = 'docs/missing.md';

/** The default mock returns '' for unknown paths; a real clone throws. */
class StrictGit extends MockGitClient {
  constructor(private files: Record<string, string>) {
    super({ diff: DIFF, files });
  }
  override async readFile(_repo: Parameters<MockGitClient['readFile']>[0], path: string): Promise<string> {
    const text = this.files[path];
    if (text === undefined) throw new Error(`ENOENT: ${path}`);
    return text;
  }
}

d('project context reaches the prompt and the trace (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let otherRepoId: string;
  let prId: string;
  let agentId: string;
  const skillIds: Record<string, string> = {};
  let ignoredCalls = -1;

  const app = () => {
    const review = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const intent = new MockLLMProvider('openai', { structuredBySchema: { pr_intent: INTENT_FIXTURE } });
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new StrictGit(FILES),
        llm: { openai: review, openrouter: intent },
      },
    }).then((a) => {
      (a as unknown as { __providers: MockLLMProvider[] }).__providers = [review, intent];
      return a;
    });
  };

  const attach = async (kind: 'agents' | 'skills', ownerId: string, repo: string, paths: string[]) => {
    const a = await app();
    const res = await a.inject({ method: 'PUT', url: `/repos/${repo}/context/${kind}/${ownerId}`, payload: { paths } });
    expect(res.statusCode).toBe(200);
    await a.close();
  };

  const clearAttachments = async () => {
    await pg.handle.db.delete(t.agentContextAttachments);
    await pg.handle.db.delete(t.skillContextAttachments);
  };

  /** Run the agent once; return the persisted trace and the number of LLM calls. */
  async function run(): Promise<{ trace: RunTrace; calls: number }> {
    const a = await app();
    await pg.handle.db.delete(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const res = await a.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runs = await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    expect(runs[0]!.status).toBe('done');
    const trace = await waitForRunTrace(pg.handle.db, runs[0]!.id);
    const providers = (a as unknown as { __providers: MockLLMProvider[] }).__providers;
    const calls = providers.reduce((n, p) => n + p.calls.length, 0);
    await a.close();
    return { trace, calls };
  }

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ctx-api', fullName: 'acme/ctx-api' })
      .returning();
    repoId = repo!.id;
    const [other] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ctx-other', fullName: 'acme/ctx-other' })
      .returning();
    otherRepoId = other!.id;
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 7,
        title: 'Add coupon discount',
        author: 'marisa.koch',
        branch: 'feat/discount',
        base: 'main',
        headSha: 'deadbeef',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    prId = pr!.id;
    await pg.handle.db.insert(t.prFiles).values({
      prId,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    const a = await app();
    const agent = await a.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Ctx Probe', provider: 'openai', model: 'gpt-4.1', system_prompt: 'You are a reviewer.', repo_intel: false },
    });
    agentId = agent.json().id;
    for (const name of ['first', 'second', 'off']) {
      const res = await a.inject({
        method: 'POST',
        url: '/skills',
        payload: { name, description: `The ${name} rule.`, type: 'rubric', body: `Apply the ${name} rule.` },
      });
      skillIds[name] = res.json().id;
    }
    await a.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillIds.first, skillIds.second, skillIds.off] },
    });
    await a.inject({ method: 'PUT', url: `/skills/${skillIds.off}`, payload: { enabled: false } });
    await a.close();
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('with nothing collected, sends an unchanged prompt, records no context_docs and adds no log line (AC-37)', async () => {
    await clearAttachments();
    const before = await run();
    expect(before.trace.context_docs).toBeUndefined();
    expect(before.trace.specs_read).toEqual([]);

    // Attachments that must be ignored: another repo's, and a disabled skill's.
    await attach('agents', agentId, otherRepoId, ['docs/other.md']);
    await attach('skills', skillIds.off!, repoId, ['docs/disabled.md']);
    const ignored = await run();

    expect(ignored.trace.prompt_assembly.system).toBe(before.trace.prompt_assembly.system);
    expect(ignored.trace.prompt_assembly.user).toBe(before.trace.prompt_assembly.user);
    expect(ignored.trace.context_docs).toBeUndefined();
    expect(ignored.trace.specs_read).toEqual([]);
    expect(ignored.trace.prompt_assembly.user).not.toContain('BODY-OTHER');
    expect(ignored.trace.prompt_assembly.user).not.toContain('BODY-DISABLED');
    expect(ignored.trace.log.some((l) => l.msg.includes('project context'))).toBe(false);
    ignoredCalls = ignored.calls;
  });

  it('sends agent docs before skill docs, dedupes by first origin, skips unreadable ones, and records versions', async () => {
    await clearAttachments();
    await attach('agents', agentId, repoId, ['docs/b.md', 'docs/a.md', MISSING]);
    await attach('skills', skillIds.first!, repoId, ['specs/s1.md', 'docs/a.md']);
    await attach('skills', skillIds.second!, repoId, ['docs/z.md']);
    await attach('skills', skillIds.off!, repoId, ['docs/disabled.md']);
    await attach('agents', agentId, otherRepoId, ['docs/other.md']);

    const { trace, calls } = await run();

    expect(trace.context_docs!.map((e) => [e.path, e.origin, e.status, e.version])).toEqual([
      ['docs/a.md', 'agent', 'sent', 'deadbeef'],
      ['docs/b.md', 'agent', 'sent', 'deadbeef'],
      [MISSING, 'agent', 'not_found', ''],
      ['specs/s1.md', 'skill: first', 'sent', 'deadbeef'],
      ['docs/z.md', 'skill: second', 'sent', 'deadbeef'],
    ]);
    // AC-4: specs_read = sent paths only, in prompt order.
    expect(trace.specs_read).toEqual(['docs/a.md', 'docs/b.md', 'specs/s1.md', 'docs/z.md']);

    const notFound = trace.context_docs!.find((e) => e.path === MISSING)!;
    expect(notFound).toMatchObject({ text: null, tokens: 0 });

    const sent = trace.context_docs!.filter((e) => e.status === 'sent');
    for (const e of sent) {
      expect(e.text).toBe(FILES[e.path]);
      expect(e.tokens).toBe(Math.ceil(FILES[e.path]!.length / 4));
      expect(trace.prompt_assembly.user).toContain(e.text!);
    }
    // Prompt order follows the entries order.
    const idx = sent.map((e) => trace.prompt_assembly.user.indexOf(e.text!));
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);

    for (const gone of ['BODY-DISABLED', 'BODY-OTHER']) {
      expect(trace.prompt_assembly.user).not.toContain(gone);
    }
    expect(trace.context_docs!.some((e) => e.path === 'docs/disabled.md' || e.path === 'docs/other.md')).toBe(false);

    // AC-31: collecting and sending documents adds zero model calls.
    expect(calls).toBe(ignoredCalls);
  });

  it('logs the not-found path and the sent count, and never the document text', async () => {
    await clearAttachments();
    await attach('agents', agentId, repoId, ['docs/b.md', 'docs/a.md', MISSING]);
    await attach('skills', skillIds.first!, repoId, ['specs/s1.md']);
    await attach('skills', skillIds.second!, repoId, ['docs/z.md']);
    const { trace } = await run();
    const msgs = trace.log.map((l) => l.msg);
    expect(msgs.some((m) => m.includes(MISSING) && m.includes('not found'))).toBe(true);
    const total = trace.context_docs!.filter((e) => e.status === 'sent').reduce((n, e) => n + e.tokens, 0);
    expect(msgs).toContain(`project context: 4 document(s) sent (~${total} tokens)`);
    for (const text of Object.values(FILES)) {
      expect(msgs.some((m) => m.includes(text))).toBe(false);
    }
  });

  it('still completes the run and records only not_found entries when every document is unreadable', async () => {
    await clearAttachments();
    await attach('agents', agentId, repoId, ['docs/nope-1.md', 'docs/nope-2.md']);
    const { trace } = await run();
    expect(trace.context_docs!.map((e) => e.status)).toEqual(['not_found', 'not_found']);
    expect(trace.specs_read).toEqual([]);
    expect(trace.log.filter((l) => l.msg.includes('not found'))).toHaveLength(2);
    expect(trace.log.some((l) => l.msg.startsWith('project context:'))).toBe(false);
  });
});
