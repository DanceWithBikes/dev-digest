/**
 * Pins the BriefService use cases (SPEC-03) with in-memory fakes over its
 * ports, no database and no network. Behaviours: AC-9..AC-15, AC-17..AC-22,
 * AC-26 (reader call), AC-28..AC-30, AC-44..AC-49, OQ-6, NFR-3, NFR-9.
 * Decisions 2026-10-03: the adapter re-ask stays (one `write` call per
 * generation); "abort" at 90 s means the POST stops waiting, the in-flight slot
 * is released and a late result is never stored; the 5/min limit is per
 * workspace across PRs and checked before the in-flight flag.
 */
import { describe, it, expect, vi } from 'vitest';
import type { BlastRadius, PrBrief } from '@devdigest/shared';
import { PrBrief as PrBriefSchema } from '@devdigest/shared';
import { BriefService } from '../src/modules/brief/service.js';
import { InMemoryBriefGate } from '../src/modules/brief/gate.js';
import type {
  BlastMapReader,
  BriefDocReader,
  BriefLog,
  BriefStore,
  BriefWriteResult,
  BriefWriter,
  Clock,
  StoredBrief,
  WriteMessage,
} from '../src/modules/brief/ports.js';
import type {
  AttachmentOwner,
  ModelBriefOutput,
  PullForBrief,
  StoredIntent,
} from '../src/modules/brief/domain.js';
import {
  ConfigError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  RateLimitError,
} from '../src/platform/errors.js';

const WS = 'ws-1';
const HEAD = 'headsha1234567';

const pull = (over: Partial<PullForBrief> = {}): PullForBrief => ({
  prId: 'pr-1',
  repoId: 'repo-1',
  owner: 'acme',
  name: 'widgets',
  number: 482,
  title: 'TITLE-SECRET',
  body: 'BODY-SECRET',
  headSha: HEAD,
  files: [{ path: 'src/a.ts', additions: 3, deletions: 1, patch: '@@ -1,2 +10,3 @@\nPATCH-SECRET' }],
  ...over,
});

const intent = (headSha: string | null = HEAD): StoredIntent => ({
  intent: 'Do the thing',
  in_scope: ['a'],
  out_of_scope: ['b'],
  headSha,
});

const blastMap = (over: Partial<BlastRadius> = {}): BlastRadius => ({
  changed_symbols: [],
  downstream: [
    {
      symbol: 'fn',
      callers: [{ name: 'c', file: 'src/caller.ts', line: 8 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: 'blast summary',
  ...over,
});

const goodOutput = (): ModelBriefOutput => ({
  summary: 'A summary',
  risks: [
    { kind: 'k', title: 'real', explanation: 'e', severity: 'high', file_refs: ['src/a.ts:11'] },
    { kind: 'k', title: 'invented', explanation: 'e', severity: 'low', file_refs: ['ghost.ts'] },
  ],
  review_focus: [{ file: 'src/a.ts', line: 11, reason: 'why' }],
});

function fakeClock(start = 1_000_000) {
  let t = start;
  const timers: { ms: number; fire: () => void }[] = [];
  const after = vi.fn((ms: number) => {
    const promise = new Promise<void>((resolve) => {
      timers.push({ ms, fire: resolve });
    });
    return { promise, clear: vi.fn() };
  });
  const clock: Clock = { now: () => t, after };
  return {
    clock,
    after,
    advance: (ms: number) => (t += ms),
    /** The request deadline is always the first timer armed. */
    fireDeadline: () => timers[0]?.fire(),
    /** The most recent timer armed with this duration (e.g. the document sub-deadline). */
    fireTimer: (ms: number) => [...timers].reverse().find((x) => x.ms === ms)?.fire(),
  };
}

interface Opts {
  pulls?: Record<string, PullForBrief>;
  stored?: StoredBrief;
  intent?: StoredIntent | null;
  blast?: BlastRadius | Error;
  owners?: AttachmentOwner[];
  docs?: Map<string, { text: string; version: string }> | Error;
  write?: (messages: WriteMessage[], opts: { timeoutMs: number }) => Promise<BriefWriteResult>;
  prepareError?: Error;
  saveBrief?: (id: string, brief: PrBrief) => Promise<void>;
}

function setup(opts: Opts = {}) {
  const pulls = opts.pulls ?? { 'pr-1': pull() };
  let stored: StoredBrief = opts.stored ?? null;
  const store = {
    getPull: vi.fn(async (ws: string, id: string) => (ws === WS ? (pulls[id] ?? null) : null)),
    getIntent: vi.fn(async () => (opts.intent === undefined ? intent() : opts.intent)),
    listAttachmentOwners: vi.fn(async () => opts.owners ?? []),
    getBrief: vi.fn(async () => stored),
    saveBrief: vi.fn(async (id: string, brief: PrBrief) => {
      await opts.saveBrief?.(id, brief);
      stored = { kind: 'found', brief };
    }),
  } satisfies BriefStore;
  const blast = {
    forPull: vi.fn(async () => {
      if (opts.blast instanceof Error) throw opts.blast;
      return opts.blast ?? blastMap();
    }),
  } satisfies BlastMapReader;
  const docs = {
    readAll: vi.fn(async () => {
      if (opts.docs instanceof Error) throw opts.docs;
      return opts.docs ?? new Map();
    }),
  } satisfies BriefDocReader;
  const write = vi.fn(
    opts.write ??
      (async (): Promise<BriefWriteResult> => ({
        data: goodOutput(),
        model: 'test-model',
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.01,
      })),
  );
  const prepare = vi.fn(async () => {
    if (opts.prepareError) throw opts.prepareError;
    return { model: 'test-model', write };
  });
  const writer: BriefWriter = { prepare };
  const log = { info: vi.fn(), warn: vi.fn() } satisfies BriefLog;
  const c = fakeClock();
  const service = new BriefService({
    store,
    blast,
    docs,
    writer,
    gate: new InMemoryBriefGate(),
    log,
    clock: c.clock,
  });
  return { service, store, blast, docs, write, prepare, log, ...c, current: () => stored };
}

const storedBrief = (): PrBrief => ({
  summary: 'old',
  intent: null,
  blast: null,
  risks: { risks: [] },
  history: { history: [] },
  review_focus: [],
  missing: [],
  head_sha: 'old',
  generated_at: '2020-01-01T00:00:00.000Z',
  model: 'old-model',
  cost_usd: null,
  tokens_in: null,
  tokens_out: null,
});

describe('BriefService.getBrief - reading (AC-9, AC-10, AC-11, AC-15, OQ-6)', () => {
  it('returns the stored brief without any model call', async () => {
    const t = setup({ stored: { kind: 'found', brief: storedBrief() } });
    await expect(t.service.getBrief(WS, 'pr-1')).resolves.toEqual(storedBrief());
    expect(t.prepare).not.toHaveBeenCalled();
    expect(t.write).not.toHaveBeenCalled();
  });

  it('returns null when no brief is stored', async () => {
    await expect(setup().service.getBrief(WS, 'pr-1')).resolves.toBeNull();
  });

  it('throws NotFoundError for a PR outside the workspace and never reads the brief', async () => {
    const t = setup();
    await expect(t.service.getBrief('other-ws', 'pr-1')).rejects.toBeInstanceOf(NotFoundError);
    expect(t.store.getBrief).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for an unknown PR id', async () => {
    await expect(setup().service.getBrief(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reads an invalid stored body as null and logs exactly one warn line without the body', async () => {
    const t = setup({ stored: { kind: 'invalid' } });
    await expect(t.service.getBrief(WS, 'pr-1')).resolves.toBeNull();
    expect(t.log.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(t.log.warn.mock.calls)).not.toContain('SECRET');
  });
});

describe('BriefService.generate - success path (AC-12..AC-15, NFR-3)', () => {
  it('makes exactly one prepare and one write call', async () => {
    const t = setup();
    await t.service.generate(WS, 'pr-1');
    expect(t.prepare).toHaveBeenCalledTimes(1);
    expect(t.write).toHaveBeenCalledTimes(1);
  });

  it('stores the brief and returns exactly what was stored', async () => {
    const t = setup();
    const brief = await t.service.generate(WS, 'pr-1');
    expect(t.store.saveBrief).toHaveBeenCalledTimes(1);
    expect(t.store.saveBrief).toHaveBeenCalledWith('pr-1', brief);
    expect(t.current()).toEqual({ kind: 'found', brief });
  });

  it('replaces a previously stored brief', async () => {
    const t = setup({ stored: { kind: 'found', brief: storedBrief() } });
    const brief = await t.service.generate(WS, 'pr-1');
    expect(brief.summary).toBe('A summary');
    await expect(t.service.getBrief(WS, 'pr-1')).resolves.toEqual(brief);
  });

  it('returns a brief that satisfies the PrBrief contract with head SHA, model and usage', async () => {
    const brief = await setup().service.generate(WS, 'pr-1');
    expect(PrBriefSchema.safeParse(brief).success).toBe(true);
    expect(brief).toMatchObject({
      head_sha: HEAD,
      model: 'test-model',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.01,
      history: { history: [] },
    });
  });

  it('throws NotFoundError for an unknown PR before any model work', async () => {
    const t = setup();
    await expect(t.service.generate(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(t.prepare).not.toHaveBeenCalled();
  });

  it('passes a structured schema that requires a review focus item for a PR with files', async () => {
    const t = setup();
    await t.service.generate(WS, 'pr-1');
    const schema = (t.write.mock.calls[0] as unknown as [unknown, { schema: { safeParse(v: unknown): { success: boolean } } }])[1].schema;
    expect(schema.safeParse({ summary: 's', risks: [], review_focus: [] }).success).toBe(false);
  });

  it('sends the title, body and patch to the model', async () => {
    const t = setup();
    await t.service.generate(WS, 'pr-1');
    const msgs = t.write.mock.calls[0]![0] as WriteMessage[];
    const all = msgs.map((m) => m.content).join('\n');
    expect(all).toContain('TITLE-SECRET');
    expect(all).toContain('BODY-SECRET');
    expect(all).toContain('PATCH-SECRET');
  });

  it('grounds the model output: an invented ref is dropped and its risk disappears', async () => {
    const brief = await setup().service.generate(WS, 'pr-1');
    expect(brief.risks.risks.map((r) => r.title)).toEqual(['real']);
  });
});

describe('BriefService.generate - intent and blast (AC-17..AC-22)', () => {
  it('copies a current stored intent into the brief with no intent missing entry', async () => {
    const brief = await setup().service.generate(WS, 'pr-1');
    expect(brief.intent).toEqual({ intent: 'Do the thing', in_scope: ['a'], out_of_scope: ['b'] });
    expect(brief.missing.filter((m) => m.source === 'intent')).toEqual([]);
  });

  it('sets intent to null and adds the "no intent" missing entry when none is stored', async () => {
    const brief = await setup({ intent: null }).service.generate(WS, 'pr-1');
    expect(brief.intent).toBeNull();
    expect(brief.missing).toContainEqual({ source: 'intent', reason: 'no intent derived for this PR' });
  });

  it('still uses a stale intent and adds a stale missing entry', async () => {
    const brief = await setup({ intent: intent('0ldsha0000') }).service.generate(WS, 'pr-1');
    expect(brief.intent?.intent).toBe('Do the thing');
    expect(brief.missing.find((m) => m.source === 'intent')?.reason).toMatch(/stale/);
  });

  it('copies a readable blast map into the brief and sends its summary to the model', async () => {
    const t = setup();
    const brief = await t.service.generate(WS, 'pr-1');
    expect(brief.blast).toEqual(blastMap());
    expect((t.write.mock.calls[0]![0] as WriteMessage[]).map((m) => m.content).join('\n')).toContain('blast summary');
    expect(brief.missing.filter((m) => m.source === 'blast')).toEqual([]);
  });

  it('adds a blast missing entry containing the reason code for a degraded map and keeps the map', async () => {
    const brief = await setup({ blast: blastMap({ degraded: true, reason: 'index_failed' }) }).service.generate(WS, 'pr-1');
    expect(brief.blast).not.toBeNull();
    expect(brief.missing.find((m) => m.source === 'blast')?.reason).toContain('index_failed');
  });

  it('treats a throwing blast reader as unavailable: null blast, missing entry, brief still generated', async () => {
    const t = setup({ blast: new Error('boom: SECRET') });
    const brief = await t.service.generate(WS, 'pr-1');
    expect(brief.blast).toBeNull();
    expect(brief.missing).toContainEqual({ source: 'blast', reason: 'blast radius unavailable' });
    expect(t.write).toHaveBeenCalledTimes(1);
  });

  it('keeps a review focus item on a caller file only at a listed caller line', async () => {
    const t = setup({
      write: async () => ({
        data: {
          summary: 's',
          risks: [],
          review_focus: [
            { file: 'src/caller.ts', line: 8, reason: 'ok' },
            { file: 'src/caller.ts', line: 9, reason: 'bad line' },
          ],
        },
        model: 'm',
        tokensIn: 1,
        tokensOut: 1,
        costUsd: null,
      }),
    });
    const brief = await t.service.generate(WS, 'pr-1');
    expect(brief.review_focus.map((f) => f.line)).toEqual([8]);
  });
});

describe('BriefService.generate - documents (AC-26, AC-28..AC-30)', () => {
  const owners: AttachmentOwner[] = [
    { id: 'a', name: 'agent', createdAt: new Date(0), paths: ['docs/b.md', 'docs/a.md'], skills: [] },
  ];

  it('asks the reader for the planned paths in collection order with the PR repo, number and head SHA', async () => {
    const t = setup({ owners });
    await t.service.generate(WS, 'pr-1');
    expect(t.docs.readAll).toHaveBeenCalledWith(
      { owner: 'acme', name: 'widgets' },
      { number: 482, headSha: HEAD },
      ['docs/a.md', 'docs/b.md'],
    );
  });

  it('does not call the reader and reports "no project context documents attached" when nothing is attached', async () => {
    const t = setup();
    const brief = await t.service.generate(WS, 'pr-1');
    expect(t.docs.readAll).not.toHaveBeenCalled();
    expect(brief.missing).toContainEqual({ source: 'specs', reason: 'no project context documents attached' });
  });

  it('sends read documents to the model and reports an unread one as "not found"', async () => {
    const t = setup({ owners, docs: new Map([['docs/a.md', { text: 'DOC-A-TEXT', version: 'head' }]]) });
    const brief = await t.service.generate(WS, 'pr-1');
    const prompt = (t.write.mock.calls[0]![0] as WriteMessage[]).map((m) => m.content).join('\n');
    expect(prompt).toContain('DOC-A-TEXT');
    const m = brief.missing.find((x) => x.source === 'specs');
    expect(m?.reason).toContain('docs/b.md');
    expect(m?.reason).toContain('not found');
  });

  it('reports a document over the 20,000-token budget with its path and does not send it', async () => {
    const t = setup({ owners, docs: new Map([['docs/a.md', { text: 'z'.repeat(80_001), version: 'head' }]]) });
    const brief = await t.service.generate(WS, 'pr-1');
    expect(brief.missing.some((x) => x.source === 'specs' && x.reason.includes('docs/a.md') && x.reason.includes('20,000'))).toBe(true);
    expect((t.write.mock.calls[0]![0] as WriteMessage[]).map((m) => m.content).join('\n')).not.toContain('zzzz');
  });

  it('treats a throwing document reader as every document not found, not as a failed brief', async () => {
    const brief = await setup({ owners, docs: new Error('git exploded') }).service.generate(WS, 'pr-1');
    expect(brief.missing.filter((m) => m.reason.includes('not found'))).toHaveLength(2);
  });

  it('stops waiting for a stalled reader after 15 seconds: every document not found, brief still generated', async () => {
    const t = setup({ owners });
    t.docs.readAll.mockImplementation(() => new Promise(() => undefined));
    const pending = t.service.generate(WS, 'pr-1');
    await vi.waitFor(() => expect(t.docs.readAll).toHaveBeenCalled());
    expect(t.after).toHaveBeenCalledWith(15_000);
    t.fireTimer(15_000);
    const brief = await pending;
    expect(brief.missing.filter((m) => m.reason.includes('not found'))).toHaveLength(2);
    expect(t.write).toHaveBeenCalledTimes(1);
  });
});

describe('BriefService.generate - grounding results (AC-44, AC-45)', () => {
  it('logs one line carrying the dropped counts when grounding dropped something', async () => {
    const t = setup();
    await t.service.generate(WS, 'pr-1');
    expect(t.log.info).toHaveBeenCalledTimes(1);
    const fields = t.log.info.mock.calls[0]![0] as { dropped: unknown };
    expect(fields.dropped).toEqual({ fileRefs: 1, risks: 1, focus: 0 });
  });

  it('still stores and returns the brief with empty lists when grounding leaves nothing', async () => {
    const t = setup({
      write: async () => ({
        data: {
          summary: 'only summary',
          risks: [{ kind: 'k', title: 't', explanation: 'e', severity: 'low' as const, file_refs: ['x.ts'] }],
          review_focus: [{ file: 'x.ts', line: 1, reason: 'r' }],
        },
        model: 'm',
        tokensIn: 1,
        tokensOut: 1,
        costUsd: null,
      }),
    });
    const brief = await t.service.generate(WS, 'pr-1');
    expect(brief.summary).toBe('only summary');
    expect(brief.risks.risks).toEqual([]);
    expect(brief.review_focus).toEqual([]);
    expect(t.store.saveBrief).toHaveBeenCalledTimes(1);
  });
});

describe('BriefService.generate - failure keeps the stored brief (AC-46, NFR-9)', () => {
  const failing = () =>
    setup({
      stored: { kind: 'found', brief: storedBrief() },
      write: async () => {
        throw Object.assign(new Error('provider said RAW-SECRET sk-123'), { raw: 'RAW-SECRET' });
      },
    });

  it('rejects with an ExternalServiceError and leaves the stored brief unchanged', async () => {
    const t = failing();
    await expect(t.service.generate(WS, 'pr-1')).rejects.toBeInstanceOf(ExternalServiceError);
    expect(t.store.saveBrief).not.toHaveBeenCalled();
    expect(t.current()).toEqual({ kind: 'found', brief: storedBrief() });
  });

  it('puts no provider text or raw output into the error or the log', async () => {
    const t = failing();
    const err = await t.service.generate(WS, 'pr-1').catch((e: Error) => e);
    expect(JSON.stringify({ m: (err as Error).message, s: (err as Error).stack?.split('\n')[0] })).not.toContain('RAW-SECRET');
    expect(JSON.stringify(t.log.info.mock.calls)).not.toContain('RAW-SECRET');
    expect(JSON.stringify(t.log.warn.mock.calls)).not.toContain('RAW-SECRET');
  });

  it('passes a missing-key ConfigError through unchanged and stores nothing', async () => {
    const t = setup({ prepareError: new ConfigError('no key') });
    await expect(t.service.generate(WS, 'pr-1')).rejects.toBeInstanceOf(ConfigError);
    expect(t.write).not.toHaveBeenCalled();
    expect(t.store.saveBrief).not.toHaveBeenCalled();
  });

  it('releases the in-flight slot after a failure so a retry is accepted', async () => {
    let n = 0;
    const t = setup({
      write: async () => {
        n += 1;
        if (n === 1) throw new Error('first fails');
        return { data: goodOutput(), model: 'm', tokensIn: 1, tokensOut: 1, costUsd: null };
      },
    });
    await expect(t.service.generate(WS, 'pr-1')).rejects.toBeInstanceOf(ExternalServiceError);
    await expect(t.service.generate(WS, 'pr-1')).resolves.toBeDefined();
  });
});

describe('BriefService.generate - 90 second deadline (AC-47)', () => {
  /** A write that stays pending until `release()` is called. */
  function slowWrite() {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const write = async (): Promise<BriefWriteResult> => {
      await gate;
      return { data: goodOutput(), model: 'm', tokensIn: 1, tokensOut: 1, costUsd: null };
    };
    return { write, release };
  }

  it('arms the timer for the full 90 seconds measured from request start', async () => {
    const t = setup();
    await t.service.generate(WS, 'pr-1');
    expect(t.after).toHaveBeenCalledWith(90_000);
  });

  it('answers an ExternalServiceError when the deadline fires, stores nothing, and never stores the late result', async () => {
    const s = slowWrite();
    const t = setup({ stored: { kind: 'found', brief: storedBrief() }, write: s.write });
    const pending = t.service.generate(WS, 'pr-1').catch((e: Error) => e);
    await vi.waitFor(() => expect(t.write).toHaveBeenCalled());
    t.fireDeadline();
    expect(await pending).toBeInstanceOf(ExternalServiceError);
    s.release();
    await new Promise((r) => setTimeout(r, 10));
    expect(t.store.saveBrief).not.toHaveBeenCalled();
    expect(t.current()).toEqual({ kind: 'found', brief: storedBrief() });
  });

  it('waits for a save already under way when the deadline fires, and returns the committed brief', async () => {
    let releaseSave!: () => void;
    const saving = new Promise<void>((r) => (releaseSave = r));
    const t = setup({ saveBrief: () => saving });
    const pending = t.service.generate(WS, 'pr-1');
    await vi.waitFor(() => expect(t.store.saveBrief).toHaveBeenCalled());
    t.fireDeadline();
    await new Promise((r) => setTimeout(r, 10));
    releaseSave();
    const brief = await pending;
    expect(t.current()).toEqual({ kind: 'found', brief });
    expect(t.log.info).toHaveBeenCalledTimes(1);
    await expect(t.service.generate(WS, 'pr-1')).resolves.toBeDefined();
  });

  it('answers the failure of a save under way when the deadline fires, releasing the slot', async () => {
    let failSave!: () => void;
    const saving = new Promise<void>((_, rej) => (failSave = () => rej(new Error('db down'))));
    let calls = 0;
    const t = setup({ saveBrief: () => (++calls === 1 ? saving : Promise.resolve()) });
    const pending = t.service.generate(WS, 'pr-1').catch((e: Error) => e);
    await vi.waitFor(() => expect(t.store.saveBrief).toHaveBeenCalled());
    t.fireDeadline();
    failSave();
    expect((await pending as Error).message).toBe('db down');
    t.write.mockImplementation(async () => ({ data: goodOutput(), model: 'm', tokensIn: 1, tokensOut: 1, costUsd: null }));
    await expect(t.service.generate(WS, 'pr-1')).resolves.toBeDefined();
  });

  it('releases the in-flight slot on timeout so the next POST is accepted', async () => {
    const s = slowWrite();
    const t = setup({ write: s.write });
    const pending = t.service.generate(WS, 'pr-1').catch((e: Error) => e);
    await vi.waitFor(() => expect(t.write).toHaveBeenCalled());
    t.fireDeadline();
    await pending;
    t.write.mockImplementation(async () => ({ data: goodOutput(), model: 'm', tokensIn: 1, tokensOut: 1, costUsd: null }));
    await expect(t.service.generate(WS, 'pr-1')).resolves.toBeDefined();
    s.release();
  });

  it('passes the model call only the time left of the 90 seconds after earlier work', async () => {
    const t = setup();
    t.store.getIntent.mockImplementation(async () => {
      t.advance(30_000);
      return intent();
    });
    await t.service.generate(WS, 'pr-1');
    const opts = t.write.mock.calls[0]![1] as { timeoutMs: number };
    expect(opts.timeoutMs).toBe(60_000);
  });
});

describe('BriefService.generate - concurrency and rate limit (AC-48, AC-49)', () => {
  it('answers ConflictError for a second POST on the same PR while one is running, without a second model call', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const t = setup({
      write: async () => {
        await hold;
        return { data: goodOutput(), model: 'm', tokensIn: 1, tokensOut: 1, costUsd: null };
      },
    });
    const first = t.service.generate(WS, 'pr-1');
    await vi.waitFor(() => expect(t.write).toHaveBeenCalled());
    await expect(t.service.generate(WS, 'pr-1')).rejects.toBeInstanceOf(ConflictError);
    release();
    await first;
    expect(t.write).toHaveBeenCalledTimes(1);
  });

  it('accepts a concurrent POST for a different PR', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const t = setup({
      pulls: { 'pr-1': pull(), 'pr-2': pull({ prId: 'pr-2' }) },
      write: async () => {
        await hold;
        return { data: goodOutput(), model: 'm', tokensIn: 1, tokensOut: 1, costUsd: null };
      },
    });
    const a = t.service.generate(WS, 'pr-1');
    const b = t.service.generate(WS, 'pr-2');
    await vi.waitFor(() => expect(t.write).toHaveBeenCalledTimes(2));
    release();
    await expect(Promise.all([a, b])).resolves.toHaveLength(2);
  });

  it('answers RateLimitError on the sixth POST within a minute, counted across two PRs of one workspace', async () => {
    const t = setup({ pulls: { 'pr-1': pull(), 'pr-2': pull({ prId: 'pr-2' }) } });
    const ids = ['pr-1', 'pr-2', 'pr-1', 'pr-2', 'pr-1'];
    for (const id of ids) await t.service.generate(WS, id);
    await expect(t.service.generate(WS, 'pr-2')).rejects.toBeInstanceOf(RateLimitError);
    expect(t.write).toHaveBeenCalledTimes(5);
  });

  it('accepts a POST again once the minute has passed', async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) await t.service.generate(WS, 'pr-1');
    await expect(t.service.generate(WS, 'pr-1')).rejects.toBeInstanceOf(RateLimitError);
    t.advance(61_000);
    await expect(t.service.generate(WS, 'pr-1')).resolves.toBeDefined();
  });

  it('checks the rate limit before the in-flight flag, so the sixth POST on a running PR is 429 not 409', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const t = setup({
      write: async () => {
        await hold;
        return { data: goodOutput(), model: 'm', tokensIn: 1, tokensOut: 1, costUsd: null };
      },
    });
    const first = t.service.generate(WS, 'pr-1');
    await vi.waitFor(() => expect(t.write).toHaveBeenCalled());
    for (let i = 0; i < 4; i++) {
      await expect(t.service.generate(WS, 'pr-1')).rejects.toBeInstanceOf(ConflictError);
    }
    await expect(t.service.generate(WS, 'pr-1')).rejects.toBeInstanceOf(RateLimitError);
    release();
    await first;
  });

  it('counts limits per workspace: another workspace is not throttled', async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) await t.service.generate(WS, 'pr-1');
    // other-ws cannot see pr-1 (404) but must not be blocked by WS's window
    await expect(t.service.generate('other-ws', 'pr-1')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('BriefService.generate - logging (NFR-9)', () => {
  it('logs exactly one info line per successful generation with model, usage, cost, missing sources and drops', async () => {
    const t = setup({ intent: null });
    await t.service.generate(WS, 'pr-1');
    expect(t.log.info).toHaveBeenCalledTimes(1);
    expect(t.log.info.mock.calls[0]![0]).toMatchObject({
      prId: 'pr-1',
      model: 'test-model',
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.01,
      missing: ['intent', 'specs'],
      dropped: { fileRefs: 1, risks: 1, focus: 0 },
    });
  });

  it('never logs the title, body, patch, intent or document text', async () => {
    const t = setup({
      owners: [{ id: 'a', name: 'a', createdAt: new Date(0), paths: ['d.md'], skills: [] }],
      docs: new Map([['d.md', { text: 'DOC-SECRET', version: 'head' }]]),
    });
    await t.service.generate(WS, 'pr-1');
    const logged = JSON.stringify([t.log.info.mock.calls, t.log.warn.mock.calls]);
    for (const s of ['TITLE-SECRET', 'BODY-SECRET', 'PATCH-SECRET', 'DOC-SECRET', 'Do the thing']) {
      expect(logged).not.toContain(s);
    }
  });

  it('logs exactly one info line when a generation fails, without error text', async () => {
    const t = setup({
      write: async () => {
        throw new Error('provider detail RAW-SECRET');
      },
    });
    await t.service.generate(WS, 'pr-1').catch(() => undefined);
    expect(t.log.info).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(t.log.info.mock.calls)).not.toContain('RAW-SECRET');
  });
});
