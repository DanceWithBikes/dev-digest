/**
 * Regression: `MAX_CALLERS_PER_SYMBOL` must cap callers PER `viaSymbol`, not
 * with one global `slice()` over the whole (rank-sorted) caller list. A global
 * slice lets a high-fan-out symbol starve every other changed symbol's
 * callers entirely — see `docs/insights.md`.
 *
 * No Postgres: `RepoIntelService#repo` is patched directly with fakes (same
 * technique as `repo-intel-facade-degraded.test.ts`), so both the persistent
 * (`tryPersistentBlast`) and ripgrep-fallback paths are unit-testable.
 */
import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';

describe('RepoIntel facade — per-symbol caller cap', () => {
  it('persistent index: 25 callers for symbol A + 3 for symbol B → 20 A + 3 B', async () => {
    const container = { config: { repoIntelEnabled: true }, db: {} as never } as never;
    const svc = new RepoIntelService(container);

    const declRows = [
      { path: 'src/shared.ts', name: 'symbolA', kind: 'function', line: 1, endLine: 1, exported: true, signature: null },
      { path: 'src/shared.ts', name: 'symbolB', kind: 'function', line: 10, endLine: 10, exported: true, signature: null },
    ];
    const callerRows = [
      ...Array.from({ length: 25 }, (_, i) => ({
        fromPath: `src/callerA-${i}.ts`,
        toSymbol: 'symbolA',
        line: 1,
        rank: 25 - i,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        fromPath: `src/callerB-${i}.ts`,
        toSymbol: 'symbolB',
        line: 1,
        rank: 3 - i,
      })),
    ];

    (svc as unknown as { repo: Record<string, unknown> }).repo = {
      tryGetIndexState: async () => ({ status: 'full' }),
      getSymbolRows: async (_repoId: string, paths: string[]) =>
        paths.includes('src/shared.ts') ? declRows : [],
      getResolvedCallers: async () => callerRows,
      getFileFacts: async () => [],
    };

    const blast = await svc.getBlastRadius('r1', ['src/shared.ts']);
    const aCallers = blast.callers.filter((c) => c.viaSymbol === 'symbolA');
    const bCallers = blast.callers.filter((c) => c.viaSymbol === 'symbolB');
    expect(aCallers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(bCallers).toHaveLength(3);
    expect(blast.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL + 3);
    expect(blast.degraded).toBe(false);
  });

  it('ripgrep fallback (no persistent index): same per-symbol cap applies', async () => {
    const container = {
      config: { repoIntelEnabled: true },
      db: {} as never,
      codeIndex: {
        symbols: async () => [
          { path: 'src/shared.ts', name: 'symbolA', kind: 'function', line: 1 },
          { path: 'src/shared.ts', name: 'symbolB', kind: 'function', line: 10 },
        ],
        references: async (_repo: unknown, symbol: string) => {
          const count = symbol === 'symbolA' ? 25 : symbol === 'symbolB' ? 3 : 0;
          return Array.from({ length: count }, (_, i) => ({
            fromPath: `src/caller-${symbol}-${i}.ts`,
            toSymbol: symbol,
            line: 1,
          }));
        },
      },
    } as never;
    const svc = new RepoIntelService(container);
    (svc as unknown as { repo: Record<string, unknown> }).repo = {
      getRepoBasics: async () => ({
        id: 'r1',
        owner: 'a',
        name: 'b',
        defaultBranch: 'main',
        clonePath: '/tmp/does-not-exist',
      }),
      tryGetIndexState: async () => null, // no persistent index → falls to ripgrep
    };

    const blast = await svc.getBlastRadius('r1', ['src/shared.ts']);
    const aCallers = blast.callers.filter((c) => c.viaSymbol === 'symbolA');
    const bCallers = blast.callers.filter((c) => c.viaSymbol === 'symbolB');
    expect(aCallers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(bCallers).toHaveLength(3);
  });
});
