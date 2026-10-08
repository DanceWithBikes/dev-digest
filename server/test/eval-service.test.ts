/**
 * EvalService + EvalBatchRunner over in-memory fakes of every port, no database
 * and no network. Covers AC-23..AC-34, AC-39/AC-40, AC-43..AC-58, NFR-4, NFR-11.
 */
import { describe, it, expect } from 'vitest';
import { EvalCaseRecord, type Finding, type LLMProvider } from '@devdigest/shared';
import { fileDiff } from '@devdigest/reviewer-core';
import { EvalService } from '../src/modules/eval/service.js';
import { EvalBatchRunner } from '../src/modules/eval/runner.js';
import type {
  AgentSource,
  BatchExecutor,
  EvalStore,
  FindingSource,
  ReviewEngine,
  ReviewEngineInput,
  ReviewEngineResult,
} from '../src/modules/eval/ports.js';
import type {
  AgentForEval,
  BatchCompletion,
  FindingContext,
  FrozenBatch,
  NewBatch,
  NewCase,
  NewRun,
  StoredBatch,
  StoredCase,
  StoredRun,
} from '../src/modules/eval/domain.js';
import { AppError, NotFoundError, ValidationError } from '../src/platform/errors.js';

const WS = 'ws-1';
const AGENT = 'agent-1';
const PATCH = '@@ -1,2 +1,3 @@\n a\n+b\n c';
const DIFF = fileDiff('src/a.ts', PATCH);

class FakeStore implements EvalStore {
  cases: StoredCase[] = [];
  batches: StoredBatch[] = [];
  runs: NewRun[] = [];
  private seq = 0;

  async findCaseBySourceFinding(ws: string, id: string) {
    return this.cases.find((c) => c.workspaceId === ws && c.sourceFindingId === id);
  }
  async insertCase(v: NewCase) {
    const c: StoredCase = { ...v, id: `case-${++this.seq}`, createdAt: new Date(), lastRun: null };
    this.cases.push(c);
    return { case: c, created: true };
  }
  async listCasesWithLastRun(ws: string, agentId: string) {
    return this.cases.filter((c) => c.workspaceId === ws && c.ownerId === agentId);
  }
  async getCase(ws: string, id: string) {
    return this.cases.find((c) => c.workspaceId === ws && c.id === id);
  }
  async getCasesByIds(ws: string, ids: string[]) {
    return ids
      .map((id) => this.cases.find((c) => c.workspaceId === ws && c.id === id))
      .filter((c): c is StoredCase => !!c);
  }
  async updateCase() {
    return undefined;
  }
  async deleteCase(ws: string, id: string) {
    const n = this.cases.length;
    this.cases = this.cases.filter((c) => !(c.workspaceId === ws && c.id === id));
    return this.cases.length < n;
  }
  async caseIdsForAgent(ws: string, agentId: string) {
    return (await this.listCasesWithLastRun(ws, agentId)).map((c) => c.id);
  }
  async findRunningBatch(_ws: string, agentId: string) {
    return this.batches.find((b) => b.agentId === agentId && b.status === 'running');
  }
  async insertBatch(v: NewBatch) {
    const b: StoredBatch = {
      id: `batch-${++this.seq}`,
      workspaceId: v.workspaceId,
      agentId: v.agentId,
      snapshot: v.snapshot,
      status: 'running',
      error: null,
      ranAt: new Date(),
      finishedAt: null,
      casesTotal: v.casesTotal,
      casesPassed: 0,
      mustFindTotal: 0,
      mustFindMatched: 0,
      keptTotal: 0,
      noiseTotal: 0,
      droppedTotal: 0,
      recall: null,
      precision: null,
      citationAccuracy: null,
      durationMs: null,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
    };
    this.batches.push(b);
    return b;
  }
  async insertRun(v: NewRun) {
    this.runs.push(v);
    return true;
  }
  async completeBatch(id: string, c: BatchCompletion) {
    const b = this.batches.find((x) => x.id === id)!;
    Object.assign(b, c, { finishedAt: new Date() });
  }
  async listBatches() {
    return this.batches;
  }
  async getBatchWithRuns(_ws: string, id: string) {
    const batch = this.batches.find((b) => b.id === id);
    return batch ? { batch, runs: [] as StoredRun[] } : undefined;
  }
  async overview() {
    return { agents: [], latestBatches: [], doneBatches: [], recent: [] };
  }
  async reapRunningBatches(error: string) {
    const running = this.batches.filter((b) => b.status === 'running');
    running.forEach((b) => Object.assign(b, { status: 'failed', error }));
    return running.length;
  }
}

const agent = (over: Partial<AgentForEval> = {}): AgentForEval => ({
  id: AGENT,
  name: 'Security',
  version: 1,
  systemPrompt: 'PROMPT-V1',
  provider: 'openrouter',
  model: 'model-1',
  strategy: 'single-pass',
  ...over,
});

class FakeAgents implements AgentSource {
  current: AgentForEval | undefined = agent();
  skills = [
    { skill: { name: 'sk', body: 'SKBODY', enabled: true } },
    { skill: { name: 'off', body: 'NO', enabled: false } },
  ];
  async getById(ws: string, id: string) {
    return ws === WS && id === this.current?.id ? this.current : undefined;
  }
  async linkedSkills() {
    return this.skills;
  }
}

const ctx = (over: { finding?: Partial<FindingContext['finding']>; agentId?: string | null; ws?: string } = {}): FindingContext => ({
  finding: {
    id: 'f1',
    file: 'src/a.ts',
    startLine: 2,
    endLine: 2,
    title: 'Hardcoded key',
    severity: 'critical',
    category: 'security',
    acceptedAt: new Date(),
    dismissedAt: null,
    ...over.finding,
  },
  review: { agentId: over.agentId === undefined ? AGENT : over.agentId },
  pull: { id: 'pr-1', workspaceId: over.ws ?? WS, title: 'PR-TITLE', body: 'PR-BODY' },
});

class FakeFindings implements FindingSource {
  context: FindingContext | undefined = ctx();
  files: { path: string; patch: string | null }[] = [{ path: 'src/a.ts', patch: PATCH }];
  async findingContext() {
    return this.context;
  }
  async getPrFiles() {
    return this.files;
  }
}

const finding = (id: string, file: string, s: number, e: number): Finding => ({
  id,
  severity: 'warning',
  category: 'security',
  title: 't',
  file,
  start_line: s,
  end_line: e,
  rationale: 'r',
  confidence: 0.9,
});

class FakeEngine implements ReviewEngine {
  calls: ReviewEngineInput[] = [];
  /** Per-call behaviour; default returns one finding matching src/a.ts:2. */
  behave: (n: number, input: ReviewEngineInput) => Promise<ReviewEngineResult> = async () => ({
    kept: [finding('k1', 'src/a.ts', 2, 2)],
    dropped: [],
    mode: 'single-pass',
    tokensIn: 100,
    tokensOut: 20,
    costUsd: 0.01,
  });
  async run(input: ReviewEngineInput) {
    this.calls.push(input);
    return this.behave(this.calls.length, input);
  }
}

const llm = { name: 'fake' } as unknown as LLMProvider;

function build() {
  const store = new FakeStore();
  const findings = new FakeFindings();
  const agents = new FakeAgents();
  const engine = new FakeEngine();
  const logs: { fields: Record<string, unknown>; msg: string }[] = [];
  const log = {
    info: (fields: Record<string, unknown>, msg: string) => logs.push({ fields, msg }),
    error: (fields: Record<string, unknown>, msg: string) => logs.push({ fields, msg }),
  };
  const resolver = { resolve: async () => llm, fail: null as Error | null };
  const real = new EvalBatchRunner({
    store,
    engine,
    llm: { resolve: async () => { if (resolver.fail) throw resolver.fail; return llm; } },
    log,
  });
  let pending: Promise<void> = Promise.resolve();
  const runner: BatchExecutor = {
    execute: (id: string, frozen: FrozenBatch) => (pending = real.execute(id, frozen)),
  };
  const service = new EvalService({ store, findings, agents, runner, log });
  return { store, findings, agents, engine, logs, resolver, service, settle: () => pending };
}

const manualCase = (store: FakeStore, name: string, over: Partial<NewCase> = {}) =>
  store.insertCase({
    workspaceId: WS,
    ownerId: AGENT,
    name,
    inputDiff: DIFF,
    inputMeta: { title: 'T', body: 'B' },
    expectedOutput: { expectations: [{ kind: 'must_find', file: 'src/a.ts', start_line: 1, end_line: 3 }] },
    notes: null,
    createdFrom: 'manual',
    sourceFindingId: null,
    ...over,
  });

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected rejection');
};

describe('createFromFinding', () => {
  it('creates a must_find case (201) that satisfies the EvalCaseRecord contract', async () => {
    const t = build();
    const r = await t.service.createFromFinding(WS, 'f1', undefined);
    expect(r.created).toBe(true);
    expect(EvalCaseRecord.safeParse(r.case).success).toBe(true);
    expect(r.case).toMatchObject({
      owner_id: AGENT,
      created_from: 'finding',
      source_finding_id: 'f1',
      input_meta: { title: 'PR-TITLE', body: 'PR-BODY' },
    });
    expect(r.case.expected_output.expectations).toEqual([
      expect.objectContaining({ kind: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2, title: 'Hardcoded key' }),
    ]);
    expect(r.case.input_diff).toBe(DIFF);
  });

  it('maps dismissed to must_not_flag', async () => {
    const t = build();
    t.findings.context = ctx({ finding: { acceptedAt: null, dismissedAt: new Date() } });
    const r = await t.service.createFromFinding(WS, 'f1', undefined);
    expect(r.case.expected_output.expectations[0]!.kind).toBe('must_not_flag');
  });

  it('409 finding_undecided', async () => {
    const t = build();
    t.findings.context = ctx({ finding: { acceptedAt: null } });
    const e = await code(t.service.createFromFinding(WS, 'f1', undefined));
    expect([e.code, e.statusCode]).toEqual(['finding_undecided', 409]);
    expect(t.store.cases).toHaveLength(0);
  });

  it('409 no_agent when neither the review nor the body names one; body agent_id is the fallback', async () => {
    const t = build();
    t.findings.context = ctx({ agentId: null });
    const e = await code(t.service.createFromFinding(WS, 'f1', undefined));
    expect([e.code, e.statusCode]).toEqual(['no_agent', 409]);
    const ok = await t.service.createFromFinding(WS, 'f1', { agent_id: AGENT });
    expect(ok.created).toBe(true);
  });

  it('409 no_patch when the PR has no stored patch for the file', async () => {
    const t = build();
    t.findings.files = [{ path: 'src/a.ts', patch: null }];
    const e = await code(t.service.createFromFinding(WS, 'f1', undefined));
    expect([e.code, e.statusCode]).toEqual(['no_patch', 409]);
    expect(t.store.cases).toHaveLength(0);
  });

  it('is idempotent: a second call returns 200 with the same case', async () => {
    const t = build();
    const first = await t.service.createFromFinding(WS, 'f1', undefined);
    const second = await t.service.createFromFinding(WS, 'f1', undefined);
    expect(second.created).toBe(false);
    expect(second.case.id).toBe(first.case.id);
    expect(t.store.cases).toHaveLength(1);
  });

  it('owns by the body agent only when the review has none; 409 no_agent when neither names one (AC-29, AC-30)', async () => {
    const t = build();
    t.findings.context = ctx({ agentId: null });
    const e = await code(t.service.createFromFinding(WS, 'f1', undefined));
    expect([e.code, e.statusCode]).toEqual(['no_agent', 409]);
    const ok = await t.service.createFromFinding(WS, 'f1', { agent_id: AGENT });
    expect(ok.created).toBe(true);
    expect(ok.case.owner_id).toBe(AGENT);
  });

  it('the review agent wins over a body agent_id (AC-28), even when the review agent is gone (AC-34)', async () => {
    const t = build();
    t.findings.context = ctx({ agentId: 'gone' });
    const e = await code(t.service.createFromFinding(WS, 'f1', { agent_id: AGENT }));
    expect([e.code, e.statusCode]).toEqual(['not_found', 404]);
    expect(t.store.cases).toHaveLength(0);
  });

  it('404 not_found when the owning agent no longer resolves (deleted or foreign), AC-34', async () => {
    const t = build();
    t.findings.context = ctx({ agentId: 'gone' });
    const e1 = await code(t.service.createFromFinding(WS, 'f1', undefined));
    expect([e1.code, e1.statusCode]).toEqual(['not_found', 404]);
    t.findings.context = ctx({ agentId: null });
    const e2 = await code(t.service.createFromFinding(WS, 'f1', { agent_id: 'gone' }));
    expect([e2.code, e2.statusCode]).toEqual(['not_found', 404]);
  });

  it('404 for a missing finding and a cross-workspace finding', async () => {
    const t = build();
    t.findings.context = undefined;
    expect(await code(t.service.createFromFinding(WS, 'f1', undefined))).toBeInstanceOf(NotFoundError);
    t.findings.context = ctx({ ws: 'other' });
    expect(await code(t.service.createFromFinding(WS, 'f1', undefined))).toBeInstanceOf(NotFoundError);
    expect(t.store.cases).toHaveLength(0);
  });
});

describe('case CRUD', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    name: 'manual',
    input_diff: DIFF,
    expected_output: { expectations: [{ kind: 'must_find' as const, file: 'src/a.ts', start_line: 1, end_line: 2 }] },
    ...over,
  });

  it('creates a manual case', async () => {
    const t = build();
    const c = await t.service.createCase(WS, AGENT, body());
    expect(c.created_from).toBe('manual');
    expect(t.store.cases).toHaveLength(1);
  });

  it('422 when the diff parses to 0 files or the expectation file is not in the diff; nothing stored', async () => {
    const t = build();
    expect(await code(t.service.createCase(WS, AGENT, body({ input_diff: PATCH })))).toBeInstanceOf(ValidationError);
    const bad = body({ expected_output: { expectations: [{ kind: 'must_find', file: 'nope.ts', start_line: 1, end_line: 1 }] } });
    expect(await code(t.service.createCase(WS, AGENT, bad))).toBeInstanceOf(ValidationError);
    expect(t.store.cases).toHaveLength(0);
  });

  it('404 for an unknown agent or case', async () => {
    const t = build();
    t.agents.current = undefined;
    expect(await code(t.service.listCases(WS, AGENT))).toBeInstanceOf(NotFoundError);
    expect(await code(t.service.updateCase(WS, 'nope', body()))).toBeInstanceOf(NotFoundError);
    expect(await code(t.service.deleteCase(WS, 'nope'))).toBeInstanceOf(NotFoundError);
  });
});

describe('startBatch + runner', () => {
  it('409 no_eval_cases with zero cases and 409 batch_running while one runs', async () => {
    const t = build();
    const e = await code(t.service.startBatch(WS, AGENT));
    expect([e.code, e.statusCode]).toEqual(['no_eval_cases', 409]);
    await manualCase(t.store, 'c1');
    t.engine.behave = () => new Promise(() => {}); // never settles
    const b = await t.service.startBatch(WS, AGENT);
    expect(b.status).toBe('running');
    const e2 = await code(t.service.startBatch(WS, AGENT));
    expect([e2.code, e2.statusCode]).toEqual(['batch_running', 409]);
    expect(t.store.batches).toHaveLength(1);
  });

  it('calls the engine once per case with exactly the frozen fields and stores the snapshot', async () => {
    const t = build();
    await manualCase(t.store, 'c1');
    await manualCase(t.store, 'c2');
    const b = await t.service.startBatch(WS, AGENT);
    await t.settle();

    expect(b.skills).toEqual(['sk']);
    expect(t.engine.calls).toHaveLength(2);
    for (const call of t.engine.calls) {
      expect(Object.keys(call).sort()).toEqual(
        ['diff', 'llm', 'model', 'prDescription', 'skills', 'strategy', 'systemPrompt', 'task'].sort(),
      );
      expect(call.systemPrompt).toBe('PROMPT-V1');
      expect(call.skills).toEqual(['### sk\nSKBODY']);
      expect(call.prDescription).toBe('T\n\nB');
      expect(call.diff.files.map((x) => x.path)).toEqual(['src/a.ts']);
    }
    const done = t.store.batches[0]!;
    expect(done.status).toBe('done');
    expect(done).toMatchObject({ casesTotal: 2, casesPassed: 2, recall: 1, tokensIn: 200, tokensOut: 40 });
    expect(done.costUsd).toBeCloseTo(0.02);
    expect(t.store.runs).toHaveLength(2);
    expect(t.store.runs.every((r) => r.pass === true && r.error === null)).toBe(true);
  });

  it('omits skills and prDescription when there are none', async () => {
    const t = build();
    t.agents.skills = [];
    await manualCase(t.store, 'c1', { inputMeta: null });
    await t.service.startBatch(WS, AGENT);
    await t.settle();
    expect(Object.keys(t.engine.calls[0]!)).not.toContain('skills');
    expect(Object.keys(t.engine.calls[0]!)).not.toContain('prDescription');
  });

  it('records a per-case error and continues with the next case', async () => {
    const t = build();
    await manualCase(t.store, 'c1');
    await manualCase(t.store, 'c2');
    const ok = t.engine.behave;
    t.engine.behave = (n, i) => (n === 1 ? Promise.reject(new Error('model blew up')) : ok(n, i));
    await t.service.startBatch(WS, AGENT);
    await t.settle();
    expect(t.engine.calls).toHaveLength(2);
    expect(t.store.runs[0]).toMatchObject({ error: 'model blew up', pass: null, recall: null, actualOutput: null });
    expect(t.store.runs[1]).toMatchObject({ error: null, pass: true });
    expect(t.store.batches[0]).toMatchObject({ status: 'done', casesTotal: 2, casesPassed: 1 });
  });

  it('fails the batch when every case errored', async () => {
    const t = build();
    await manualCase(t.store, 'c1');
    await manualCase(t.store, 'c2');
    t.engine.behave = async (n) => {
      throw new Error(`E${n}`);
    };
    await t.service.startBatch(WS, AGENT);
    await t.settle();
    expect(t.store.batches[0]).toMatchObject({
      status: 'failed',
      error: 'all 2 cases failed: E1',
      casesTotal: 2,
      casesPassed: 0,
      recall: null,
    });
  });

  it('fails the batch with the resolution error when the provider cannot be resolved', async () => {
    const t = build();
    await manualCase(t.store, 'c1');
    t.resolver.fail = new Error('OPENROUTER_API_KEY is not configured');
    await t.service.startBatch(WS, AGENT);
    await t.settle();
    expect(t.engine.calls).toHaveLength(0);
    expect(t.store.batches[0]).toMatchObject({ status: 'failed', error: 'OPENROUTER_API_KEY is not configured' });
  });

  it('freezes the cases at batch start and stores the scored expectations in each run', async () => {
    const t = build();
    await manualCase(t.store, 'c1');
    const c2 = (await manualCase(t.store, 'c2')).case;
    const edited = { expectations: [{ kind: 'must_find' as const, file: 'src/a.ts', start_line: 1, end_line: 1 }] };
    const ok = t.engine.behave;
    let reads = 0;
    const getByIds = t.store.getCasesByIds.bind(t.store);
    t.store.getCasesByIds = async (ws, ids) => (reads++, getByIds(ws, ids));
    t.engine.behave = (n, i) => {
      // Edit the second case while the first runs: the batch must not see it.
      if (n === 1) t.store.cases[1] = { ...c2, expectedOutput: edited };
      return ok(n, i);
    };
    const before = c2.expectedOutput;
    await t.service.startBatch(WS, AGENT);
    await t.settle();
    expect(reads).toBe(1);
    const actual = t.store.runs[1]!.actualOutput!;
    expect(actual.expected_output).toEqual(before);
  });

  it('keeps the frozen snapshot when the agent is edited mid-batch', async () => {
    const t = build();
    await manualCase(t.store, 'c1');
    await manualCase(t.store, 'c2');
    const ok = t.engine.behave;
    t.engine.behave = (n, i) => {
      if (n === 1) {
        t.agents.current = agent({ systemPrompt: 'PROMPT-V2', model: 'model-2', version: 2 });
        t.agents.skills = [];
      }
      return ok(n, i);
    };
    await t.service.startBatch(WS, AGENT);
    await t.settle();
    expect(t.engine.calls.map((c) => [c.systemPrompt, c.model, c.skills])).toEqual([
      ['PROMPT-V1', 'model-1', ['### sk\nSKBODY']],
      ['PROMPT-V1', 'model-1', ['### sk\nSKBODY']],
    ]);
    expect(t.store.batches[0]!.snapshot).toMatchObject({ agentVersion: 1, systemPrompt: 'PROMPT-V1', model: 'model-1' });
  });

  it('logs ids, counts and metrics but no diff, prompt or PR text', async () => {
    const t = build();
    await manualCase(t.store, 'c1');
    await t.service.startBatch(WS, AGENT);
    await t.settle();
    const text = JSON.stringify(t.logs);
    expect(t.logs.length).toBeGreaterThan(0);
    for (const secret of ['PROMPT-V1', 'SKBODY', 'src/a.ts', 'PR-BODY', '+b']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('batches + reaper', () => {
  it('404 for a missing batch and reaps running batches with a non-empty error', async () => {
    const t = build();
    expect(await code(t.service.getBatch(WS, 'nope'))).toBeInstanceOf(NotFoundError);
    await manualCase(t.store, 'c1');
    t.engine.behave = () => new Promise(() => {});
    await t.service.startBatch(WS, AGENT);
    expect(await t.service.reapOrphans()).toBe(1);
    expect(t.store.batches[0]!.status).toBe('failed');
    expect(t.store.batches[0]!.error).toBeTruthy();
  });
});
