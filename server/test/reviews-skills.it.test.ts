import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review, RunTrace } from '@devdigest/shared';

/**
 * The load-bearing regression for skills: what an agent is actually TOLD.
 *
 * A review's findings depend on a model, so they can't be asserted. The prompt
 * can: this drives a real run with a stubbed LLM and reads the persisted trace,
 * checking that the `## Skills / rules` block holds exactly the skills that are
 * attached AND globally enabled, in `agent_skills.order` — and nothing else.
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

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Nothing blocking.',
  score: 80,
  findings: [],
};

d('skills reach the prompt (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agentId: string;
  let prId: string;
  const skillIds: Record<string, string> = {};

  const app = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-api', fullName: 'acme/skills-api' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 483,
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
      payload: {
        name: 'Skills Probe',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
        repo_intel: false,
      },
    });
    agentId = agent.json().id;

    for (const name of ['alpha', 'bravo', 'charlie']) {
      const res = await a.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name,
          description: `The ${name} rule.`,
          type: 'rubric',
          body: `Apply the ${name} rule.`,
        },
      });
      skillIds[name] = res.json().id;
    }
  });

  afterAll(async () => {
    await pg?.stop();
  });

  /** Run the agent once and return the persisted trace's skills block. */
  async function runAndReadSkillsBlock(): Promise<string | null> {
    const a = await app();
    await pg.handle.db.delete(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const res = await a.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: { agentId },
    });
    expect(res.statusCode).toBe(200);
    const runs = await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    expect(runs[0]!.status).toBe('done');
    const [row] = await pg.handle.db
      .select()
      .from(t.runTraces)
      .where(eq(t.runTraces.runId, runs[0]!.id));
    return (row!.trace as RunTrace).prompt_assembly.skills;
  }

  it('omits the section entirely when the agent has no skills', async () => {
    expect(await runAndReadSkillsBlock()).toBeNull();
  });

  it('sends attached + enabled skills in link order, and drops a disabled one', async () => {
    const a = await app();
    await a.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillIds.alpha, skillIds.bravo, skillIds.charlie] },
    });
    // bravo stays attached, but is switched off globally on the Skills page.
    await a.inject({
      method: 'PUT',
      url: `/skills/${skillIds.bravo}`,
      payload: { enabled: false },
    });

    const block = await runAndReadSkillsBlock();
    expect(block).not.toBeNull();
    expect(block).toContain('### alpha');
    expect(block).toContain('### charlie');
    // Attached but globally disabled — must never reach the model.
    expect(block).not.toContain('bravo');
    expect(block!.indexOf('### alpha')).toBeLessThan(block!.indexOf('### charlie'));
  });

  it('reorders the blocks when the agent\'s skill order changes', async () => {
    const a = await app();
    await a.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillIds.charlie, skillIds.alpha] },
    });

    const block = await runAndReadSkillsBlock();
    expect(block!.indexOf('### charlie')).toBeLessThan(block!.indexOf('### alpha'));
  });
});
