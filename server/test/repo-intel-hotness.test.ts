/**
 * SPEC-02 hotness and rank rules (AC-9, AC-10, AC-11, AC-14) on the pure
 * functions. The pipeline wiring (AC-7, AC-13, AC-106) lives in
 * repo-intel-hotness-pipeline.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { computeHotness } from '../src/modules/repo-intel/pipeline/hotness.js';
import { computeFileRank } from '../src/modules/repo-intel/pipeline/rank.js';

const FILES = ['a.ts', 'b.ts', 'c.ts', 'd.ts'];
const EDGES = [
  { fromFile: 'a.ts', toFile: 'b.ts' },
  { fromFile: 'c.ts', toFile: 'b.ts' },
];

describe('computeHotness (SPEC-02)', () => {
  it('AC-9: hotness is the commit count divided by the highest count of any indexed file', () => {
    const h = computeHotness(FILES, { 'a.ts': 10, 'b.ts': 5, 'c.ts': 1 });
    expect(h.get('a.ts')).toBe(1);
    expect(h.get('b.ts')).toBe(0.5);
    expect(h.get('c.ts')).toBeCloseTo(0.1, 12);
    expect(h.get('d.ts')).toBe(0);
  });

  it('AC-9: the maximum is taken over indexed files only, not over every counted path', () => {
    const h = computeHotness(['a.ts'], { 'a.ts': 2, 'not-indexed.md': 100 });
    expect(h.get('a.ts')).toBe(1);
  });

  it('AC-10: when no indexed file has a counted commit, every hotness is 0', () => {
    const h = computeHotness(FILES, { 'elsewhere.md': 7 });
    expect([...h.values()]).toEqual([0, 0, 0, 0]);
    expect([...computeHotness(FILES, {}).values()]).toEqual([0, 0, 0, 0]);
  });

  it('AC-14: the same counts give identical hotness values on repeated runs', () => {
    const counts = { 'a.ts': 3, 'b.ts': 9 };
    expect([...computeHotness(FILES, counts)]).toEqual([...computeHotness(FILES, counts)]);
  });
});

describe('computeFileRank with hotness (SPEC-02)', () => {
  it('AC-11: rank equals PageRank x (1 + hotness)', () => {
    const plain = computeFileRank(FILES, EDGES);
    const hot = new Map([['a.ts', 1], ['b.ts', 0.5], ['c.ts', 0], ['d.ts', 0.25]]);
    const rows = computeFileRank(FILES, EDGES, hot);
    for (const row of rows) {
      const base = plain.find((p) => p.filePath === row.filePath)!.pagerank;
      expect(row.rank).toBeCloseTo(base * (1 + hot.get(row.filePath)!), 12);
    }
  });

  it('AC-11: without hotness the rank is the plain PageRank', () => {
    for (const r of computeFileRank(FILES, EDGES)) expect(r.rank).toBe(r.pagerank);
  });

  it('AC-11: the percentile is computed from rank, so a hot file can overtake a higher-PageRank file', () => {
    const files = ['x.ts', 'y.ts'];
    const edges = [{ fromFile: 'y.ts', toFile: 'x.ts' }]; // x has the higher PageRank
    const cold = computeFileRank(files, edges);
    expect(cold.find((r) => r.filePath === 'x.ts')!.percentile).toBeGreaterThan(cold.find((r) => r.filePath === 'y.ts')!.percentile);
    const hot = computeFileRank(files, edges, new Map([['y.ts', 1], ['x.ts', 0]]));
    const x = hot.find((r) => r.filePath === 'x.ts')!;
    const y = hot.find((r) => r.filePath === 'y.ts')!;
    expect(y.rank).toBeCloseTo(y.pagerank * 2, 12);
    expect(y.rank).toBeGreaterThan(x.rank);
    expect(y.percentile).toBeGreaterThan(x.percentile);
  });

  it('AC-14: identical inputs give identical ranks', () => {
    const hot = new Map([['a.ts', 1]]);
    expect(computeFileRank(FILES, EDGES, hot)).toEqual(computeFileRank(FILES, EDGES, hot));
  });
});
