import { describe, it, expect } from 'vitest';
import { MAX_PARALLEL_AGENTS } from '../src/modules/reviews/constants.js';
import { dedupeIds, isUuid, runInSlots } from '../src/modules/reviews/helpers.js';

/** A promise the test settles by hand. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('runInSlots', () => {
  it('never runs more than the limit, starts in request order and isolates a failing item', async () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const gates = new Map(items.map((i) => [i, deferred()]));
    const startOrder: string[] = [];
    const finished: string[] = [];
    let maxRunning = 0;

    const done = runInSlots(items, 4, {
      start: async (item) => {
        startOrder.push(item);
        return true;
      },
      run: async (item, state) => {
        maxRunning = Math.max(maxRunning, state.running);
        await gates.get(item)!.promise;
        finished.push(item);
      },
    });

    await tick();
    // The first four are claimed together; e and f wait for a free slot.
    expect(startOrder).toEqual(['a', 'b', 'c', 'd']);

    gates.get('b')!.reject(new Error('boom'));
    await tick();
    expect(startOrder).toEqual(['a', 'b', 'c', 'd', 'e']);

    gates.get('a')!.resolve();
    await tick();
    expect(startOrder).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);

    for (const g of ['c', 'd', 'e', 'f']) gates.get(g)!.resolve();
    await done;

    expect(maxRunning).toBe(4);
    expect(finished.sort()).toEqual(['a', 'c', 'd', 'e', 'f']);
  });

  it('skips an item whose start returns false and still runs the rest', async () => {
    const ran: string[] = [];
    await runInSlots(['a', 'b', 'c'], 2, {
      start: async (item) => item !== 'a',
      run: async (item) => {
        ran.push(item);
      },
    });
    expect(ran.sort()).toEqual(['b', 'c']);
  });
});

describe('runInSlots - SPEC-05 launch semantics', () => {
  it('pins the launch concurrency cap at 4 (AC-20, NFR-1)', () => {
    expect(MAX_PARALLEL_AGENTS).toBe(4);
  });

  it('runs 3 items all at once: every one is running before any settles (AC-21)', async () => {
    const gates = [deferred(), deferred(), deferred()];
    let running = 0;
    let peak = 0;
    const done = runInSlots([0, 1, 2], MAX_PARALLEL_AGENTS, {
      start: async () => true,
      run: async (i, state) => {
        running = state.running;
        peak = Math.max(peak, state.running);
        await gates[i]!.promise;
      },
    });
    await tick();
    expect(peak).toBe(3);
    expect(running).toBeGreaterThan(0);
    gates.forEach((g) => g.resolve());
    await done;
  });

  it('keeps 6 items at no more than 4 running and starts the fifth in request order when one settles (AC-20, AC-22)', async () => {
    const items = [1, 2, 3, 4, 5, 6];
    const gates = new Map(items.map((i) => [i, deferred()]));
    const started: number[] = [];
    let peak = 0;
    const done = runInSlots(items, MAX_PARALLEL_AGENTS, {
      start: async (i) => {
        started.push(i);
        return true;
      },
      run: async (i, state) => {
        peak = Math.max(peak, state.running);
        await gates.get(i)!.promise;
      },
    });
    await tick();
    expect(started).toEqual([1, 2, 3, 4]);
    gates.get(3)!.resolve();
    await tick();
    expect(started).toEqual([1, 2, 3, 4, 5]);
    for (const i of items) gates.get(i)!.resolve();
    await done;
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('a start that throws skips that item and still runs the others (AC-23)', async () => {
    const ran: string[] = [];
    await runInSlots(['a', 'b', 'c'], 2, {
      start: async (i) => {
        if (i === 'a') throw new Error('db down');
        return true;
      },
      run: async (i) => {
        ran.push(i);
      },
    });
    expect(ran.sort()).toEqual(['b', 'c']);
  });

  it('resolves immediately for no items', async () => {
    await expect(runInSlots([], 4, { start: async () => true, run: async () => undefined })).resolves.toBeUndefined();
  });
});

describe('dedupeIds / isUuid', () => {
  it('keeps the first occurrence in request order', () => {
    expect(dedupeIds(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
  });

  it('accepts uuids only', () => {
    expect(isUuid('3f2b8c1e-5d4a-4e7b-9a10-0c6d2b7e8f19')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});
