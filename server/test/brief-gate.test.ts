/** Pins InMemoryBriefGate (SPEC-03 AC-47..AC-49): rate window, tokens and bounded memory. */
import { describe, it, expect } from 'vitest';
import { InMemoryBriefGate } from '../src/modules/brief/gate.js';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from '../src/modules/brief/constants.js';

const posts = (g: InMemoryBriefGate) => (g as unknown as { posts: Map<string, number[]> }).posts;

describe('InMemoryBriefGate.admit', () => {
  it('admits RATE_LIMIT_MAX POSTs per window and rejects the next, including rejected ones', () => {
    const g = new InMemoryBriefGate();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) expect(g.admit('ws', 1000 + i)).toBe(true);
    expect(g.admit('ws', 2000)).toBe(false);
    expect(g.admit('ws', 2001)).toBe(false);
  });

  it('admits again once the window has passed', () => {
    const g = new InMemoryBriefGate();
    for (let i = 0; i < RATE_LIMIT_MAX + 1; i++) g.admit('ws', 1000);
    expect(g.admit('ws', 1000 + RATE_LIMIT_WINDOW_MS)).toBe(true);
  });

  it('counts per workspace', () => {
    const g = new InMemoryBriefGate();
    for (let i = 0; i < RATE_LIMIT_MAX + 1; i++) g.admit('a', 1000);
    expect(g.admit('b', 1000)).toBe(true);
  });

  it('keeps at most RATE_LIMIT_MAX + 1 timestamps under a flood and still rejects', () => {
    const g = new InMemoryBriefGate();
    for (let i = 0; i < 500; i++) expect(g.admit('ws', 1000 + i) || i < RATE_LIMIT_MAX).toBe(i < RATE_LIMIT_MAX ? true : false);
    expect(posts(g).get('ws')!.length).toBe(RATE_LIMIT_MAX + 1);
  });

  it('decides the same after a flood once only the newest timestamps remain in the window', () => {
    const g = new InMemoryBriefGate();
    for (let i = 0; i < 100; i++) g.admit('ws', 1000 + i); // newest at 1099
    expect(g.admit('ws', 1000 + RATE_LIMIT_WINDOW_MS + 50)).toBe(false); // 1099 still in window
    expect(g.admit('ws', 1099 + RATE_LIMIT_WINDOW_MS + 1000)).toBe(true);
  });

  it('drops the key of a workspace whose window has fully expired', () => {
    const g = new InMemoryBriefGate();
    g.admit('gone', 1000);
    g.admit('other', 1000 + RATE_LIMIT_WINDOW_MS + 1);
    expect(posts(g).has('gone')).toBe(false);
    expect(posts(g).has('other')).toBe(true);
  });
});

describe('InMemoryBriefGate tokens', () => {
  it('blocks a second begin for the same PR until end, and only the current token ends it', () => {
    const g = new InMemoryBriefGate();
    const t = g.tryBegin('pr')!;
    expect(g.tryBegin('pr')).toBeNull();
    g.end('pr', t + 1);
    expect(g.isCurrent('pr', t)).toBe(true);
    g.end('pr', t);
    expect(g.isCurrent('pr', t)).toBe(false);
    expect(g.tryBegin('pr')).not.toBeNull();
  });
});
