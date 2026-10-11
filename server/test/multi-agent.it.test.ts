/**
 * SPEC-06 Multi-agent review - server integration (real Postgres).
 *
 * Pins the AC-125 seed (idempotent, one finished 2-agent parent on PR #484 with
 * exactly one conflict group), the three read routes, the `agentIds` trigger,
 * the concurrent executor (4 slots, queued the rest), Learn, and read-time
 * latency. Every reachable provider (openai, anthropic, openrouter, github,
 * git) is overridden. ONE app per file: `buildApp` reaps queued/running runs at
 * boot, so a second app would kill the runs of the first.
 *
 * Order matters for the first five tests (they assume only the seed exists);
 * everything after them creates its own PRs, agents and parents.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import type { LLMProvider, StructuredRequest, StructuredResult, Review, Intent, UnifiedDiff } from '@devdigest/shared';
import * as t from '../src/db/schema.js';
import { MultiAgentRun, MultiAgentRunSummary, RunEstimate } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF_PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
const INTENT: Intent = { intent: 'Add rate limiting.', in_scope: ['middleware'], out_of_scope: [] };

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

interface Plan {
  gate?: Deferred;
  fail?: boolean;
  severity?: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  title?: string;
}

/**
 * Review provider for the `openai` slot. The agent a call belongs to is read
 * from a `TAG[name]` marker in its system prompt; a plan per tag can hold the
 * call on a gate (deferred completion) or make it throw. Counts calls and the
 * peak number of calls in flight.
 */
class GatedLLM implements LLMProvider {
  readonly id = 'openai' as const;
  plans = new Map<string, Plan>();
  reviewCalls: string[] = [];
  otherCalls: string[] = [];
  inflight = 0;
  peak = 0;

  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('GatedLLM.complete is not expected');
  }
  async embed(texts: string[]) {
    return texts.map(() => new Array(1536).fill(0));
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (req.schemaName !== 'Review') {
      this.otherCalls.push(req.schemaName);
      throw new Error(`GatedLLM: unexpected schema ${req.schemaName}`);
    }
    const text = req.messages.map((m) => m.content).join('\n');
    const tag = /TAG\[([^\]]+)\]/.exec(text)?.[1] ?? 'untagged';
    this.reviewCalls.push(tag);
    const plan = this.plans.get(tag) ?? {};
    this.inflight += 1;
    this.peak = Math.max(this.peak, this.inflight);
    try {
      if (plan.gate) await plan.gate.promise;
      if (plan.fail) throw new Error(`provider exploded for ${tag}`);
    } finally {
      this.inflight -= 1;
    }
    const review: Review = {
      verdict: 'comment',
      summary: `review by ${tag}`,
      score: 70,
      findings: [
        {
          id: `f-${tag}`,
          severity: plan.severity ?? 'WARNING',
          category: 'security',
          title: plan.title ?? 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'A live key is committed.',
          suggestion: null,
          confidence: 0.9,
          kind: 'finding',
        },
      ],
    };
    const data = (req.schema as { parse(v: unknown): T }).parse(review);
    return { data, model: req.model, tokensIn: 100, tokensOut: 50, costUsd: 0.002, raw: JSON.stringify(review), attempts: 1 };
  }
  reset() {
    this.plans.clear();
    this.reviewCalls = [];
    this.otherCalls = [];
    this.peak = 0;
  }
}

/** Git double that counts diff loads and fails them for repos named `nodiff-*`. */
class CountingGit extends MockGitClient {
  diffCalls = 0;
  async diff(repo?: { owner: string; name: string }): Promise<UnifiedDiff> {
    this.diffCalls += 1;
    if (repo?.name.startsWith('nodiff-')) throw new Error('no clone on disk');
    return super.diff();
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

d('multi-agent (integration)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let workspaceId: string;
  let seedAgentIds: string[];
  const gated = new GatedLLM();
  const intentLlm = new MockLLMProvider('openai', { structuredBySchema: { pr_intent: INTENT } });
  const idle = new MockLLMProvider('anthropic');
  const git = new CountingGit();

  const db = () => pg.handle.db;
  const intentCalls = () => intentLlm.calls.filter((c) => c.method === 'completeStructured').length;
  const llmCallTotal = () => intentLlm.calls.length + idle.calls.length + gated.reviewCalls.length + gated.otherCalls.length;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    await seed(pg.handle.db); // idempotent: the second run adds nothing
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    seedAgentIds = (await pg.handle.db.select().from(t.agents)).map((a) => a.id);
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        git,
        llm: { openai: gated, anthropic: idle, openrouter: intentLlm },
      },
    });
  });
  afterAll(async () => {
    for (const plan of gated.plans.values()) plan.gate?.resolve();
    await app?.close();
    await pg?.stop();
  });

  // ---- helpers -------------------------------------------------------------

  let seq = 0;
  async function mkPr(prefix = 'ma') {
    const name = `${prefix}-${seq++}-${Date.now()}`;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 900 + seq, title: `PR ${name}`, author: 'a', branch: 'b',
        base: 'main', headSha: 'a1b2c3d4', additions: 1, deletions: 0, filesCount: 1,
        status: 'needs_review', body: 'No refs here.',
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }
  async function mkPrWithPatch(prefix?: string) {
    const r = await mkPr(prefix);
    await db().insert(t.prFiles).values({ prId: r.pr.id, path: 'src/config.ts', additions: 1, deletions: 0, patch: DIFF_PATCH });
    return r;
  }
  async function mkAgent(tag: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `Agent ${tag}`, provider: 'openai', model: 'gpt-4.1', system_prompt: `You review code. TAG[${tag}]` },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }
  async function trigger(prId: string, payload: unknown) {
    return app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: payload as object });
  }
  async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 10_000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = await read();
      if (ok(v) || Date.now() > end) return v;
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  const runsOfPr = (prId: string) => db().select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
  const statusByAgent = async (prId: string) =>
    new Map((await runsOfPr(prId)).map((r) => [r.agentId!, r.status] as const));
  const countRows = async (prId: string) => ({
    parents: (await db().select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, prId))).length,
    runs: (await runsOfPr(prId)).length,
  });
  async function getRun(id: string) {
    const res = await app.inject({ method: 'GET', url: `/multi-agent-runs/${id}` });
    expect(res.statusCode).toBe(200);
    return MultiAgentRun.parse(res.json());
  }

  /** Insert a parent + children (+ optional findings) straight into the DB. */
  interface ChildSpec {
    agentId: string | null;
    status: string;
    durationMs?: number | null;
    costUsd?: number | null;
    score?: number | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    model?: string;
    ranAt?: Date;
    findings?: { file: string; startLine: number; endLine?: number; severity: string; title: string }[];
  }
  async function insertParent(
    wsId: string,
    prId: string,
    agentIds: string[],
    children: ChildSpec[],
    ranAt = new Date(),
  ) {
    const [parent] = await db().insert(t.multiAgentRuns).values({ workspaceId: wsId, prId, agentIds, ranAt }).returning();
    const runIds: string[] = [];
    for (const c of children) {
      const [run] = await db()
        .insert(t.agentRuns)
        .values({
          workspaceId: wsId, agentId: c.agentId, prId, ranAt: c.ranAt ?? ranAt, provider: 'openai',
          model: c.model ?? 'gpt-4.1', durationMs: c.durationMs ?? null, costUsd: c.costUsd ?? null,
          status: c.status, score: c.score ?? null, multiAgentRunId: parent!.id,
          startedAt: c.startedAt ?? null, finishedAt: c.finishedAt ?? null,
        })
        .returning();
      runIds.push(run!.id);
      if (c.findings) {
        const [review] = await db()
          .insert(t.reviews)
          .values({ workspaceId: wsId, prId, agentId: c.agentId, runId: run!.id, kind: 'review', verdict: 'comment', summary: 's', score: c.score ?? 50, model: 'm' })
          .returning();
        await db().insert(t.findings).values(
          c.findings.map((f) => ({
            reviewId: review!.id, file: f.file, startLine: f.startLine, endLine: f.endLine ?? f.startLine,
            severity: f.severity, category: 'bug', title: f.title, rationale: 'r', confidence: 0.8,
          })),
        );
      }
    }
    return { parentId: parent!.id, runIds };
  }

  // ---- seed + reads on the seeded parent (assume nothing else exists yet) ---

  it('the seed leaves exactly one parent run, on PR #484', async () => {
    const parents = await pg.handle.db.select().from(t.multiAgentRuns);
    expect(parents).toHaveLength(1);
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.id, parents[0]!.prId));
    expect(pr!.number).toBe(484);
  });

  it('GET /multi-agent-runs lists the seeded parent as done', async () => {
    const res = await app.inject({ method: 'GET', url: '/multi-agent-runs' });
    expect(res.statusCode).toBe(200);
    const list = MultiAgentRunSummary.array().parse(res.json());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'done', agent_count: 2, pr_number: 484 });
    expect(list[0]!.total_cost_usd).toBeCloseTo(0.03);
  });

  it('GET /multi-agent-runs/:id returns 2 done columns and 2 groups with 1 conflict', async () => {
    const [summary] = (await app.inject({ method: 'GET', url: '/multi-agent-runs' })).json();
    const res = await app.inject({ method: 'GET', url: `/multi-agent-runs/${summary.id}` });
    expect(res.statusCode).toBe(200);
    const run = MultiAgentRun.parse(res.json());
    expect(run.columns.map((c) => c.status)).toEqual(['done', 'done']);
    expect(run.columns.map((c) => c.agent_name)).toEqual(['API Contract Reviewer', 'Security Reviewer']);
    expect(run.groups).toHaveLength(2);
    expect(run.groups.filter((g) => g.conflict)).toHaveLength(1);
  });

  it('answers 404 for an unknown or non-uuid id', async () => {
    const missing = await app.inject({
      method: 'GET',
      url: '/multi-agent-runs/00000000-0000-4000-8000-000000000000',
    });
    expect(missing.statusCode).toBe(404);
    const junk = await app.inject({ method: 'GET', url: '/multi-agent-runs/not-a-uuid' });
    expect(junk.statusCode).toBe(404);
  });

  it('GET /multi-agent-runs/estimates returns one estimate per agent', async () => {
    const res = await app.inject({ method: 'GET', url: '/multi-agent-runs/estimates' });
    expect(res.statusCode).toBe(200);
    const estimates = RunEstimate.array().parse(res.json());
    const agents = await pg.handle.db.select().from(t.agents);
    expect(estimates).toHaveLength(agents.length);
    // Seed child runs use model 'seed', never an agent's current model.
    expect(estimates.every((e) => e.runs === 0 && e.median_duration_ms === null)).toBe(true);
  });

  it('seeding a third time after parents exist still leaves the seeded PR with one parent (AC-125)', async () => {
    await seed(db());
    const parents = await db().select().from(t.multiAgentRuns);
    expect(parents).toHaveLength(1);
  });

  // ---- trigger -------------------------------------------------------------

  describe('POST /pulls/:id/review with agentIds - trigger', () => {
    it('creates one run per distinct id plus one parent holding the ids in request order (AC-13, AC-14, AC-15, AC-3)', async () => {
      gated.reset();
      const { pr } = await mkPrWithPatch();
      const [a, b] = [await mkAgent('dup-a'), await mkAgent('dup-b')];
      const res = await trigger(pr.id, { agentIds: [b, a, b] });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.runs.map((r: { agent_id: string }) => r.agent_id)).toEqual([b, a]);
      expect(body.multi_agent_run_id).toEqual(expect.any(String));

      const [parent] = await db().select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, pr.id));
      expect(parent!.id).toBe(body.multi_agent_run_id);
      expect(parent!.agentIds).toEqual([b, a]);
      const runs = await waitForPrRuns(db(), pr.id, { expected: 2 });
      expect(runs).toHaveLength(2);
      expect(runs.every((r) => r.multiAgentRunId === parent!.id)).toBe(true);
    });

    it('answers 404 and creates nothing for an unknown or non-uuid id, even next to a valid one (AC-16)', async () => {
      const { pr } = await mkPrWithPatch();
      const ok = await mkAgent('known');
      for (const bad of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
        const res = await trigger(pr.id, { agentIds: [ok, bad] });
        expect(res.statusCode).toBe(404);
      }
      expect(await countRows(pr.id)).toEqual({ parents: 0, runs: 0 });
    });

    it('answers 400 invalid_run_request for [] and for 7 ids and creates nothing (AC-17, NFR-1)', async () => {
      const { pr } = await mkPrWithPatch();
      const ids = await Promise.all(Array.from({ length: 7 }, (_, i) => mkAgent(`cap-${i}`)));
      for (const agentIds of [[], ids]) {
        const res = await trigger(pr.id, { agentIds });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('invalid_run_request');
      }
      expect(await countRows(pr.id)).toEqual({ parents: 0, runs: 0 });
    });

    it('accepts 6 ids (AC-17 boundary)', async () => {
      gated.reset();
      const { pr } = await mkPrWithPatch();
      const ids = await Promise.all(Array.from({ length: 6 }, (_, i) => mkAgent(`six-${i}`)));
      const res = await trigger(pr.id, { agentIds: ids });
      expect(res.statusCode).toBe(200);
      expect(res.json().runs).toHaveLength(6);
      await waitForPrRuns(db(), pr.id, { expected: 6 });
    });

    it('rejects agentIds mixed with agentId or all with 400 invalid_run_request and creates nothing (OQ-1)', async () => {
      const { pr } = await mkPrWithPatch();
      const a = await mkAgent('mix');
      for (const extra of [{ agentId: a }, { all: true }]) {
        const res = await trigger(pr.id, { agentIds: [a], ...extra });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('invalid_run_request');
      }
      expect(await countRows(pr.id)).toEqual({ parents: 0, runs: 0 });
    });

    it('creates no parent and returns multi_agent_run_id null for agentId and for all (AC-3, AC-18)', async () => {
      gated.reset();
      const single = await mkPrWithPatch();
      const a = await mkAgent('solo');
      const one = await trigger(single.pr.id, { agentId: a });
      expect(one.statusCode).toBe(200);
      expect(one.json().multi_agent_run_id).toBeNull();
      await waitForPrRuns(db(), single.pr.id, { expected: 1 });
      expect((await countRows(single.pr.id)).parents).toBe(0);
      const [run] = await runsOfPr(single.pr.id);
      expect(run!.multiAgentRunId).toBeNull();

      const everyone = await mkPrWithPatch();
      const all = await trigger(everyone.pr.id, { all: true });
      expect(all.statusCode).toBe(200);
      expect(all.json().multi_agent_run_id).toBeNull();
      await waitForPrRuns(db(), everyone.pr.id, { expected: all.json().runs.length });
      expect((await countRows(everyone.pr.id)).parents).toBe(0);
      expect((await runsOfPr(everyone.pr.id)).every((r) => r.multiAgentRunId === null)).toBe(true);
    });
  });

  // ---- executor ------------------------------------------------------------

  describe('concurrent executor', () => {
    it('keeps 4 of 6 agents running and queues 2; a freed slot goes to the 5th in request order (AC-20, AC-22, NFR-1)', async () => {
      gated.reset();
      const { pr } = await mkPrWithPatch();
      const tags = ['s1', 's2', 's3', 's4', 's5', 's6'];
      const ids = await Promise.all(tags.map(mkAgent));
      tags.forEach((tag) => gated.plans.set(tag, { gate: deferred() }));
      const res = await trigger(pr.id, { agentIds: ids });
      expect(res.statusCode).toBe(200);

      const count = async (status: string) => [...(await statusByAgent(pr.id)).values()].filter((s) => s === status).length;
      await until(() => count('running'), (n) => n >= 4);
      await new Promise((r) => setTimeout(r, 150)); // give a wrongly-started 5th a chance to show
      const first = await statusByAgent(pr.id);
      expect(ids.slice(0, 4).map((id) => first.get(id))).toEqual(['running', 'running', 'running', 'running']);
      expect(ids.slice(4).map((id) => first.get(id))).toEqual(['queued', 'queued']);

      gated.plans.get('s2')!.gate!.resolve();
      const second = await until(() => statusByAgent(pr.id), (m) => m.get(ids[4]!) === 'running');
      expect(second.get(ids[1]!)).not.toBe('running');
      expect(second.get(ids[4]!)).toBe('running');
      expect(second.get(ids[5]!)).toBe('queued');

      tags.forEach((tag) => gated.plans.get(tag)!.gate!.resolve());
      const runs = await waitForPrRuns(db(), pr.id, { expected: 6 });
      expect(runs.every((r) => r.status === 'done')).toBe(true);
      expect(gated.peak).toBeLessThanOrEqual(4);
    });

    it('moves all 3 agents of a small launch to running before any settles (AC-21)', async () => {
      gated.reset();
      const { pr } = await mkPrWithPatch();
      const tags = ['t1', 't2', 't3'];
      const ids = await Promise.all(tags.map(mkAgent));
      tags.forEach((tag) => gated.plans.set(tag, { gate: deferred() }));
      await trigger(pr.id, { agentIds: ids });
      const m = await until(() => statusByAgent(pr.id), (x) => [...x.values()].every((s) => s === 'running'));
      expect([...m.values()]).toEqual(['running', 'running', 'running']);
      tags.forEach((tag) => gated.plans.get(tag)!.gate!.resolve());
      await waitForPrRuns(db(), pr.id, { expected: 3 });
    });

    it('finishes the other agents when one provider throws, and the parent reads partial (AC-23, AC-37)', async () => {
      gated.reset();
      const { pr } = await mkPrWithPatch();
      const ids = await Promise.all(['ok1', 'boom', 'ok2'].map(mkAgent));
      gated.plans.set('boom', { fail: true });
      const res = await trigger(pr.id, { agentIds: ids });
      const runs = await waitForPrRuns(db(), pr.id, { expected: 3 });
      const by = new Map(runs.map((r) => [r.agentId, r.status]));
      expect([ids[0], ids[1], ids[2]].map((id) => by.get(id!))).toEqual(['done', 'failed', 'done']);

      const run = await getRun(res.json().multi_agent_run_id);
      expect(run.status).toBe('partial');
      expect(run.columns.map((c) => c.status)).toEqual(['done', 'failed', 'done']);
      expect(run.columns[1]).toMatchObject({ score: null });
      expect(run.columns[1]!.error).toContain('provider exploded');
      // Failed column: no result at any location.
      expect(run.groups.length).toBeGreaterThan(0);
      expect(run.groups.every((g) => g.takes[1]!.verdict === 'no_result')).toBe(true);
    });

    it('fails every run with the load error when the diff cannot be loaded, and the parent reads failed (AC-24, AC-36)', async () => {
      gated.reset();
      const { pr } = await mkPr('nodiff'); // no pr_files patches, git diff throws
      const ids = await Promise.all(['nd1', 'nd2'].map(mkAgent));
      const res = await trigger(pr.id, { agentIds: ids });
      const runs = await waitForPrRuns(db(), pr.id, { expected: 2 });
      expect(runs.map((r) => r.status)).toEqual(['failed', 'failed']);
      expect(runs.every((r) => r.error?.includes('Failed to load PR diff') || r.error?.includes('diff'))).toBe(true);
      expect(gated.reviewCalls).toEqual([]);
      const run = await getRun(res.json().multi_agent_run_id);
      expect(run.status).toBe('failed');
      expect(run.columns.every((c) => c.status === 'failed' && c.error !== null)).toBe(true);
    });

    it('loads the diff once and classifies intent once per launch (AC-19, NFR-2)', async () => {
      gated.reset();
      const { pr } = await mkPrWithPatch();
      const ids = await Promise.all(['i1', 'i2', 'i3'].map(mkAgent));
      const diffsBefore = git.diffCalls;
      const intentBefore = intentCalls();
      await trigger(pr.id, { agentIds: ids });
      await waitForPrRuns(db(), pr.id, { expected: 3 });
      expect(git.diffCalls - diffsBefore).toBe(1);
      expect(intentCalls() - intentBefore).toBe(1);
      expect(gated.reviewCalls.sort()).toEqual(['i1', 'i2', 'i3']);
    });
  });

  // ---- finished launch: results page + Learn --------------------------------

  describe('a finished launch', () => {
    let pr: Awaited<ReturnType<typeof mkPr>>['pr'];
    let ids: string[];
    let parentId: string;

    beforeAll(async () => {
      gated.reset();
      ({ pr } = await mkPrWithPatch());
      ids = await Promise.all(['fin-a', 'fin-b'].map(mkAgent));
      gated.plans.set('fin-a', { severity: 'CRITICAL', title: 'Hardcoded Stripe secret key' });
      gated.plans.set('fin-b', { severity: 'WARNING', title: 'Hardcoded Stripe secret key exposed' });
      const res = await trigger(pr.id, { agentIds: ids });
      parentId = res.json().multi_agent_run_id;
      await waitForPrRuns(db(), pr.id, { expected: 2 });
      // trace/status can lag the review row; wait for both reviews.
      await until(
        () => db().select().from(t.reviews).where(eq(t.reviews.prId, pr.id)),
        (rows) => rows.length >= 2,
      );
    });

    it('groups the two agents findings into one conflict group with one take each (AC-44-AC-54)', async () => {
      const run = await getRun(parentId);
      expect(run.status).toBe('done');
      expect(run.columns.map((c) => c.agent_id)).toEqual(ids);
      expect(run.groups).toHaveLength(1);
      const [g] = run.groups;
      expect(g!.members).toHaveLength(2);
      expect(g!.takes.map((x) => x.verdict)).toEqual(['CRITICAL', 'WARNING']);
      expect(g!.conflict).toBe(true);
      expect(g!.title).toBe('Hardcoded Stripe secret key');
      expect(run.total_cost_usd).toBeCloseTo(0.004);
      expect(run.cost_partial).toBe(false);
    });

    it('Learn sets learned_at, keeps accept/dismiss, and makes no model call or memory/eval row (AC-26, AC-28, AC-29)', async () => {
      const run = await getRun(parentId);
      const findingId = run.columns[0]!.findings[0]!.id;
      const other = run.columns[1]!.findings[0]!.id;
      expect((await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })).statusCode).toBe(200);
      const [before] = await db().select().from(t.findings).where(eq(t.findings.id, findingId));

      const memoryBefore = (await db().select().from(t.memory)).length;
      const evalBefore = (await db().select().from(t.evalCases)).length;
      const llmBefore = llmCallTotal();

      const res = await app.inject({ method: 'POST', url: `/findings/${findingId}/learn` });
      expect(res.statusCode).toBe(200);
      expect(res.json().finding.learned_at).toEqual(expect.any(String));
      const [after] = await db().select().from(t.findings).where(eq(t.findings.id, findingId));
      expect(after!.learnedAt).not.toBeNull();
      expect(after!.acceptedAt?.getTime()).toBe(before!.acceptedAt!.getTime());
      expect(after!.dismissedAt).toBeNull();

      // the sibling finding is untouched
      const [sibling] = await db().select().from(t.findings).where(eq(t.findings.id, other));
      expect(sibling!.learnedAt).toBeNull();

      expect(llmCallTotal()).toBe(llmBefore);
      expect((await db().select().from(t.memory)).length).toBe(memoryBefore);
      expect((await db().select().from(t.evalCases)).length).toBe(evalBefore);

      // reflected in the results payload
      const again = await getRun(parentId);
      expect(again.columns[0]!.findings[0]!.learned_at).toEqual(expect.any(String));
    });

    it('Learn on a dismissed finding keeps dismissed_at (AC-28)', async () => {
      const run = await getRun(parentId);
      const findingId = run.columns[1]!.findings[0]!.id;
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` });
      const [before] = await db().select().from(t.findings).where(eq(t.findings.id, findingId));
      await app.inject({ method: 'POST', url: `/findings/${findingId}/learn` });
      const [after] = await db().select().from(t.findings).where(eq(t.findings.id, findingId));
      expect(after!.dismissedAt?.getTime()).toBe(before!.dismissedAt!.getTime());
      expect(after!.acceptedAt).toBeNull();
      expect(after!.learnedAt).not.toBeNull();
    });

    it('answers 404 and changes nothing for a finding of another workspace (AC-27)', async () => {
      const [other] = await db().insert(t.workspaces).values({ name: `foreign-${Date.now()}` }).returning();
      const [repo] = await db().insert(t.repos).values({ workspaceId: other!.id, owner: 'x', name: 'y', fullName: 'x/y' }).returning();
      const [fpr] = await db()
        .insert(t.pullRequests)
        .values({ workspaceId: other!.id, repoId: repo!.id, number: 1, title: 't', author: 'a', branch: 'b', base: 'main', headSha: 'h' })
        .returning();
      const [rev] = await db().insert(t.reviews).values({ workspaceId: other!.id, prId: fpr!.id, kind: 'review' }).returning();
      const [f] = await db()
        .insert(t.findings)
        .values({ reviewId: rev!.id, file: 'a.ts', startLine: 1, endLine: 1, severity: 'WARNING', category: 'bug', title: 't', rationale: 'r', confidence: 0.5 })
        .returning();
      const res = await app.inject({ method: 'POST', url: `/findings/${f!.id}/learn` });
      expect(res.statusCode).toBe(404);
      const [after] = await db().select().from(t.findings).where(eq(t.findings.id, f!.id));
      expect(after!.learnedAt).toBeNull();
    });

    it('registers no reply route: POST /findings/:id/reply is a 404 (AC-30)', async () => {
      const run = await getRun(parentId);
      const res = await app.inject({ method: 'POST', url: `/findings/${run.columns[0]!.findings[0]!.id}/reply` });
      expect(res.statusCode).toBe(404);
    });

    it('builds groups at read time: a finding inserted later changes the group set, and no group table exists (AC-50)', async () => {
      const before = await getRun(parentId);
      const [review] = await db().select().from(t.reviews).where(eq(t.reviews.runId, before.columns[0]!.run_id));
      await db().insert(t.findings).values({
        reviewId: review!.id, file: 'src/other.ts', startLine: 3, endLine: 3, severity: 'SUGGESTION',
        category: 'bug', title: 'Unrelated nit', rationale: 'r', confidence: 0.4,
      });
      const after = await getRun(parentId);
      expect(after.groups).toHaveLength(before.groups.length + 1);
      const added = after.groups.find((g) => g.file === 'src/other.ts');
      expect(added!.takes.map((x) => x.verdict)).toEqual(['SUGGESTION', 'ignored']);
      expect(added!.conflict).toBe(true);

      const tables = await db().execute(
        sql`select table_name from information_schema.tables where table_schema = 'public' and table_name like '%group%'`,
      );
      expect(tables.length ?? (tables as { rows: unknown[] }).rows.length).toBe(0);
    });

    it('makes no model call while serving the three read routes (AC-57)', async () => {
      const before = llmCallTotal();
      await app.inject({ method: 'GET', url: '/multi-agent-runs' });
      await app.inject({ method: 'GET', url: `/multi-agent-runs/${parentId}` });
      await app.inject({ method: 'GET', url: '/multi-agent-runs/estimates' });
      expect(llmCallTotal()).toBe(before);
    });
  });

  // ---- reads on inserted rows ---------------------------------------------

  describe('read routes on real rows', () => {
    const at = (s: number) => new Date(Date.UTC(2027, 0, 1, 0, 0, s));

    it('lists the newest parents first with the summary fields (AC-31)', async () => {
      const { pr } = await mkPr('list');
      const a = await mkAgent('list-a');
      const older = await insertParent(workspaceId, pr.id, [a], [{ agentId: a, status: 'done' }], at(10));
      const newer = await insertParent(workspaceId, pr.id, [a, a], [{ agentId: a, status: 'done' }, { agentId: a, status: 'done' }], at(20));
      const list = MultiAgentRunSummary.array().parse((await app.inject({ method: 'GET', url: '/multi-agent-runs' })).json());
      const mine = list.filter((r) => r.pr_id === pr.id);
      expect(mine.map((r) => r.id)).toEqual([newer.parentId, older.parentId]);
      expect(mine[0]).toMatchObject({ pr_number: pr.number, pr_title: pr.title, agent_count: 2, status: 'done' });
      expect(list.findIndex((r) => r.id === newer.parentId)).toBeLessThan(list.findIndex((r) => r.id === older.parentId));
    });

    it('orders detail columns by selection, not insertion (AC-32)', async () => {
      const { pr } = await mkPr('order');
      const [a, b, c] = [await mkAgent('o-a'), await mkAgent('o-b'), await mkAgent('o-c')];
      const { parentId } = await insertParent(workspaceId, pr.id, [c, a, b], [
        { agentId: a, status: 'done', ranAt: at(1) },
        { agentId: b, status: 'done', ranAt: at(2) },
        { agentId: c, status: 'done', ranAt: at(3) },
      ]);
      const run = await getRun(parentId);
      expect(run.columns.map((x) => x.agent_id)).toEqual([c, a, b]);
    });

    it('answers 404 for a parent of another workspace (AC-33)', async () => {
      const [other] = await db().insert(t.workspaces).values({ name: `foreign-par-${Date.now()}` }).returning();
      const [repo] = await db().insert(t.repos).values({ workspaceId: other!.id, owner: 'x', name: 'z', fullName: 'x/z' }).returning();
      const [fpr] = await db()
        .insert(t.pullRequests)
        .values({ workspaceId: other!.id, repoId: repo!.id, number: 2, title: 't', author: 'a', branch: 'b', base: 'main', headSha: 'h' })
        .returning();
      const { parentId } = await insertParent(other!.id, fpr!.id, [], [], at(5));
      expect((await app.inject({ method: 'GET', url: `/multi-agent-runs/${parentId}` })).statusCode).toBe(404);
      const list = (await app.inject({ method: 'GET', url: '/multi-agent-runs' })).json() as { id: string }[];
      expect(list.some((r) => r.id === parentId)).toBe(false);
    });

    it('derives status, totals, partial cost and a null score for non-done children (AC-34-AC-41)', async () => {
      const { pr } = await mkPr('derive');
      const [a, b] = [await mkAgent('d-a'), await mkAgent('d-b')];
      const cases: { name: string; kids: ChildSpec[]; status: string }[] = [
        { name: 'running', status: 'running', kids: [{ agentId: a, status: 'done' }, { agentId: b, status: 'queued' }] },
        { name: 'done', status: 'done', kids: [{ agentId: a, status: 'done' }, { agentId: b, status: 'done' }] },
        { name: 'failed', status: 'failed', kids: [{ agentId: a, status: 'failed' }, { agentId: b, status: 'cancelled' }] },
        { name: 'partial', status: 'partial', kids: [{ agentId: a, status: 'done' }, { agentId: b, status: 'failed' }] },
      ];
      for (const c of cases) {
        const { parentId } = await insertParent(workspaceId, pr.id, [a, b], c.kids.map((k) => ({ ...k, score: 90 })));
        const run = await getRun(parentId);
        expect(run.status, c.name).toBe(c.status);
        run.columns.forEach((col) => {
          expect(col.score, `${c.name}:${col.status}`).toBe(col.status === 'done' ? 90 : null);
        });
      }

      const totals = await insertParent(workspaceId, pr.id, [a, b], [
        { agentId: a, status: 'done', costUsd: 0.012, startedAt: at(1), finishedAt: at(9) },
        { agentId: b, status: 'done', costUsd: 0.018, startedAt: at(3), finishedAt: at(14) },
      ]);
      const sum = await getRun(totals.parentId);
      expect(sum.total_cost_usd).toBeCloseTo(0.03);
      expect(sum.cost_partial).toBe(false);
      expect(sum.total_duration_ms).toBe(13_000);

      const partial = await insertParent(workspaceId, pr.id, [a, b], [
        { agentId: a, status: 'done', costUsd: 0.5, startedAt: at(1), finishedAt: at(2) },
        { agentId: b, status: 'done', costUsd: null, startedAt: at(1), finishedAt: at(2) },
      ]);
      const part = await getRun(partial.parentId);
      expect(part.total_cost_usd).toBe(0.5);
      expect(part.cost_partial).toBe(true);
    });
  });

  // ---- estimates -------------------------------------------------------------

  describe('GET /multi-agent-runs/estimates', () => {
    it('uses the median of the latest 10 done runs on the current model and ignores older models and failures (AC-58, AC-59, AC-60)', async () => {
      const { pr } = await mkPr('est');
      const withHistory = await mkAgent('est-hist');
      const oldModelOnly = await mkAgent('est-old');
      const noRuns = await mkAgent('est-none');
      const base = Date.UTC(2026, 0, 1);

      // 12 done runs on the current model: duration i*1000, cost i*0.01, oldest first.
      for (let i = 1; i <= 12; i++) {
        await db().insert(t.agentRuns).values({
          workspaceId, agentId: withHistory, prId: pr.id, ranAt: new Date(base + i * 60_000), provider: 'openai',
          model: 'gpt-4.1', durationMs: i * 1000, costUsd: i * 0.01, status: 'done',
        });
      }
      // One newer outlier on another model and one newer failed run: both excluded.
      await db().insert(t.agentRuns).values([
        { workspaceId, agentId: withHistory, prId: pr.id, ranAt: new Date(base + 100 * 60_000), model: 'old-model', durationMs: 999_000, costUsd: 99, status: 'done' },
        { workspaceId, agentId: withHistory, prId: pr.id, ranAt: new Date(base + 101 * 60_000), model: 'gpt-4.1', durationMs: 888_000, costUsd: 88, status: 'failed' },
        { workspaceId, agentId: oldModelOnly, prId: pr.id, ranAt: new Date(base), model: 'old-model', durationMs: 5000, costUsd: 1, status: 'done' },
      ]);

      // an agent of another workspace must not show up
      const [other] = await db().insert(t.workspaces).values({ name: `foreign-est-${Date.now()}` }).returning();
      const [foreignAgent] = await db()
        .insert(t.agents)
        .values({ workspaceId: other!.id, name: 'F', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'p' })
        .returning();

      const estimates = RunEstimate.array().parse((await app.inject({ method: 'GET', url: '/multi-agent-runs/estimates' })).json());
      const agents = await db().select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
      expect(estimates.map((e) => e.agent_id).sort()).toEqual(agents.map((a) => a.id).sort());
      expect(estimates.some((e) => e.agent_id === foreignAgent!.id)).toBe(false);

      const by = new Map(estimates.map((e) => [e.agent_id, e]));
      // newest 10 of the 12 are i = 3..12 -> median duration (7000+8000)/2... = 7500, cost 0.075
      expect(by.get(withHistory)).toEqual({ agent_id: withHistory, median_duration_ms: 7500, median_cost_usd: expect.closeTo(0.075, 6), runs: 10 });
      expect(by.get(oldModelOnly)).toEqual({ agent_id: oldModelOnly, median_duration_ms: null, median_cost_usd: null, runs: 0 });
      expect(by.get(noRuns)).toEqual({ agent_id: noRuns, median_duration_ms: null, median_cost_usd: null, runs: 0 });
    });
  });

  // ---- latency (NFR-4, NFR-5, NFR-6) ------------------------------------------

  describe('read latency (p95 of 20 requests)', () => {
    async function p95(url: string): Promise<number> {
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        const res = await app.inject({ method: 'GET', url });
        times.push(performance.now() - start);
        expect(res.statusCode).toBe(200);
      }
      times.sort((a, b) => a - b);
      return times[Math.ceil(0.95 * times.length) - 1]!;
    }

    it('serves a parent with 6 children x 300 findings in under 300 ms (NFR-4)', async () => {
      const { pr } = await mkPr('perf');
      const agentIds = await Promise.all(Array.from({ length: 6 }, (_, i) => mkAgent(`perf-${i}`)));
      const kids: ChildSpec[] = agentIds.map((agentId, k) => ({
        agentId,
        status: 'done',
        findings: Array.from({ length: 300 }, (_, i) => ({
          file: `src/file-${i % 30}.ts`,
          startLine: 1 + Math.floor(i / 30) * 20,
          severity: ['CRITICAL', 'WARNING', 'SUGGESTION'][(i + k) % 3]!,
          title: `Finding ${i} about thing ${k}`,
        })),
      }));
      const { parentId } = await insertParent(workspaceId, pr.id, agentIds, kids);
      expect(await p95(`/multi-agent-runs/${parentId}`)).toBeLessThan(300);
    }, 60_000);

    it('lists with 200 parents in the workspace in under 300 ms (NFR-5)', async () => {
      const { pr } = await mkPr('perf-list');
      const a = await mkAgent('perf-list-agent');
      const parents = await db()
        .insert(t.multiAgentRuns)
        .values(Array.from({ length: 200 }, (_, i) => ({ workspaceId, prId: pr.id, agentIds: [a], ranAt: new Date(Date.UTC(2028, 0, 1, 0, 0, i)) })))
        .returning();
      await db().insert(t.agentRuns).values(
        parents.flatMap((p) => [0, 1].map(() => ({
          workspaceId, agentId: a, prId: pr.id, status: 'done', model: 'gpt-4.1', costUsd: 0.01,
          multiAgentRunId: p.id, startedAt: new Date(), finishedAt: new Date(),
        }))),
      );
      expect(await p95('/multi-agent-runs')).toBeLessThan(300);
    }, 60_000);

    it('serves estimates for 20+ agents in under 200 ms (NFR-6)', async () => {
      const { pr } = await mkPr('perf-est');
      const rows = await db()
        .insert(t.agents)
        .values(Array.from({ length: 20 }, (_, i) => ({ workspaceId, name: `Bulk ${i}-${Date.now()}`, provider: 'openai' as const, model: 'gpt-4.1', systemPrompt: 'p' })))
        .returning();
      await db().insert(t.agentRuns).values(
        rows.flatMap((r) => Array.from({ length: 12 }, (_, i) => ({
          workspaceId, agentId: r.id, prId: pr.id, status: 'done', model: 'gpt-4.1', durationMs: 1000 + i, costUsd: 0.01,
        }))),
      );
      expect(await p95('/multi-agent-runs/estimates')).toBeLessThan(200);
    }, 60_000);
  });
});
