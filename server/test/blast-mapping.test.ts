import { describe, it, expect } from 'vitest';
import { buildSummary, refineDegradation, toBlastRadius } from '../src/modules/blast/helpers.js';
import type { BlastFacadeResult } from '../src/modules/blast/ports.js';

/**
 * `toBlastRadius` — the flat facade `callers[]` (one row per caller, pointing
 * at `viaSymbol`) → the grouped `downstream[]` contract. This is the
 * module's core job (P2 acceptance).
 */
describe('blast/helpers — toBlastRadius', () => {
  it('groups callers by viaSymbol, in the facade rank order', () => {
    const result: BlastFacadeResult = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'symA', kind: 'function' },
        { file: 'src/b.ts', name: 'symB', kind: 'function' },
      ],
      callers: [
        { file: 'src/caller1.ts', symbol: 'caller1Fn', viaSymbol: 'symB', line: 5, rank: 90 },
        { file: 'src/caller2.ts', symbol: 'caller2Fn', viaSymbol: 'symA', line: 10, rank: 80 },
        { file: 'src/caller3.ts', symbol: 'caller3Fn', viaSymbol: 'symB', line: 15, rank: 70 },
      ],
      impactedEndpoints: [],
      degraded: false,
    };

    const blast = toBlastRadius(result);
    // symB appears first because its first (highest-ranked) caller comes first.
    expect(blast.downstream.map((d) => d.symbol)).toEqual(['symB', 'symA']);
    expect(blast.downstream[0]!.callers).toHaveLength(2);
    expect(blast.downstream[0]!.callers.map((c) => c.name)).toEqual(['caller1Fn', 'caller3Fn']);
    expect(blast.downstream[1]!.callers[0]!.name).toBe('caller2Fn');
  });

  it('drops a caller whose file declares the symbol it supposedly calls (self-file exclusion)', () => {
    // Persistent-shaped input: the facade does NOT drop the declaring file on
    // its own (only the ripgrep fallback does) — the filter here is required.
    const result: BlastFacadeResult = {
      changedSymbols: [{ file: 'src/shared.ts', name: 'helper', kind: 'function' }],
      callers: [
        { file: 'src/shared.ts', symbol: 'helper', viaSymbol: 'helper', line: 20, rank: 50 },
        { file: 'src/consumer.ts', symbol: 'useHelper', viaSymbol: 'helper', line: 8, rank: 40 },
      ],
      impactedEndpoints: [],
      degraded: false,
    };

    const blast = toBlastRadius(result);
    expect(blast.downstream).toHaveLength(1);
    expect(blast.downstream[0]!.callers).toHaveLength(1);
    expect(blast.downstream[0]!.callers[0]!.file).toBe('src/consumer.ts');
  });

  it('appends caller-less changed symbols as empty groups, deduplicated by name', () => {
    const result: BlastFacadeResult = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'used', kind: 'function' },
        { file: 'src/a.ts', name: 'unused', kind: 'function' },
        { file: 'src/b.ts', name: 'unused', kind: 'function' }, // same name, different file
      ],
      callers: [{ file: 'src/caller.ts', symbol: 'callerFn', viaSymbol: 'used', line: 1, rank: 10 }],
      impactedEndpoints: [],
      degraded: false,
    };

    const blast = toBlastRadius(result);
    expect(blast.downstream.map((d) => d.symbol)).toEqual(['used', 'unused']);
    expect(blast.downstream[1]!.callers).toEqual([]);
    expect(blast.downstream[1]!.endpoints_affected).toEqual([]);
  });

  it('attributes each caller its own file facts, and unions them into the group', () => {
    const result: BlastFacadeResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'symA', kind: 'function' }],
      callers: [
        { file: 'src/api.ts', symbol: 'handler', viaSymbol: 'symA', line: 1, rank: 20 },
        { file: 'src/cron.ts', symbol: 'job', viaSymbol: 'symA', line: 2, rank: 10 },
      ],
      impactedEndpoints: ['GET /x'],
      factsByFile: {
        'src/api.ts': { endpoints: ['GET /x'], crons: [] },
        'src/cron.ts': { endpoints: [], crons: ['nightly-sync'] },
      },
      degraded: false,
    };

    const blast = toBlastRadius(result);
    const group = blast.downstream[0]!;
    expect(group.callers[0]).toMatchObject({ name: 'handler', endpoints: ['GET /x'], crons: [] });
    expect(group.callers[1]).toMatchObject({ name: 'job', endpoints: [], crons: ['nightly-sync'] });
    expect(group.endpoints_affected).toEqual(['GET /x']);
    expect(group.crons_affected).toEqual(['nightly-sync']);
  });

  it('passes degraded/reason through untouched', () => {
    const result: BlastFacadeResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    };
    const blast = toBlastRadius(result);
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('no_data');
  });

  it('omits degraded/reason when the facade result carries neither', () => {
    const result: BlastFacadeResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };
    const blast = toBlastRadius(result);
    expect(blast.degraded).toBeUndefined();
    expect(blast.reason).toBeUndefined();
  });
});

describe('blast/helpers — buildSummary', () => {
  it('counts symbols, total callers, and the deduplicated endpoint/cron unions', () => {
    const result: BlastFacadeResult = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'symA', kind: 'function' },
        { file: 'src/b.ts', name: 'symB', kind: 'function' },
      ],
      callers: [
        { file: 'src/x.ts', symbol: 'x', viaSymbol: 'symA', line: 1, rank: 2 },
        { file: 'src/y.ts', symbol: 'y', viaSymbol: 'symB', line: 2, rank: 1 },
      ],
      impactedEndpoints: ['GET /x'],
      factsByFile: {
        'src/x.ts': { endpoints: ['GET /x'], crons: [] },
        'src/y.ts': { endpoints: ['GET /x'], crons: ['nightly'] }, // same endpoint — union, not sum
      },
      degraded: false,
    };
    const blast = toBlastRadius(result);
    expect(blast.summary).toBe('2 symbols · 2 callers · 1 endpoints · 1 crons');
  });
});

describe('blast/helpers — refineDegradation', () => {
  const base: BlastFacadeResult = { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false };

  it('partial index → index_partial, even though the facade itself said degraded:false', () => {
    const refined = refineDegradation(base, { status: 'partial' });
    expect(refined.degraded).toBe(true);
    expect(refined.reason).toBe('index_partial');
  });

  it('failed index → index_failed', () => {
    const refined = refineDegradation(base, { status: 'failed' });
    expect(refined.degraded).toBe(true);
    expect(refined.reason).toBe('index_failed');
  });

  it('a full index leaves the facade result untouched', () => {
    const refined = refineDegradation(base, { status: 'full' });
    expect(refined).toBe(base);
  });

  it("a synthesised 'degraded' status (e.g. no_data) leaves the facade's own reason as-is", () => {
    const noData: BlastFacadeResult = { ...base, degraded: true, reason: 'no_data' };
    const refined = refineDegradation(noData, { status: 'degraded' });
    expect(refined.reason).toBe('no_data');
  });
});
