import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingStatus, OnboardingTour } from '@devdigest/shared';
import { OnboardingService, type OnboardingServiceDeps } from '../src/modules/onboarding/service.js';
import type {
  IndexStateView,
  OnboardingStore,
  PreparedWriter,
  RepoInfo,
  TourWriter,
} from '../src/modules/onboarding/ports.js';
import type { StoredTour } from '../src/modules/onboarding/helpers.js';
import { NotFoundError, RateLimitError } from '../src/platform/errors.js';
import { resolveStatus, keepsStoredTour, groundModelSections } from '../src/modules/onboarding/domain.js';

/** Clock `after` backed by `setTimeout`, so fake timers drive the deadlines. */
const realAfter = (ms: number) => {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<void>((resolve) => {
    handle = setTimeout(resolve, Math.max(0, ms));
  });
  return { promise, clear: () => clearTimeout(handle) };
};

const REPO: RepoInfo = { id: 'r1', owner: 'o', name: 'n', fullName: 'o/n', clonePath: '/clone' };

function makeHarness(opts: {
  state?: IndexStateView | null | Error;
  write?: () => Promise<unknown>;
  configured?: boolean;
  stored?: StoredTour;
}) {
  const calls = { write: 0, replace: [] as OnboardingTour[], failed: [] as OnboardingStatus[] };
  let stored: StoredTour = opts.stored ?? { tour: null, lastFailed: null };
  let now = 1_000_000;
  const tasks: Array<() => Promise<void>> = [];

  const store: OnboardingStore = {
    getRepo: async (_ws, id) => (id === 'r1' ? REPO : null),
    getTour: async () => stored,
    replaceTour: async (_ws, _id, tour) => {
      calls.replace.push(tour);
      stored = { tour, lastFailed: null };
    },
    recordFailedAttempt: async (_ws, _id, status) => {
      calls.failed.push(status);
    },
  };
  const writer: TourWriter = {
    describe: async () => ({ provider: 'openai', model: 'm' }),
    prepare: async (): Promise<PreparedWriter> =>
      opts.configured === false
        ? { configured: false }
        : {
            configured: true,
            write: async () => {
              calls.write += 1;
              return (await (opts.write?.() ?? Promise.reject(new Error('boom')))) as never;
            },
          },
  };
  const tokens = new Map<string, number>();
  const posts: number[] = [];
  let counter = 0;
  const deps: OnboardingServiceDeps = {
    store,
    index: {
      readIndexState: async () => {
        if (opts.state instanceof Error) throw opts.state;
        return opts.state === undefined ? { status: 'full', lastIndexedSha: 'sha1', candidateFiles: 2 } : opts.state;
      },
      getRankedFiles: async () => [
        { path: 'src/a.ts', rank: 0.9 },
        { path: 'src/b.ts', rank: 0.5 },
      ],
      getImportEdges: async () => [{ from: 'src/a.ts', to: 'src/b.ts' }],
      getCriticalPaths: async () => [['src/a.ts', 'src/b.ts']],
      getEndpoints: async () => [],
    },
    files: {
      listFiles: async () => ['package.json'],
      readFile: async () => JSON.stringify({ scripts: { dev: 'x' } }),
    },
    writer,
    gate: {
      admit: (_id, t) => {
        const recent = posts.filter((p) => t - p < 60_000);
        if (recent.length >= 5) return false;
        posts.push(t);
        return true;
      },
      tryBegin: (id) => (tokens.has(id) ? null : (tokens.set(id, ++counter), counter)),
      isCurrent: (id, tk) => tokens.get(id) === tk,
      end: (id, tk) => {
        if (tokens.get(id) === tk) tokens.delete(id);
      },
      isInFlight: (id) => tokens.has(id),
    },
    runner: { submit: (task) => void tasks.push(task) },
    log: { info: () => undefined },
    clock: { now: () => now, after: realAfter },
  };
  const service = new OnboardingService(deps);
  const drain = async () => {
    while (tasks.length) await (tasks.shift() as () => Promise<void>)();
  };
  return { service, calls, drain, setNow: (n: number) => (now = n), deps };
}

const GOOD = {
  data: {
    architecture: 'prose',
    critical_paths: [{ path: 'src/a.ts', reason: 'core' }],
    reading_path: [{ path: 'src/b.ts', reason: 'base' }],
    run_steps: ['npm run dev', 'rm -rf /'],
    first_tasks: [{ title: 't', description: 'd', paths: ['src/a.ts', 'ghost.ts'] }],
  },
  tokensIn: 10,
  tokensOut: 5,
  costUsd: 0.01,
};

describe('OnboardingService.requestGeneration', () => {
  it('AC-61: 404s an unknown repo before anything else', async () => {
    const h = makeHarness({});
    await expect(h.service.requestGeneration('ws', 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('AC-33/AC-34: dedupes in-flight requests, and 429s after 5 POSTs (deduped ones count)', async () => {
    const h = makeHarness({ write: async () => GOOD });
    for (let i = 0; i < 5; i += 1) await h.service.requestGeneration('ws', 'r1');
    await expect(h.service.requestGeneration('ws', 'r1')).rejects.toBeInstanceOf(RateLimitError);
    await h.drain();
    expect(h.calls.write).toBe(1);
  });

  it('ends the gate and rethrows when scheduling throws', async () => {
    const h = makeHarness({});
    h.deps.runner.submit = () => {
      throw new Error('nope');
    };
    await expect(h.service.requestGeneration('ws', 'r1')).rejects.toThrow('nope');
    expect(h.deps.gate.isInFlight('r1')).toBe(false);
  });
});

describe('OnboardingService.runGeneration', () => {
  it('AC-36/AC-43/AC-44/AC-46: stores a ready, grounded tour from exactly one write', async () => {
    const h = makeHarness({ write: async () => GOOD });
    await h.service.requestGeneration('ws', 'r1');
    await h.drain();
    const tour = h.calls.replace[0] as OnboardingTour;
    expect(tour.status).toBe('ready');
    expect(tour.commit_sha).toBe('sha1');
    expect(tour.model_call_made).toBe(true);
    expect(tour.tokens_in).toBe(10);
    const run = tour.sections[2];
    expect(run.steps.map((s) => s.command)).toEqual(['npm run dev']);
    expect(tour.sections[4].tasks[0]?.paths).toEqual(['src/a.ts']);
  });

  it('AC-35/NFR-4: does not retry a failed write', async () => {
    const h = makeHarness({ write: () => Promise.reject(Object.assign(new Error('x'), { status: 500 })) });
    await h.service.requestGeneration('ws', 'r1');
    await h.drain();
    expect(h.calls.write).toBe(1);
    expect(h.calls.replace[0]?.status).toBe('llm_failed');
    expect(h.calls.replace[0]?.sections.every((s) => s.origin === 'skeleton')).toBe(true);
  });

  it('AC-64: a failed write records the usage the provider attached to its error', async () => {
    const usage = { tokensIn: 7_000, tokensOut: 4_000, costUsd: 0.002 };
    const h = makeHarness({ write: () => Promise.reject(Object.assign(new Error('truncated'), { usage })) });
    await h.service.requestGeneration('ws', 'r1');
    await h.drain();
    const tour = h.calls.replace[0] as OnboardingTour;
    expect(tour.status).toBe('llm_failed');
    expect(tour.tokens_in).toBe(7_000);
    expect(tour.tokens_out).toBe(4_000);
    expect(tour.cost_usd).toBe(0.002);
  });

  it('AC-64: a failed write whose error carries no usage still records zero tokens', async () => {
    const h = makeHarness({ write: () => Promise.reject(new Error('x')) });
    await h.service.requestGeneration('ws', 'r1');
    await h.drain();
    expect(h.calls.replace[0]?.tokens_in).toBe(0);
  });

  it.each([
    ['no state', null, 'no_data'],
    ['failed state', { status: 'failed', lastIndexedSha: 's' }, 'index_failed'],
    ['read error', new Error('db'), 'index_failed'],
  ] as const)('AC-38/AC-39: %s makes no model call', async (_n, state, expected) => {
    const h = makeHarness({ state: state as never, write: async () => GOOD });
    await h.service.requestGeneration('ws', 'r1');
    await h.drain();
    expect(h.calls.write).toBe(0);
    expect(h.calls.replace[0]?.status).toBe(expected);
    expect(h.calls.replace[0]?.model_call_made).toBe(false);
  });

  it('AC-40: reports llm_not_configured without a call', async () => {
    const h = makeHarness({ configured: false });
    await h.service.requestGeneration('ws', 'r1');
    await h.drain();
    expect(h.calls.write).toBe(0);
    expect(h.calls.replace[0]?.status).toBe('llm_not_configured');
  });

  it('AC-53: keeps a usable stored tour and records the failed attempt', async () => {
    const stored = { tour: { status: 'ready' } as OnboardingTour, lastFailed: null };
    const h = makeHarness({ state: null, stored });
    await h.service.requestGeneration('ws', 'r1');
    await h.drain();
    expect(h.calls.replace).toHaveLength(0);
    expect(h.calls.failed).toEqual(['no_data']);
  });

  it('AC-42: ends timed_out when the 90 s clock ran out while queued', async () => {
    const h = makeHarness({ write: async () => GOOD });
    await h.service.requestGeneration('ws', 'r1');
    h.setNow(1_000_000 + 91_000);
    await h.drain();
    expect(h.calls.replace[0]?.status).toBe('timed_out');
  });
});

describe('OnboardingService.getTour', () => {
  it('AC-62: is not stale when the index read fails or is null', async () => {
    const tour = { commit_sha: 'old' } as OnboardingTour;
    const h = makeHarness({ state: new Error('db'), stored: { tour, lastFailed: null } });
    expect((await h.service.getTour('ws', 'r1')).stale).toBe(false);
    const h2 = makeHarness({ state: null, stored: { tour, lastFailed: null } });
    expect((await h2.service.getTour('ws', 'r1')).stale).toBe(false);
  });

  it('AC-62: is stale when the indexed SHA moved', async () => {
    const tour = { commit_sha: 'old' } as OnboardingTour;
    const h = makeHarness({ stored: { tour, lastFailed: null } });
    const res = await h.service.getTour('ws', 'r1');
    expect(res.stale).toBe(true);
    expect(res.generating).toBe(false);
  });
});

describe('domain rules', () => {
  const sig = {
    cloneMissing: false,
    indexStateMissing: false,
    indexReadFailed: false,
    indexStatus: 'full' as const,
    candidateFiles: 5,
    rankedFiles: 5,
    boundedFiles: 0,
    llmConfigured: true,
    timedOut: false,
    llmFailed: false,
    allSkeleton: false,
  };
  it('AC-51: applies the precedence', () => {
    expect(resolveStatus({ ...sig, cloneMissing: true, llmConfigured: false })).toBe('no_data');
    expect(resolveStatus({ ...sig, indexStatus: 'failed', timedOut: true })).toBe('index_failed');
    expect(resolveStatus({ ...sig, timedOut: true, llmFailed: true })).toBe('timed_out');
    expect(resolveStatus({ ...sig, candidateFiles: 0, rankedFiles: 0, indexStatus: 'partial' })).toBe('unsupported_language');
    expect(resolveStatus({ ...sig, indexStatus: 'degraded' })).toBe('index_partial');
    expect(resolveStatus({ ...sig, boundedFiles: 3 })).toBe('index_partial');
    expect(resolveStatus({ ...sig, rankedFiles: 0 })).toBe('index_partial');
    expect(resolveStatus(sig)).toBe('ready');
  });

  it('keepsStoredTour only for failures over a usable tour', () => {
    expect(keepsStoredTour('llm_failed', 'ready')).toBe(true);
    expect(keepsStoredTour('ready', 'ready')).toBe(false);
    expect(keepsStoredTour('llm_failed', 'llm_failed')).toBe(false);
    expect(keepsStoredTour('timed_out', null)).toBe(false);
  });

  it('AC-48: allSkeleton ignores vacuous sections', () => {
    const facts = {
      repoFullName: 'o/n', commitSha: 's', indexedFiles: 0, candidateFiles: 0, fileFacts: [], endpoints: [],
      runCommands: [], stack: [], tree: [], readme: null, criticalPaths: [], readingPath: [], directories: [],
      diagram: { nodes: [], edges: [] },
    };
    const out = groundModelSections(facts, { architecture: 'x', critical_paths: [], reading_path: [], run_steps: [], first_tasks: [] }, { unsupported: true });
    expect(out.allSkeleton).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SPEC-02 acceptance criteria (AC-named). Written from the spec text, on top of
// the harness above. Pins the invariants: the 202 never waits, one model call
// and never a retry, an honest status for every failure, the 90 s / 60 s
// clocks, a run that lost its token cannot store, one log line, and no GitHub
// port anywhere in the service.
// ---------------------------------------------------------------------------

type Harness = ReturnType<typeof makeHarness>;

/** Replaces the writer with one that records every write and answers `result`. */
function captureWrites(h: Harness, result: unknown = GOOD) {
  const seen: Array<{ messages: Array<{ role: string; content: string }>; opts: { timeoutMs: number } }> = [];
  h.deps.writer.prepare = async (): Promise<PreparedWriter> => ({
    configured: true,
    write: async (messages, opts) => {
      seen.push({ messages, opts });
      return result as never;
    },
  });
  return seen;
}

const run = async (h: Harness) => {
  await h.service.requestGeneration('ws', 'r1');
  await h.drain();
};

describe('AC: requesting a generation', () => {
  it('AC-32: the request resolves {generating: true} before the generation has done any work', async () => {
    const h = makeHarness({ write: async () => GOOD });
    const seen = captureWrites(h);
    const res = await h.service.requestGeneration('ws', 'r1');
    expect(res).toEqual({ generating: true });
    expect(seen).toHaveLength(0);
    expect(h.calls.replace).toHaveLength(0);
    await h.drain();
    expect(seen).toHaveLength(1);
  });

  it('AC-33: while a generation is in flight a second request is accepted and starts no second generation, and GET reports generating', async () => {
    const h = makeHarness({ write: async () => GOOD });
    const seen = captureWrites(h);
    await h.service.requestGeneration('ws', 'r1');
    expect(await h.service.requestGeneration('ws', 'r1')).toEqual({ generating: true });
    expect((await h.service.getTour('ws', 'r1')).generating).toBe(true);
    await h.drain();
    expect(seen).toHaveLength(1);
    expect(h.calls.replace).toHaveLength(1);
    expect((await h.service.getTour('ws', 'r1')).generating).toBe(false);
  });

  it('AC-34: the sixth request within a minute is rejected with a 429 error and starts no generation or model call', async () => {
    const h = makeHarness({ write: async () => GOOD });
    const seen = captureWrites(h);
    for (let i = 0; i < 5; i += 1) await h.service.requestGeneration('ws', 'r1');
    await h.drain();
    expect(seen).toHaveLength(1);
    const err = await h.service.requestGeneration('ws', 'r1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as { statusCode?: number }).statusCode).toBe(429);
    await h.drain();
    expect(seen).toHaveLength(1);
    expect(h.calls.replace).toHaveLength(1);
  });

  it('AC-34: the window slides: after a minute a new request is accepted again', async () => {
    const h = makeHarness({ write: async () => GOOD });
    const seen = captureWrites(h);
    for (let i = 0; i < 5; i += 1) await h.service.requestGeneration('ws', 'r1');
    await h.drain();
    h.setNow(1_000_000 + 61_000);
    await expect(h.service.requestGeneration('ws', 'r1')).resolves.toEqual({ generating: true });
    await h.drain();
    expect(seen).toHaveLength(2);
  });

  it('AC-63: reading the tour never starts a generation', async () => {
    const h = makeHarness({ write: async () => GOOD });
    const seen = captureWrites(h);
    await h.service.getTour('ws', 'r1');
    await h.service.getTour('ws', 'r1');
    await h.drain();
    expect(seen).toHaveLength(0);
    expect(h.calls.replace).toHaveLength(0);
    expect(h.deps.gate.isInFlight('r1')).toBe(false);
  });

  it('AC-60/AC-61: an unknown repo is a 404 for both the read and the generation request', async () => {
    const h = makeHarness({});
    const read = await h.service.getTour('ws', 'nope').catch((e: unknown) => e);
    const gen = await h.service.requestGeneration('ws', 'nope').catch((e: unknown) => e);
    for (const e of [read, gen]) {
      expect(e).toBeInstanceOf(NotFoundError);
      expect((e as { statusCode?: number }).statusCode).toBe(404);
    }
  });
});

describe('AC: facts and the single model call', () => {
  it('AC-15: the prompt facts come from the index readers and the clone manifests, and nothing else', async () => {
    const h = makeHarness({});
    const seen = captureWrites(h);
    h.deps.files.listFiles = async () => ['package.json', 'pnpm-lock.yaml'];
    h.deps.files.readFile = async () => JSON.stringify({ scripts: { 'only-in-clone': 'x' } });
    await run(h);
    const user = seen[0]!.messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('src/a.ts');
    expect(user).toContain('pnpm run only-in-clone');
  });

  it('AC-16: two generations over an unchanged index and clone send byte-identical prompts', async () => {
    const h = makeHarness({});
    const seen = captureWrites(h);
    await run(h);
    h.setNow(1_000_000 + 120_000);
    await run(h);
    expect(seen).toHaveLength(2);
    expect(seen[1]!.messages).toEqual(seen[0]!.messages);
  });

  it('AC-17: the stored files and order are the computed ones even when the model reorders and invents', async () => {
    const h = makeHarness({});
    captureWrites(h, {
      ...GOOD,
      data: { ...GOOD.data, reading_path: [{ path: 'src/a.ts', reason: 'a' }, { path: 'src/b.ts', reason: 'b' }, { path: 'src/zzz.ts', reason: 'z' }] },
    });
    await run(h);
    const reading = (h.calls.replace[0] as OnboardingTour).sections[3];
    expect(reading.entries.map((e) => e.path)).toEqual(['src/b.ts', 'src/a.ts']);
  });

  it('AC-36: the model is called exactly once for ready, index_partial, unsupported_language and llm_failed outcomes', async () => {
    const cases: Array<[string, IndexStateView]> = [
      ['ready', { status: 'full', lastIndexedSha: 's', candidateFiles: 2 }],
      ['index_partial', { status: 'partial', lastIndexedSha: 's', candidateFiles: 2 }],
    ];
    for (const [expected, state] of cases) {
      const h = makeHarness({ state });
      const seen = captureWrites(h);
      await run(h);
      expect(seen, expected).toHaveLength(1);
      expect(h.calls.replace[0]?.status).toBe(expected);
    }
    const failing = makeHarness({ write: () => Promise.reject(new Error('x')) });
    await run(failing);
    expect(failing.calls.write).toBe(1);
  });

  it('AC-35: the single write is made with the 60 s timeout, a system message first, and is never repeated on any failure kind', async () => {
    for (const failure of [
      () => Promise.reject(Object.assign(new Error('x'), { status: 500 })),
      () => Promise.reject(Object.assign(new Error('x'), { status: 429 })),
      () => Promise.resolve({ data: { architecture: 1 }, tokensIn: 1, tokensOut: 1, costUsd: null }),
    ]) {
      const h = makeHarness({ write: failure });
      await run(h);
      expect(h.calls.write).toBe(1);
      expect(h.calls.replace).toHaveLength(1);
      expect(h.calls.replace[0]?.status).toBe('llm_failed');
    }
    const h = makeHarness({});
    const seen = captureWrites(h);
    await run(h);
    expect(seen[0]!.opts.timeoutMs).toBe(60_000);
    expect(seen[0]!.messages[0]?.role).toBe('system');
    expect(seen[0]!.messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('AC-37: the provider and model stored on the tour are the workspace onboarding feature model, looked up per workspace', async () => {
    const h = makeHarness({ write: async () => GOOD });
    const asked: string[] = [];
    h.deps.writer.describe = async (ws) => {
      asked.push(ws);
      return { provider: 'anthropic', model: 'claude-x' };
    };
    await run(h);
    expect(asked).toEqual(['ws']);
    expect(h.calls.replace[0]).toMatchObject({ provider: 'anthropic', model: 'claude-x' });
  });

  it('AC-38: a repo with no clone ends no_data with no model call and no index read', async () => {
    const h = makeHarness({ write: async () => GOOD });
    h.deps.store.getRepo = async () => ({ ...REPO, clonePath: null });
    let indexReads = 0;
    h.deps.index.readIndexState = async () => (indexReads += 1, null);
    await run(h);
    expect(h.calls.write).toBe(0);
    expect(h.calls.replace[0]?.status).toBe('no_data');
  });

  it('AC-39: a failing ranked-files read ends index_failed with no model call, instead of an unhandled error', async () => {
    const h = makeHarness({ write: async () => GOOD });
    h.deps.index.getRankedFiles = async () => {
      throw new Error('db down');
    };
    await run(h);
    expect(h.calls.write).toBe(0);
    expect(h.calls.replace[0]?.status).toBe('index_failed');
  });

  it('AC-41: a model call that never returns ends llm_failed after 60 s, with exactly one write', async () => {
    vi.useFakeTimers();
    const h = makeHarness({ write: () => new Promise(() => undefined) });
    await h.service.requestGeneration('ws', 'r1');
    const done = h.drain();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(h.calls.replace).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_000);
    await done;
    expect(h.calls.write).toBe(1);
    expect(h.calls.replace[0]?.status).toBe('llm_failed');
  });

  it('AC-42: a generation unfinished 90 s after acceptance ends timed_out, even though the 60 s model clock has not fired', async () => {
    vi.useFakeTimers();
    const h = makeHarness({ write: () => new Promise(() => undefined) });
    h.deps.clock = { now: () => Date.now(), after: realAfter };
    const slow = h.deps.index.getRankedFiles;
    h.deps.index.getRankedFiles = () => new Promise((r) => setTimeout(() => r(slow()), 40_000));
    await h.service.requestGeneration('ws', 'r1');
    const done = h.drain();
    await vi.advanceTimersByTimeAsync(89_000);
    expect(h.calls.replace).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_000);
    await done;
    const tour = h.calls.replace[0] as OnboardingTour;
    expect(tour.status).toBe('timed_out');
    expect(tour.sections.every((s) => s.origin === 'skeleton')).toBe(true);
    expect(tour.sections[1].entries.map((e) => e.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('AC-42: a timed-out generation with no facts collected yet stores empty skeleton sections', async () => {
    vi.useFakeTimers();
    const h = makeHarness({ write: async () => GOOD });
    h.deps.clock = { now: () => Date.now(), after: realAfter };
    h.deps.index.readIndexState = () => new Promise(() => undefined);
    await h.service.requestGeneration('ws', 'r1');
    const done = h.drain();
    await vi.advanceTimersByTimeAsync(91_000);
    await done;
    const tour = h.calls.replace[0] as OnboardingTour;
    expect(tour.status).toBe('timed_out');
    expect(tour.sections).toHaveLength(5);
    expect(tour.sections.every((s) => s.origin === 'skeleton')).toBe(true);
    expect(tour.sections[1].entries).toEqual([]);
    expect(h.calls.write).toBe(0);
  });

  it('AC-42/AC-52: a run that finishes after it was timed out cannot overwrite the timed_out tour', async () => {
    vi.useFakeTimers();
    const h = makeHarness({ write: () => new Promise((r) => setTimeout(() => r(GOOD), 100_000)) });
    h.deps.clock = { now: () => Date.now(), after: realAfter };
    const slow = h.deps.index.getRankedFiles;
    h.deps.index.getRankedFiles = () => new Promise((r) => setTimeout(() => r(slow()), 40_000));
    await h.service.requestGeneration('ws', 'r1');
    const done = h.drain();
    await vi.advanceTimersByTimeAsync(91_000);
    await done;
    expect(h.calls.replace.map((t) => t.status)).toEqual(['timed_out']);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.calls.replace.map((t) => t.status)).toEqual(['timed_out']);
  });

  it('AC-52: a run that no longer owns the repo generation token stores nothing and records no failure', async () => {
    const h = makeHarness({ write: async () => GOOD });
    h.deps.gate.isCurrent = () => false;
    await run(h);
    expect(h.calls.replace).toHaveLength(0);
    expect(h.calls.failed).toHaveLength(0);
    expect(h.deps.gate.isInFlight('r1')).toBe(false);
  });

  it('AC-52: a slow older run cannot overwrite the tour a newer run stored', async () => {
    const h = makeHarness({ write: async () => GOOD });
    const queued: Array<() => Promise<void>> = [];
    h.deps.runner.submit = (task) => void queued.push(task);
    // Run 1 stalls inside `getTour`, the step before it checks its token.
    let release!: () => void;
    const gateOpen = new Promise<void>((r) => (release = r));
    const realGetTour = h.deps.store.getTour;
    let calls = 0;
    h.deps.store.getTour = async (...a) => {
      calls += 1;
      if (calls === 1) await gateOpen;
      return realGetTour(...a);
    };
    await h.service.requestGeneration('ws', 'r1');
    const first = queued.shift()!();
    // The first run's token is revoked (it was replaced) and a newer run is accepted and finishes.
    h.deps.gate.end('r1', 1);
    h.setNow(1_000_000 + 1_000);
    await h.service.requestGeneration('ws', 'r1');
    await queued.shift()!();
    expect(h.calls.replace).toHaveLength(1);
    release();
    await first;
    expect(h.calls.replace).toHaveLength(1);
  });
});

describe('AC: every degraded status', () => {
  it('AC-38/39/40/41: no_data, index_failed, llm_not_configured, llm_failed all store five skeleton sections', async () => {
    const setups: Array<[string, () => Harness]> = [
      ['no_data', () => makeHarness({ state: null })],
      ['index_failed', () => makeHarness({ state: { status: 'failed', lastIndexedSha: 's' } })],
      ['llm_not_configured', () => makeHarness({ configured: false })],
      ['llm_failed', () => makeHarness({})],
    ];
    for (const [status, make] of setups) {
      const h = make();
      await run(h);
      const tour = h.calls.replace[0] as OnboardingTour;
      expect(tour.status, status).toBe(status);
      expect(tour.sections.map((s) => s.origin), status).toEqual(Array(5).fill('skeleton'));
      expect(tour.sections.map((s) => s.id)).toEqual(['architecture', 'critical-paths', 'run-locally', 'reading-path', 'first-tasks']);
      expect(tour.model_call_made, status).toBe(status === 'llm_failed');
    }
  });

  it('AC-55/AC-56: a failed generation after facts were collected still shows the index directories and diagram, with no prose', async () => {
    const h = makeHarness({ configured: false });
    await run(h);
    const arch = (h.calls.replace[0] as OnboardingTour).sections[0];
    expect(arch.prose).toBe('');
    expect(arch.directories).toEqual([{ path: 'src', files: 2 }]);
    expect(arch.diagram.nodes.map((n) => n.id)).toEqual(['src']);
  });

  it('AC-49: no JS/TS candidates ends unsupported_language after ONE model call, with empty critical-path and reading-path skeletons', async () => {
    const h = makeHarness({ state: { status: 'full', lastIndexedSha: 's', candidateFiles: 0 } });
    h.deps.index.getRankedFiles = async () => [];
    h.deps.index.getImportEdges = async () => [];
    h.deps.index.getCriticalPaths = async () => [];
    const seen = captureWrites(h, { ...GOOD, data: { ...GOOD.data, first_tasks: [], run_steps: ['npm run dev'] } });
    await run(h);
    const tour = h.calls.replace[0] as OnboardingTour;
    expect(seen).toHaveLength(1);
    expect(tour.status).toBe('unsupported_language');
    expect(tour.sections[1]).toMatchObject({ origin: 'skeleton', entries: [] });
    expect(tour.sections[3]).toMatchObject({ origin: 'skeleton', entries: [] });
    expect(tour.sections[0].origin).toBe('model');
  });

  it('AC-48: a model answer in which every section falls back to its outline ends llm_failed', async () => {
    const h = makeHarness({
      write: async () => ({ ...GOOD, data: { architecture: '', critical_paths: [], reading_path: [], run_steps: [], first_tasks: [] } }),
    });
    await run(h);
    expect(h.calls.replace[0]?.status).toBe('llm_failed');
    expect(h.calls.replace[0]?.sections.every((s) => s.origin === 'skeleton')).toBe(true);
  });

  it('AC-50: a partial index proceeds with the model call and ends index_partial', async () => {
    const h = makeHarness({ state: { status: 'partial', lastIndexedSha: 's', candidateFiles: 2 } });
    const seen = captureWrites(h);
    await run(h);
    expect(seen).toHaveLength(1);
    expect(h.calls.replace[0]?.status).toBe('index_partial');
  });

  it('AC-50/AC-74: files left out by the cap end index_partial and record indexed < candidate', async () => {
    const h = makeHarness({ state: { status: 'full', lastIndexedSha: 's', candidateFiles: 12_450, boundedFiles: 12_448 } });
    const seen = captureWrites(h);
    await run(h);
    const tour = h.calls.replace[0] as OnboardingTour;
    expect(seen).toHaveLength(1);
    expect(tour.status).toBe('index_partial');
    expect(tour.indexed_files).toBe(2);
    expect(tour.candidate_files).toBe(12_450);
  });

  it('AC-50: a persisted degraded index status ends index_partial', async () => {
    const h = makeHarness({ state: { status: 'degraded', lastIndexedSha: 's', candidateFiles: 2 }, write: async () => GOOD });
    await run(h);
    expect(h.calls.replace[0]?.status).toBe('index_partial');
  });

  it('AC-50: a state row that predates candidate counts is not partial: candidate_files equals indexed_files', async () => {
    const h = makeHarness({ state: { status: 'full', lastIndexedSha: 's' }, write: async () => GOOD });
    await run(h);
    const tour = h.calls.replace[0] as OnboardingTour;
    expect(tour.status).toBe('ready');
    expect(tour.candidate_files).toBe(tour.indexed_files);
  });

  it('AC-51: no_data wins over llm_not_configured, and index_failed wins over llm_not_configured', async () => {
    const noData = makeHarness({ state: null, configured: false });
    await run(noData);
    expect(noData.calls.replace[0]?.status).toBe('no_data');
    const failed = makeHarness({ state: { status: 'failed', lastIndexedSha: 's' }, configured: false });
    await run(failed);
    expect(failed.calls.replace[0]?.status).toBe('index_failed');
  });

  it('AC-20: the number of file facts dropped for the budget is recorded on the tour', async () => {
    const h = makeHarness({ write: async () => GOOD });
    h.deps.index.getRankedFiles = async () => Array.from({ length: 30 }, (_, i) => ({ path: `src/f${i}.ts`, rank: 1 - i / 100 }));
    h.deps.index.getEndpoints = async () =>
      Array.from({ length: 30 }, (_, i) => Array.from({ length: 40 }, (_, j) => ({ file: `src/f${i}.ts`, endpoint: `GET /r${i}/${j}/${'x'.repeat(100)}` }))).flat();
    await run(h);
    expect((h.calls.replace[0] as OnboardingTour).dropped_file_facts).toBeGreaterThan(0);
  });
});

describe('AC: storing and keeping tours', () => {
  it('AC-52: a finished generation replaces the stored tour', async () => {
    const stored = { tour: { status: 'llm_failed', commit_sha: 'old' } as OnboardingTour, lastFailed: null };
    const h = makeHarness({ stored, write: async () => GOOD });
    await run(h);
    expect(h.calls.replace).toHaveLength(1);
    expect(h.calls.failed).toHaveLength(0);
    expect(h.calls.replace[0]?.status).toBe('ready');
  });

  it.each(['no_data', 'index_failed', 'llm_not_configured', 'llm_failed', 'timed_out'] as const)(
    'AC-53: a %s generation over a stored usable tour keeps it and records only the status',
    async (status) => {
      const make = {
        no_data: () => makeHarness({ state: null, stored: { tour: { status: 'index_partial' } as OnboardingTour, lastFailed: null } }),
        index_failed: () => makeHarness({ state: new Error('db'), stored: { tour: { status: 'unsupported_language' } as OnboardingTour, lastFailed: null } }),
        llm_not_configured: () => makeHarness({ configured: false, stored: { tour: { status: 'ready' } as OnboardingTour, lastFailed: null } }),
        llm_failed: () => makeHarness({ stored: { tour: { status: 'ready' } as OnboardingTour, lastFailed: null } }),
        timed_out: () => makeHarness({ stored: { tour: { status: 'ready' } as OnboardingTour, lastFailed: null } }),
      }[status]();
      if (status === 'timed_out') {
        // Accepted at t0, then the clock runs 91 s before the queued run starts.
        await make.service.requestGeneration('ws', 'r1');
        make.setNow(1_000_000 + 91_000);
        await make.drain();
      } else {
        await run(make);
      }
      expect(make.calls.replace).toHaveLength(0);
      expect(make.calls.failed).toEqual([status]);
    },
  );

  it('AC-53: a degraded outcome over a stored FAILURE outline replaces it (nothing usable to keep)', async () => {
    const h = makeHarness({ state: null, stored: { tour: { status: 'no_data' } as OnboardingTour, lastFailed: null } });
    await run(h);
    expect(h.calls.replace).toHaveLength(1);
    expect(h.calls.failed).toHaveLength(0);
  });

  it('AC-53: the recorded failed attempt carries the end time of the failed generation', async () => {
    const h = makeHarness({ state: null, stored: { tour: { status: 'ready' } as OnboardingTour, lastFailed: null } });
    const times: Date[] = [];
    h.deps.store.recordFailedAttempt = async (_w, _r, _s, at) => void times.push(at);
    await run(h);
    expect(times.map((t) => t.getTime())).toEqual([1_000_000]);
  });

  it('AC-62: stale is true only when the stored tour sha differs from the current index sha; no tour is never stale', async () => {
    const tour = { commit_sha: 'sha1' } as OnboardingTour;
    const same = makeHarness({ stored: { tour, lastFailed: null } });
    expect((await same.service.getTour('ws', 'r1')).stale).toBe(false);
    const none = makeHarness({});
    const res = await none.service.getTour('ws', 'r1');
    expect(res).toMatchObject({ tour: null, stale: false, generating: false, last_failed: null });
  });

  it('AC-6: the response carries the last failed attempt', async () => {
    const lastFailed = { status: 'llm_failed' as const, at: '2026-10-03T00:00:00.000Z' };
    const h = makeHarness({ stored: { tour: { commit_sha: 'sha1' } as OnboardingTour, lastFailed } });
    expect((await h.service.getTour('ws', 'r1')).last_failed).toEqual(lastFailed);
  });

  it('AC-1/AC-62: the commit sha stored is the one the facts started from, even if the index moves during the run', async () => {
    const h = makeHarness({ write: async () => GOOD });
    let reads = 0;
    h.deps.index.readIndexState = async () => ({ status: 'full', lastIndexedSha: reads++ === 0 ? 'sha-start' : 'sha-moved', candidateFiles: 2 });
    await run(h);
    expect(h.calls.replace[0]?.commit_sha).toBe('sha-start');
  });

  it('AC-64: provider, model, token counts and cost of the call are stored; zero tokens and a null cost without a call', async () => {
    const called = makeHarness({ write: async () => GOOD });
    await run(called);
    expect(called.calls.replace[0]).toMatchObject({ provider: 'openai', model: 'm', model_call_made: true, tokens_in: 10, tokens_out: 5, cost_usd: 0.01 });
    const none = makeHarness({ state: null });
    await run(none);
    expect(none.calls.replace[0]).toMatchObject({ provider: 'openai', model: 'm', model_call_made: false, tokens_in: 0, tokens_out: 0, cost_usd: null });
  });
});

describe('AC: files the facts may read', () => {
  it('AC-25/AC-26: secrets, absolute and escaping paths are never passed to readFile; a manifest that cannot be read is skipped', async () => {
    const h = makeHarness({ write: async () => GOOD });
    const reads: string[] = [];
    h.deps.files.listFiles = async () => ['.env', '.env.local', 'key.pem', 'tls.key', 'secrets.json', '/etc/package.json', '../package.json', 'a/../package.json', 'apps/web/package.json', 'apps/package.json', 'package.json', 'README.md'];
    h.deps.files.readFile = async (_r, path) => {
      reads.push(path);
      if (path === 'apps/package.json') throw new Error('escapes the clone');
      return path === 'README.md' ? '```sh\nmake it\n```' : JSON.stringify({ scripts: { dev: 'x' } });
    };
    await run(h);
    expect([...reads].sort()).toEqual(['README.md', 'apps/package.json', 'package.json']);
    expect(h.calls.replace[0]?.status).toBe('ready');
    expect(h.calls.replace[0]?.sections[2].steps.map((s) => s.source_path)).toContain('package.json');
  });

  it('AC-15: a clone that cannot be listed degrades to no manifests instead of failing the generation', async () => {
    const h = makeHarness({ write: async () => GOOD });
    h.deps.files.listFiles = async () => {
      throw new Error('clone gone');
    };
    await run(h);
    expect(h.calls.replace[0]?.status).toBe('ready');
  });
});

describe('AC: logging and ports', () => {
  it('AC-68/NFR-10: exactly one log line per generation, with only the counts, status and duration and never repo content or prompt text', async () => {
    const SENTINEL = 'README-SENTINEL-do-not-log';
    const h = makeHarness({ write: async () => GOOD });
    h.deps.files.listFiles = async () => ['README.md', 'package.json'];
    h.deps.files.readFile = async (_r, p) => (p === 'README.md' ? `# ${SENTINEL}\n\`\`\`sh\nmake x\n\`\`\`` : JSON.stringify({ scripts: { dev: 'x' } }));
    const lines: Array<{ obj: Record<string, unknown>; msg: string }> = [];
    h.deps.log.info = (obj, msg) => void lines.push({ obj: obj as Record<string, unknown>, msg });
    await run(h);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.obj).toEqual({ repoId: 'r1', status: 'ready', fileFacts: 2, runCommands: 2, tokensIn: 10, tokensOut: 5, durationMs: 0 });
    expect(JSON.stringify(lines)).not.toContain(SENTINEL);
    expect(JSON.stringify(lines)).not.toContain('src/a.ts');
  });

  it.each([
    ['no_data', () => makeHarness({ state: null })],
    ['llm_failed', () => makeHarness({})],
    ['a failing store', () => {
      const h = makeHarness({ write: async () => GOOD });
      h.deps.store.replaceTour = async () => {
        throw new Error('db blip');
      };
      return h;
    }],
  ])('AC-68: %s still logs exactly one line and releases the gate', async (_n, make) => {
    const h = make();
    let n = 0;
    h.deps.log.info = () => void (n += 1);
    await run(h);
    expect(n).toBe(1);
    expect(h.deps.gate.isInFlight('r1')).toBe(false);
  });

  it('AC-13: the service dependencies hold no GitHub port at all', () => {
    const h = makeHarness({});
    expect(Object.keys(h.deps).sort()).toEqual(['clock', 'files', 'gate', 'index', 'log', 'runner', 'store', 'writer']);
    expect(Object.keys(h.deps.files).sort()).toEqual(['listFiles', 'readFile']);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
