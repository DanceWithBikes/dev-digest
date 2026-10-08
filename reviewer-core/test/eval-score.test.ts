import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { EvalExpectation, Finding } from '@devdigest/shared';
import { rangesIntersect, matchesExpectation, scoreCase, scoreBatch } from '../src/index.js';

const finding = (id: string, file: string, s: number, e = s): Finding => ({
  id,
  severity: 'WARNING',
  category: 'security',
  title: id,
  file,
  start_line: s,
  end_line: e,
  rationale: 'r',
  confidence: 0.9,
});
const exp = (kind: EvalExpectation['kind'], file: string, s: number, e: number): EvalExpectation => ({
  kind,
  file,
  start_line: s,
  end_line: e,
});

// AC-20 fixture
const caseA = () =>
  scoreCase(
    [exp('must_find', 'src/config.ts', 12, 12)],
    [finding('a1', 'src/config.ts', 11, 13), finding('a2', 'src/api/users.ts', 47)],
    1,
  );
const caseB = () =>
  scoreCase(
    [exp('must_not_flag', 'src/api/users.ts', 45, 52)],
    [finding('b1', 'src/api/users.ts', 50)],
    0,
  );
const caseC = () => scoreCase([exp('must_find', 'src/db/admin-search.ts', 5, 7)], [], 0);

describe('rangesIntersect / matchesExpectation (AC-11)', () => {
  it('is inclusive at the edges and false just outside', () => {
    expect(rangesIntersect(1, 5, 5, 9)).toBe(true);
    expect(rangesIntersect(1, 4, 5, 9)).toBe(false);
    expect(rangesIntersect(10, 12, 1, 10)).toBe(true);
    expect(rangesIntersect(11, 12, 1, 10)).toBe(false);
  });

  it('requires exact file equality', () => {
    const e = exp('must_find', 'src/a.ts', 1, 5);
    expect(matchesExpectation(finding('f', 'src/a.ts', 3), e)).toBe(true);
    expect(matchesExpectation(finding('f', 'src/a.tsx', 3), e)).toBe(false);
    expect(matchesExpectation(finding('f', 'a.ts', 3), e)).toBe(false);
  });
});

describe('scoreCase (AC-12..15)', () => {
  it('matches a must_find with a kept finding and passes', () => {
    const s = caseA();
    expect(s).toMatchObject({ must_find_total: 1, must_find_matched: 1, kept_total: 2, noise_total: 0, dropped_total: 1, pass: true });
    expect(s.matched_expectations).toEqual([0]);
    expect(s.recall).toBe(1);
    expect(s.precision).toBe(1);
    expect(s.citation_accuracy).toBeCloseTo(2 / 3);
  });

  it('a dropped finding never matches (only kept findings are passed in)', () => {
    const s = scoreCase([exp('must_find', 'src/config.ts', 12, 12)], [], 1);
    expect(s.must_find_matched).toBe(0);
    expect(s.pass).toBe(false);
    expect(s.recall).toBe(0);
    expect(s.citation_accuracy).toBe(0);
  });

  it('flags noise on a must_not_flag and fails the case', () => {
    const s = caseB();
    expect(s.noise_total).toBe(1);
    expect(s.noise_finding_ids).toEqual(['b1']);
    expect(s.pass).toBe(false);
    expect(s.precision).toBe(0);
  });

  it('a must_not_flag case with no findings passes with fallbacks of 1', () => {
    const s = scoreCase([exp('must_not_flag', 'x.ts', 1, 2)], [], 0);
    expect(s).toMatchObject({ pass: true, recall: 1, precision: 1, citation_accuracy: 1 });
  });
});

describe('scoreBatch (AC-16..21)', () => {
  it('AC-20: three-case fixture', () => {
    const b = scoreBatch([caseA(), caseB(), caseC()]);
    expect(b).toMatchObject({
      must_find_total: 2,
      must_find_matched: 1,
      kept_total: 3,
      noise_total: 1,
      dropped_total: 1,
      recall: 0.5,
      citation_accuracy: 0.75,
      cases_passed: 1,
      cases_total: 3,
    });
    expect(b.precision).toBeCloseTo(2 / 3);
  });

  it('AC-21: an errored (null) case only raises cases_total', () => {
    const base = scoreBatch([caseA(), caseB(), caseC()]);
    const b = scoreBatch([caseA(), caseB(), caseC(), null]);
    expect(b).toEqual({ ...base, cases_total: 4 });
  });

  it('all-zero input falls back to 1', () => {
    expect(scoreBatch([])).toEqual({
      cases_total: 0, cases_passed: 0, must_find_total: 0, must_find_matched: 0,
      kept_total: 0, noise_total: 0, dropped_total: 0, recall: 1, precision: 1, citation_accuracy: 1,
    });
    expect(scoreBatch([null]).recall).toBe(1);
  });

  it('micro-averages (sums counts before dividing)', () => {
    // 1/1 recall on a tiny case, 0/3 on a big one -> 0.25, not the mean of 1 and 0.
    const small = scoreCase([exp('must_find', 'a.ts', 1, 1)], [finding('x', 'a.ts', 1)], 0);
    const big = scoreCase(
      [exp('must_find', 'b.ts', 1, 1), exp('must_find', 'b.ts', 5, 5), exp('must_find', 'b.ts', 9, 9)],
      [],
      0,
    );
    expect(scoreBatch([small, big]).recall).toBe(0.25);
  });
});

describe('NFR-2 performance', () => {
  it('scores 1,000 findings x 100 expectations in under 50 ms', () => {
    const expectations = Array.from({ length: 100 }, (_, i) =>
      exp(i % 2 ? 'must_find' : 'must_not_flag', `src/f${i}.ts`, i + 1, i + 3),
    );
    const kept = Array.from({ length: 1000 }, (_, i) => finding(`k${i}`, `src/f${i % 150}.ts`, i % 20));
    const t0 = performance.now();
    scoreCase(expectations, kept, 5);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe('purity (AC-22 / AC-120)', () => {
  it('score.ts mentions no provider, network or env token and uses type-only imports', () => {
    const src = readFileSync(new URL('../src/eval/score.ts', import.meta.url), 'utf8');
    for (const tok of ['openai', 'anthropic', 'openrouter', 'completeStructured', 'LLMProvider', 'fetch(', 'process.env']) {
      expect(src.toLowerCase()).not.toContain(tok.toLowerCase());
    }
    const imports = src.split('\n').filter((l) => /^import\b/.test(l));
    expect(imports.every((l) => l.startsWith('import type'))).toBe(true);
  });
});
