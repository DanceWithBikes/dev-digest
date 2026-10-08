/**
 * SPEC-04 Eval Pipeline — server integration (Step T1).
 *
 * Pins, through real `app.inject` calls on a seeded Postgres: the one-click
 * "turn a decided finding into an eval case" flow, case CRUD + validation,
 * batch runs scored against a mocked LLM, and the overview + boot reaper.
 * Every batch test uses a fresh agent so tests do not depend on each other's
 * state or on the order they run in. No test here ever reaches a real model:
 * every provider the batch can resolve is a `MockLLMProvider`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, ne } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForEvalBatch } from './helpers/evals.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { PR_482_PATCHES } from '../src/db/seed-fixtures.js';
import { SEED_EVAL_CASES } from '../src/db/seed-eval-cases.js';
import { MockLLMProvider, MockEmbedder, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { fileDiff } from '@devdigest/reviewer-core';
import { EvalBatchDetail, EVAL_INPUT_DIFF_MAX, type Review, type StructuredRequest } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const CONFIG_PATCH = PR_482_PATCHES['src/config.ts'];
const USERS_PATCH = PR_482_PATCHES['src/api/users.ts'];
const CONFIG_DIFF = fileDiff('src/config.ts', CONFIG_PATCH);
const USERS_DIFF = fileDiff('src/api/users.ts', USERS_PATCH);

/** True positive (config:12), noise (users:47) and a hallucination (config:999). */
const FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Fixture review.',
  score: 50,
  findings: [
    {
      id: 'f-tp',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 12,
      end_line: 12,
      rationale: 'A live key is committed.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-noise',
      severity: 'WARNING',
      category: 'perf',
      title: 'N+1 query',
      file: 'src/api/users.ts',
      start_line: 47,
      end_line: 47,
      rationale: 'One query per user.',
      confidence: 0.8,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'Not in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

/** Holds every model call until `release()` — makes "while running" deterministic. */
class GatedLLM extends MockLLMProvider {
  release!: () => void;
  private gate = new Promise<void>((resolve) => {
    this.release = resolve;
  });
  override async completeStructured<T>(req: StructuredRequest<T>) {
    await this.gate;
    return super.completeStructured(req);
  }
}

/** Throws on the first `failFirst` structured calls, then behaves like the mock. */
class FailingLLM extends MockLLMProvider {
  private attempts = 0;
  constructor(
    private failFirst: number,
    structured: unknown,
  ) {
    super('openai', { structured });
  }
  override async completeStructured<T>(req: StructuredRequest<T>) {
    this.calls.push({ method: 'completeStructured', req });
    if (this.attempts++ < this.failFirst) throw new Error('provider exploded');
    this.calls.pop();
    return super.completeStructured(req);
  }
}

const structuredCalls = (m: MockLLMProvider) => m.calls.filter((c) => c.method === 'completeStructured');

d('SPEC-04 eval pipeline (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let securityAgentId: string;
  let seededReviewId: string;
  let seededPrId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [sec] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.name, 'Security Reviewer'));
    securityAgentId = sec!.id;
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    seededPrId = pr!.id;
    const [review] = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, seededPrId));
    seededReviewId = review!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** Every provider a batch can resolve is a mock (server/docs/insights.md: override every reachable provider). */
  function appWith(overrides: { mock?: MockLLMProvider; secrets?: MockSecretsProvider } = {}) {
    const mock = overrides.mock;
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        ...(overrides.secrets ? { secrets: overrides.secrets } : {}),
        ...(mock ? { llm: { openai: mock, anthropic: mock, openrouter: mock } } : {}),
      },
    });
  }
  type App = Awaited<ReturnType<typeof appWith>>;

  const seededFindings = async () => {
    const rows = await pg.handle.db.select().from(t.findings).where(eq(t.findings.reviewId, seededReviewId));
    return rows;
  };

  /** A fresh, undecided finding on the seeded review (keeps one-click tests independent). */
  async function newFinding(
    over: Partial<typeof t.findings.$inferInsert> = {},
    reviewId = seededReviewId,
  ) {
    const [row] = await pg.handle.db
      .insert(t.findings)
      .values({
        reviewId,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Fresh finding',
        rationale: 'r',
        confidence: 0.9,
        ...over,
      })
      .returning();
    return row!;
  }

  async function createAgent(app: App, over: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `Eval agent ${Math.random()}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'You review.', ...over },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number; system_prompt: string };
  }

  const manualCase = (over: Record<string, unknown> = {}) => ({
    name: 'Manual case',
    input_diff: CONFIG_DIFF,
    expected_output: {
      expectations: [{ kind: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 12 }],
    },
    ...over,
  });

  async function addCase(app: App, agentId: string, body: Record<string, unknown>) {
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-cases`, payload: body });
    expect(res.statusCode, res.body).toBe(201);
    return res.json() as { id: string };
  }

  /** The two designed cases of the batch tests. */
  async function agentWithDesignedCases(app: App, agentOver: Record<string, unknown> = {}) {
    const agent = await createAgent(app, agentOver);
    const c1 = await addCase(
      app,
      agent.id,
      manualCase({
        name: 'Two-file diff',
        // `fileDiff` wraps ONE file; the parser only starts a new file at `diff --git`.
        input_diff: `diff --git a/src/config.ts b/src/config.ts\n${CONFIG_DIFF}\ndiff --git a/src/api/users.ts b/src/api/users.ts\n${USERS_DIFF}`,
        expected_output: {
          expectations: [
            { kind: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 12 },
            { kind: 'must_not_flag', file: 'src/api/users.ts', start_line: 45, end_line: 52 },
          ],
        },
      }),
    );
    const c2 = await addCase(app, agent.id, manualCase({ name: 'Config only' }));
    return { agent, c1, c2 };
  }

  // =========================================================================
  describe('one-click eval case from a finding (AC-23..AC-34)', () => {
    it('turns an accepted seeded finding into a must_find case owned by the Security Reviewer', async () => {
      const mock = new MockLLMProvider('openai', { structured: FIXTURE });
      const app = await appWith({ mock });
      const config = (await seededFindings()).find((f) => f.file === 'src/config.ts')!;

      expect((await app.inject({ method: 'POST', url: `/findings/${config.id}/accept` })).statusCode).toBe(200);
      const res = await app.inject({ method: 'POST', url: `/findings/${config.id}/eval-case`, payload: {} });

      expect(res.statusCode).toBe(201);
      const c = res.json();
      expect(c.expected_output.expectations[0].kind).toBe('must_find');
      expect(c.expected_output.expectations[0]).toMatchObject({ file: 'src/config.ts', start_line: 12, end_line: 12 });
      expect(c.created_from).toBe('finding');
      expect(c.source_finding_id).toBe(config.id);
      expect(c.owner_id).toBe(securityAgentId);
      expect(c.input_diff.startsWith('--- a/src/config.ts\n+++ b/src/config.ts')).toBe(true);
      expect(c.input_diff).toBe(CONFIG_DIFF);
      expect(c.input_meta.title).toBe('Add rate limiting to public API endpoints');
      expect(c.last_run).toBeNull();

      // AC-33: the second call returns the same case, 200.
      const again = await app.inject({ method: 'POST', url: `/findings/${config.id}/eval-case`, payload: {} });
      expect(again.statusCode).toBe(200);
      expect(again.json().id).toBe(c.id);
      const stored = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, config.id));
      expect(stored).toHaveLength(1);

      expect(mock.calls).toHaveLength(0); // NFR-4: no model call
      await app.close();
    });

    it('turns a dismissed seeded finding into a must_not_flag case', async () => {
      const app = await appWith();
      const users = (await seededFindings()).find((f) => f.file === 'src/api/users.ts')!;

      expect((await app.inject({ method: 'POST', url: `/findings/${users.id}/dismiss` })).statusCode).toBe(200);
      const res = await app.inject({ method: 'POST', url: `/findings/${users.id}/eval-case` });

      expect(res.statusCode).toBe(201);
      const c = res.json();
      expect(c.expected_output.expectations[0]).toMatchObject({ kind: 'must_not_flag', file: 'src/api/users.ts' });
      expect(c.input_diff).toBe(USERS_DIFF);
      await app.close();
    });

    it('answers 409 finding_undecided for a finding that is neither accepted nor dismissed, storing nothing', async () => {
      const app = await appWith();
      const f = await newFinding();

      const res = await app.inject({ method: 'POST', url: `/findings/${f.id}/eval-case`, payload: {} });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('finding_undecided');
      const stored = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, f.id));
      expect(stored).toHaveLength(0);
      await app.close();
    });

    it('answers 409 no_patch when the PR has no stored patch for the finding file', async () => {
      const app = await appWith();
      const f = await newFinding({ file: 'src/not-in-pr.ts', acceptedAt: new Date() });
      // a stored file row with a NULL patch is "no patch" too
      await pg.handle.db.insert(t.prFiles).values({ prId: seededPrId, path: 'src/null-patch.ts', additions: 1, deletions: 0 });
      const g = await newFinding({ file: 'src/null-patch.ts', acceptedAt: new Date() });

      for (const id of [f.id, g.id]) {
        const res = await app.inject({ method: 'POST', url: `/findings/${id}/eval-case`, payload: {} });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe('no_patch');
      }
      await app.close();
    });

    it('answers 409 no_agent for a review without an agent unless the body names one, then the case is owned by it', async () => {
      const app = await appWith();
      const [orphanReview] = await pg.handle.db
        .insert(t.reviews)
        .values({ workspaceId, prId: seededPrId, kind: 'review', verdict: 'comment', model: 'test' })
        .returning();
      const f = await newFinding({ acceptedAt: new Date() }, orphanReview!.id);

      const refused = await app.inject({ method: 'POST', url: `/findings/${f.id}/eval-case`, payload: {} });
      expect(refused.statusCode).toBe(409);
      expect(refused.json().error.code).toBe('no_agent');

      const created = await app.inject({
        method: 'POST',
        url: `/findings/${f.id}/eval-case`,
        payload: { agent_id: securityAgentId },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().owner_id).toBe(securityAgentId);
      await app.close();
    });

    it('answers 404 for a finding that belongs to another workspace', async () => {
      const app = await appWith();
      const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: 'Other workspace' }).returning();
      const [repo] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId: ws2!.id, owner: 'other', name: 'other-repo', fullName: 'other/other-repo' })
        .returning();
      const [pr] = await pg.handle.db
        .insert(t.pullRequests)
        .values({
          workspaceId: ws2!.id,
          repoId: repo!.id,
          number: 1,
          title: 'Other',
          author: 'x',
          branch: 'b',
          base: 'main',
          headSha: 'abc',
          additions: 1,
          deletions: 0,
          filesCount: 1,
          status: 'needs_review',
        })
        .returning();
      await pg.handle.db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0, patch: CONFIG_PATCH });
      const [review] = await pg.handle.db
        .insert(t.reviews)
        .values({ workspaceId: ws2!.id, prId: pr!.id, kind: 'review', agentId: securityAgentId, model: 'test' })
        .returning();
      const f = await newFinding({ acceptedAt: new Date() }, review!.id);

      const res = await app.inject({ method: 'POST', url: `/findings/${f.id}/eval-case`, payload: {} });

      expect(res.statusCode).toBe(404);
      const stored = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, f.id));
      expect(stored).toHaveLength(0);
      await app.close();
    });
  });

  // =========================================================================
  describe('eval case CRUD and validation (AC-35..AC-42, AC-128, AC-129)', () => {
    it('creates a manual case, lists it with last_run null, updates it and deletes it', async () => {
      const mock = new MockLLMProvider('openai', { structured: FIXTURE });
      const app = await appWith({ mock });
      const agent = await createAgent(app);

      const created = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-cases`,
        payload: manualCase({ notes: 'n' }),
      });
      expect(created.statusCode).toBe(201);
      const c = created.json();
      expect(c).toMatchObject({ created_from: 'manual', source_finding_id: null, owner_id: agent.id, notes: 'n' });

      const listed = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(c.id);
      expect(listed[0].last_run).toBeNull();

      const updated = await app.inject({
        method: 'PUT',
        url: `/eval-cases/${c.id}`,
        payload: manualCase({ name: 'Renamed', notes: null }),
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ id: c.id, name: 'Renamed', notes: null });

      expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json()).toEqual([]);
      expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(404);

      expect(mock.calls).toHaveLength(0); // NFR-4
      await app.close();
    });

    it('shows the newest run as last_run and cascades runs away when the case is deleted', async () => {
      const app = await appWith();
      const agent = await createAgent(app);
      const c = await addCase(app, agent.id, manualCase());
      const [batch] = await pg.handle.db
        .insert(t.evalBatches)
        .values({
          workspaceId,
          agentId: agent.id,
          agentVersion: 1,
          systemPrompt: 'p',
          provider: 'openai',
          model: 'gpt-4.1',
          status: 'done',
          casesTotal: 1,
        })
        .returning();
      await pg.handle.db.insert(t.evalRuns).values({ caseId: c.id, batchId: batch!.id, pass: true });

      const listed = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      expect(listed[0].last_run).toEqual({ pass: true, batch_id: batch!.id });

      expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(204);
      const runs = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, c.id));
      expect(runs).toHaveLength(0);
      await app.close();
    });

    const invalid: Array<[string, () => Record<string, unknown>]> = [
      ['empty expectations (AC-129)', () => manualCase({ expected_output: { expectations: [] } })],
      [
        'start_line greater than end_line (AC-41)',
        () =>
          manualCase({
            expected_output: { expectations: [{ kind: 'must_find', file: 'src/config.ts', start_line: 13, end_line: 12 }] },
          }),
      ],
      ['a diff that parses to 0 files', () => manualCase({ input_diff: '@@ -1,1 +1,1 @@\n-a\n+b' })],
      [
        'an expectation file that is not in the diff',
        () =>
          manualCase({
            expected_output: { expectations: [{ kind: 'must_find', file: 'src/other.ts', start_line: 1, end_line: 1 }] },
          }),
      ],
      ['a diff over the 200,000-character cap', () => manualCase({ input_diff: 'x'.repeat(EVAL_INPUT_DIFF_MAX + 1) })],
    ];
    it.each(invalid)('rejects %s with 422 on create and on update, storing and changing nothing', async (_name, body) => {
      const app = await appWith();
      const agent = await createAgent(app);
      const existing = await addCase(app, agent.id, manualCase({ name: 'Keep me' }));

      const create = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: body() });
      expect(create.statusCode).toBe(422);
      const update = await app.inject({ method: 'PUT', url: `/eval-cases/${existing.id}`, payload: body() });
      expect(update.statusCode).toBe(422);

      const listed = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      expect(listed).toHaveLength(1);
      expect(listed[0].name).toBe('Keep me');
      await app.close();
    });
  });

  // =========================================================================
  describe('batch run with mocked LLM (AC-43..AC-57, NFR-1)', () => {
    it('scores the two designed cases exactly and micro-averages the batch', async () => {
      const mock = new MockLLMProvider('openai', { structured: FIXTURE });
      const app = await appWith({ mock });
      const { agent, c1, c2 } = await agentWithDesignedCases(app);

      const started = Date.now();
      const post = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(post.statusCode).toBe(202);
      expect(post.json().status).toBe('running'); // AC-43
      const batchId = post.json().id as string;
      await waitForEvalBatch(pg.handle.db, batchId);
      expect(Date.now() - started).toBeLessThan(5_000); // NFR-1

      const detail = EvalBatchDetail.parse((await app.inject({ method: 'GET', url: `/eval-runs/${batchId}` })).json());
      expect(detail.runs).toHaveLength(2);
      const run1 = detail.runs.find((r) => r.case_id === c1.id)!;
      const run2 = detail.runs.find((r) => r.case_id === c2.id)!;

      expect(run1.recall).toBeCloseTo(1, 10);
      expect(run1.precision).toBeCloseTo(0.5, 10);
      expect(run1.citation_accuracy).toBeCloseTo(2 / 3, 10);
      expect(run1.pass).toBe(false);
      expect(run1.actual_output!.kept.map((f) => f.id).sort()).toEqual(['f-noise', 'f-tp']);
      expect(run1.actual_output!.dropped.map((f) => f.id)).toEqual(['f-halluc']);
      expect(run1.actual_output!.noise_finding_ids).toEqual(['f-noise']);

      expect(run2.recall).toBeCloseTo(1, 10);
      expect(run2.precision).toBeCloseTo(1, 10);
      expect(run2.citation_accuracy).toBeCloseTo(1 / 3, 10);
      expect(run2.pass).toBe(true);
      expect(run2.actual_output!.kept.map((f) => f.id)).toEqual(['f-tp']);
      expect(run2.actual_output!.dropped.map((f) => f.id).sort()).toEqual(['f-halluc', 'f-noise']);

      const b = detail.batch;
      expect(b.status).toBe('done');
      expect(b.error).toBeNull();
      expect(b.recall).toBeCloseTo(1, 10);
      expect(b.precision).toBeCloseTo(2 / 3, 10);
      expect(b.citation_accuracy).toBeCloseTo(0.5, 10);
      expect(b.cases_total).toBe(2);
      expect(b.cases_passed).toBe(1);
      expect(b.must_find_total).toBe(2);
      expect(b.must_find_matched).toBe(2);
      expect(b.kept_total).toBe(3);
      expect(b.noise_total).toBe(1);
      expect(b.dropped_total).toBe(3);
      expect(b.cost_usd).toBeCloseTo(0.002, 10); // Σ per-call 0.001
      expect(b.finished_at).not.toBeNull();

      // AC-51: one model call per case, none from scoring.
      expect(structuredCalls(mock)).toHaveLength(2);
      expect(mock.calls).toHaveLength(2);
      await app.close();
    });

    it('rejects a second start with 409 batch_running while one runs, then accepts one after it finishes', async () => {
      const gated = new GatedLLM('openai', { structured: FIXTURE });
      const app = await appWith({ mock: gated });
      const { agent } = await agentWithDesignedCases(app);

      const first = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(first.statusCode).toBe(202);
      const second = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe('batch_running');

      // AC-43: while gated, no run row exists yet.
      const mid = (await app.inject({ method: 'GET', url: `/eval-runs/${first.json().id}` })).json();
      expect(mid.batch.status).toBe('running');
      expect(mid.runs).toEqual([]);

      gated.release();
      await waitForEvalBatch(pg.handle.db, first.json().id);
      const third = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(third.statusCode).toBe(202);
      await waitForEvalBatch(pg.handle.db, third.json().id);
      await app.close();
    });

    it('answers 409 no_eval_cases for an agent without cases, creating no batch', async () => {
      const app = await appWith({ mock: new MockLLMProvider('openai', { structured: FIXTURE }) });
      const agent = await createAgent(app);

      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('no_eval_cases');
      const batches = await pg.handle.db.select().from(t.evalBatches).where(eq(t.evalBatches.agentId, agent.id));
      expect(batches).toHaveLength(0);
      await app.close();
    });

    it('freezes the agent at request time: a later edit changes neither the snapshot nor the prompt sent', async () => {
      const gated = new GatedLLM('openai', { structured: FIXTURE });
      const app = await appWith({ mock: gated });
      const { agent } = await agentWithDesignedCases(app, { system_prompt: 'ORIGINAL-PROMPT-MARKER' });

      const post = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(post.statusCode).toBe(202);
      expect(post.json()).toMatchObject({
        agent_id: agent.id,
        agent_version: 1,
        system_prompt: 'ORIGINAL-PROMPT-MARKER',
        provider: 'openai',
        model: 'gpt-4.1',
      });

      const edit = await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'EDITED-PROMPT-MARKER' },
      });
      expect(edit.json().version).toBe(2);
      gated.release();
      const { batch } = await waitForEvalBatch(pg.handle.db, post.json().id);

      expect(batch.agentVersion).toBe(1);
      expect(batch.systemPrompt).toBe('ORIGINAL-PROMPT-MARKER');
      const sent = JSON.stringify(gated.calls.map((c) => c.req));
      expect(sent).toContain('ORIGINAL-PROMPT-MARKER');
      expect(sent).not.toContain('EDITED-PROMPT-MARKER');
      await app.close();
    });

    it('lists an agent\'s batches newest first', async () => {
      const app = await appWith({ mock: new MockLLMProvider('openai', { structured: FIXTURE }) });
      const { agent } = await agentWithDesignedCases(app);

      const first = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();
      await waitForEvalBatch(pg.handle.db, first.id);
      const second = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();
      await waitForEvalBatch(pg.handle.db, second.id);

      const listed = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
      expect(listed.map((b: { id: string }) => b.id)).toEqual([second.id, first.id]);
      await app.close();
    });

    it('records an errored run (pass null) when one case throws and still finishes the batch as done (AC-53)', async () => {
      const flaky = new FailingLLM(1, FIXTURE);
      const app = await appWith({ mock: flaky });
      const { agent } = await agentWithDesignedCases(app);

      const post = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();
      const { batch, runs } = await waitForEvalBatch(pg.handle.db, post.id);

      expect(batch.status).toBe('done');
      expect(batch.casesTotal).toBe(2);
      const errored = runs.filter((r) => r.error !== null);
      expect(errored).toHaveLength(1);
      expect(errored[0]!.pass).toBeNull();
      expect(errored[0]!.error).toContain('provider exploded');
      const scored = runs.filter((r) => r.error === null);
      expect(scored).toHaveLength(1);
      expect(scored[0]!.pass).not.toBeNull();
      await app.close();
    });

    it('fails the batch with "all 2 cases failed" when every case throws (AC-55)', async () => {
      const dead = new FailingLLM(Number.POSITIVE_INFINITY, FIXTURE);
      const app = await appWith({ mock: dead });
      const { agent } = await agentWithDesignedCases(app);

      const post = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();
      const { batch, runs } = await waitForEvalBatch(pg.handle.db, post.id);

      expect(batch.status).toBe('failed');
      expect(batch.error?.startsWith('all 2 cases failed')).toBe(true);
      expect(batch.recall).toBeNull();
      expect(runs).toHaveLength(2);
      expect(runs.every((r) => r.pass === null && r.error !== null)).toBe(true);
      await app.close();
    });

    it('fails the batch when the agent\'s provider has no key and no override (AC-56)', async () => {
      // openai is mocked, anthropic is not and the secret store is empty.
      const app = await buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          embedder: new MockEmbedder(),
          secrets: new MockSecretsProvider({}),
          llm: { openai: new MockLLMProvider('openai', { structured: FIXTURE }) },
        },
      });
      const { agent } = await agentWithDesignedCases(app, { provider: 'anthropic', model: 'claude-sonnet-4' });

      const post = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(post.statusCode).toBe(202);
      const { batch, runs } = await waitForEvalBatch(pg.handle.db, post.json().id, { expectedRuns: 0 });

      expect(batch.status).toBe('failed');
      expect(batch.error).toContain('ANTHROPIC_API_KEY');
      expect(runs).toHaveLength(0);
      await app.close();
    });
  });

  // =========================================================================
  describe('overview and boot reaper (AC-58, AC-62, AC-63)', () => {
    it('lists the Security Reviewer with its cases, latest batch and a chronological trend of at most 10', async () => {
      const mock = new MockLLMProvider('openai', { structured: FIXTURE });
      const app = await appWith({ mock });

      const res = await app.inject({ method: 'GET', url: '/eval/overview' });

      expect(res.statusCode).toBe(200);
      const overview = res.json();
      const sec = overview.agents.find((a: { agent_id: string }) => a.agent_id === securityAgentId);
      expect(sec.name).toBe('Security Reviewer');
      expect(sec.cases_total).toBeGreaterThanOrEqual(8);
      expect(sec.latest_batch).not.toBeNull();
      expect(sec.trend.length).toBeGreaterThan(0);
      expect(sec.trend.length).toBeLessThanOrEqual(10);
      const times = sec.trend.map((b: { ran_at: string }) => Date.parse(b.ran_at));
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(sec.trend.every((b: { status: string }) => b.status === 'done')).toBe(true);
      expect(overview.recent_batches.length).toBeLessThanOrEqual(20);
      expect(mock.calls).toHaveLength(0); // NFR-4
      await app.close();
    });

    it('fails a batch left running by a dead process when the app boots (AC-58)', async () => {
      const [batch] = await pg.handle.db
        .insert(t.evalBatches)
        .values({
          workspaceId,
          agentId: securityAgentId,
          agentVersion: 1,
          systemPrompt: 'p',
          provider: 'openai',
          model: 'gpt-4.1',
          status: 'running',
          casesTotal: 1,
        })
        .returning();

      const app = await appWith();

      const [row] = await pg.handle.db.select().from(t.evalBatches).where(eq(t.evalBatches.id, batch!.id));
      expect(row!.status).toBe('failed');
      expect((row!.error ?? '').length).toBeGreaterThan(0);
      await app.close();
    });
  });

  // =========================================================================
  describe('seed idempotency (AC-65, AC-70)', () => {
    const seedNames = SEED_EVAL_CASES.map((c) => c.name);

    async function seedState() {
      const db = pg.handle.db;
      const cases = await db.select().from(t.evalCases).where(eq(t.evalCases.ownerId, securityAgentId));
      const batches = await db
        .select()
        .from(t.evalBatches)
        .where(and(eq(t.evalBatches.agentId, securityAgentId), eq(t.evalBatches.model, 'seed')));
      const runs = await Promise.all(
        batches.map((b) => db.select().from(t.evalRuns).where(eq(t.evalRuns.batchId, b.id))),
      );
      const files = await db.select().from(t.prFiles).where(eq(t.prFiles.prId, seededPrId));
      const [review] = await db.select().from(t.reviews).where(eq(t.reviews.id, seededReviewId));
      return {
        seedCases: cases.filter((c) => seedNames.includes(c.name)).length,
        seedBatches: batches.length,
        seedRuns: runs.flat().length,
        patches: Object.fromEntries(
          Object.keys(PR_482_PATCHES).map((p) => [p, files.find((f) => f.path === p)?.patch ?? null]),
        ),
        reviewAgentId: review!.agentId,
      };
    }

    it('keeps 8 cases, 2 seed batches, 16 runs, the #482 patches and the review agent unchanged on a second seed', async () => {
      const before = await seedState();
      expect(before).toMatchObject({ seedCases: 8, seedBatches: 2, seedRuns: 16, reviewAgentId: securityAgentId });
      expect(before.patches['src/config.ts']).toBe(CONFIG_PATCH);
      expect(before.patches['src/api/users.ts']).toBe(USERS_PATCH);

      await seed(pg.handle.db);

      expect(await seedState()).toEqual(before);
    });

    it('does not overwrite a review agent that was set by hand (the backfill is WHERE agent_id IS NULL)', async () => {
      const [other] = await pg.handle.db
        .select()
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), ne(t.agents.id, securityAgentId)))
        .limit(1);
      expect(other).toBeDefined();
      try {
        await pg.handle.db.update(t.reviews).set({ agentId: other!.id }).where(eq(t.reviews.id, seededReviewId));

        await seed(pg.handle.db);

        const [review] = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.id, seededReviewId));
        expect(review!.agentId).toBe(other!.id);
      } finally {
        await pg.handle.db.update(t.reviews).set({ agentId: securityAgentId }).where(eq(t.reviews.id, seededReviewId));
      }
    });
  });

  // =========================================================================
  describe('history limit and read latency (AC-59, NFR-5)', () => {
    let app: App;
    let histAgentId: string;
    let newestRanAt: number;
    let seededBatchId: string;
    let histBatchId: string;

    beforeAll(async () => {
      app = await appWith();
      histAgentId = (await createAgent(app)).id;
      const base = Date.now() - 60 * 60 * 1000;
      const rows = Array.from({ length: 55 }, (_, i) => ({
        workspaceId,
        agentId: histAgentId,
        agentVersion: 1,
        systemPrompt: 'p',
        provider: 'openai',
        model: 'gpt-4.1',
        status: 'done' as const,
        casesTotal: 8,
        ranAt: new Date(base - i * 60_000), // i = 0 is the newest
        finishedAt: new Date(base - i * 60_000 + 1000),
      }));
      const inserted = await pg.handle.db.insert(t.evalBatches).values(rows).returning();
      newestRanAt = base;
      const [seeded] = await pg.handle.db
        .select()
        .from(t.evalBatches)
        .where(and(eq(t.evalBatches.agentId, securityAgentId), eq(t.evalBatches.model, 'seed')))
        .limit(1);
      seededBatchId = seeded!.id;
      // NFR-5: every history batch carries 8 runs, like a real batch (the cases of the seeded batch).
      const seededRuns = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.batchId, seededBatchId));
      expect(seededRuns).toHaveLength(8);
      await pg.handle.db.insert(t.evalRuns).values(
        inserted.flatMap((b) =>
          seededRuns.map((r) => ({ caseId: r.caseId, batchId: b.id, ranAt: b.ranAt, pass: true, durationMs: 10 })),
        ),
      );
      histBatchId = inserted[0]!.id;
    });
    afterAll(async () => {
      await app?.close();
    });

    it('returns only the 50 newest batches of 55, newest first', async () => {
      const res = await app.inject({ method: 'GET', url: `/agents/${histAgentId}/eval-runs` });

      expect(res.statusCode).toBe(200);
      const listed = res.json() as Array<{ ran_at: string }>;
      expect(listed).toHaveLength(50);
      const times = listed.map((b) => Date.parse(b.ran_at));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(times[0]).toBe(newestRanAt);
      expect(times[49]).toBe(newestRanAt - 49 * 60_000);
    });

    it('caps the overview trend at 10 chronological done batches and recent_batches at 20', async () => {
      const overview = (await app.inject({ method: 'GET', url: '/eval/overview' })).json();

      const entry = overview.agents.find((a: { agent_id: string }) => a.agent_id === histAgentId);
      const times = entry.trend.map((b: { ran_at: string }) => Date.parse(b.ran_at));
      expect(times).toHaveLength(10);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(times[9]).toBe(newestRanAt); // the 10 newest, oldest first
      expect(times[0]).toBe(newestRanAt - 9 * 60_000);
      expect(overview.recent_batches).toHaveLength(20);
    });

    it('answers the three read routes with a p95 under 200 ms over 20 calls each', async () => {
      const seededDetail = (await app.inject({ method: 'GET', url: `/eval-runs/${seededBatchId}` })).json();
      expect(seededDetail.runs).toHaveLength(8);
      const histDetail = (await app.inject({ method: 'GET', url: `/eval-runs/${histBatchId}` })).json();
      expect(histDetail.runs).toHaveLength(8);

      const routes = {
        'GET /agents/:id/eval-runs': `/agents/${histAgentId}/eval-runs`,
        'GET /eval-runs/:id': `/eval-runs/${histBatchId}`,
        'GET /eval/overview': '/eval/overview',
      };
      const p95: Record<string, number> = {};
      for (const [name, url] of Object.entries(routes)) {
        const samples: number[] = [];
        for (let i = 0; i < 20; i++) {
          const t0 = performance.now();
          const res = await app.inject({ method: 'GET', url });
          samples.push(performance.now() - t0);
          expect(res.statusCode).toBe(200);
        }
        samples.sort((a, b) => a - b);
        p95[name] = samples[18]!;
      }
      console.info(`NFR-5 p95 (ms): ${JSON.stringify(p95)}`);
      for (const [name, ms] of Object.entries(p95)) {
        expect(ms, `${name} p95`).toBeLessThan(200);
      }
    });
  });

  // =========================================================================
  describe('run snapshot after a case edit', () => {
    it('keeps the expectations a run was scored against when the case is edited afterwards', async () => {
      const mock = new MockLLMProvider('openai', { structured: FIXTURE });
      const app = await appWith({ mock });
      const { agent, c1 } = await agentWithDesignedCases(app);
      const post = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();
      await waitForEvalBatch(pg.handle.db, post.id);
      const originalExpectations = [
        { kind: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 12 },
        { kind: 'must_not_flag', file: 'src/api/users.ts', start_line: 45, end_line: 52 },
      ];

      const edit = await app.inject({
        method: 'PUT',
        url: `/eval-cases/${c1.id}`,
        payload: manualCase({
          name: 'Two-file diff',
          input_diff: `diff --git a/src/config.ts b/src/config.ts\n${CONFIG_DIFF}\ndiff --git a/src/api/users.ts b/src/api/users.ts\n${USERS_DIFF}`,
          expected_output: {
            expectations: [{ kind: 'must_find', file: 'src/api/users.ts', start_line: 47, end_line: 47 }],
          },
        }),
      });
      expect(edit.statusCode).toBe(200);

      const detail = EvalBatchDetail.parse((await app.inject({ method: 'GET', url: `/eval-runs/${post.id}` })).json());
      const run = detail.runs.find((r) => r.case_id === c1.id)!;
      expect(run.expected_output.expectations).toEqual(originalExpectations);
      const matched = run.actual_output!.matched_expectations;
      expect(matched.length).toBeGreaterThan(0);
      expect(matched.every((i) => i >= 0 && i < run.expected_output.expectations.length)).toBe(true);
      await app.close();
    });
  });

  // =========================================================================
  describe('concurrent batch start', () => {
    it('lets exactly one of two simultaneous starts through and answers the other 409 batch_running', async () => {
      const gated = new GatedLLM('openai', { structured: FIXTURE });
      const app = await appWith({ mock: gated });
      const { agent } = await agentWithDesignedCases(app);

      const [a, b] = await Promise.all([
        app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` }),
        app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` }),
      ]);

      expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
      const loser = a.statusCode === 409 ? a : b;
      const winner = a.statusCode === 202 ? a : b;
      expect(loser.json().error.code).toBe('batch_running');
      const batches = await pg.handle.db.select().from(t.evalBatches).where(eq(t.evalBatches.agentId, agent.id));
      expect(batches).toHaveLength(1);

      gated.release();
      await waitForEvalBatch(pg.handle.db, winner.json().id);
      await app.close();
    });
  });
});
