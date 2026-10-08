import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff, scoreCase, scoreBatch } from '@devdigest/reviewer-core';
import { SEED_EVAL_CASES, SEED_BATCHES } from '../src/db/seed-eval-cases.js';
import { SECURITY_REVIEWER_PROMPT } from '../src/db/seed-prompts.js';

/** New-side line numbers of every `+` line of a raw diff (headers excluded). */
function addedLines(raw: string): Set<number> {
  const added = new Set<number>();
  let newLine = 0;
  for (const l of raw.split('\n')) {
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) {
      newLine = Number(h[1]);
      continue;
    }
    if (l.startsWith('+++') || l.startsWith('---')) continue;
    if (l.startsWith('+')) added.add(newLine++);
    else if (!l.startsWith('-')) newLine++;
  }
  return added;
}

describe('seeded eval cases (AC-66..AC-68)', () => {
  const all = SEED_EVAL_CASES.flatMap((c) => c.expectations.map((e) => ({ c, e })));

  it('has 8 cases: 5 must_find (6 expectations) and 3 must_not_flag', () => {
    expect(SEED_EVAL_CASES).toHaveLength(8);
    expect(new Set(SEED_EVAL_CASES.map((c) => c.name)).size).toBe(8);
    const mustFindCases = SEED_EVAL_CASES.filter((c) => c.expectations.some((e) => e.kind === 'must_find'));
    const notFlagCases = SEED_EVAL_CASES.filter((c) => c.expectations.every((e) => e.kind === 'must_not_flag'));
    expect(mustFindCases).toHaveLength(5);
    expect(notFlagCases).toHaveLength(3);
    expect(all.filter((x) => x.e.kind === 'must_find')).toHaveLength(6);
    expect(all.filter((x) => x.e.kind === 'must_not_flag')).toHaveLength(3);
  });

  it('every diff parses to at least 1 file and contains each expectation file (AC-68)', () => {
    for (const c of SEED_EVAL_CASES) {
      const files = parseUnifiedDiff(c.inputDiff).files.map((f) => f.path);
      expect(files.length, c.name).toBeGreaterThan(0);
      for (const e of c.expectations) expect(files, c.name).toContain(e.file);
    }
  });

  it('every must_find range intersects an added line (AC-67)', () => {
    for (const { c, e } of all.filter((x) => x.e.kind === 'must_find')) {
      const added = addedLines(c.inputDiff);
      const hit = [...added].some((n) => n >= e.start_line && n <= e.end_line);
      expect(hit, `${c.name} ${e.file}:${e.start_line}-${e.end_line}`).toBe(true);
    }
  });

  it('the Stripe key sits on new-side line 12 of src/config.ts (AC-64)', () => {
    const stripe = SEED_EVAL_CASES[0]!;
    const line12 = stripe.inputDiff
      .split('\n')
      .filter((l) => !l.startsWith('---') && !l.startsWith('+++'));
    expect(addedLines(stripe.inputDiff).has(12)).toBe(true);
    expect(line12.find((l) => l.includes('sk_live_'))).toBeTruthy();
  });
});

describe('seeded batches (AC-69)', () => {
  it('has 2 batches whose scorer results are computed from the stored outputs', () => {
    expect(SEED_BATCHES).toHaveLength(2);
    const totals = SEED_BATCHES.map((b) => {
      expect(b.outputs).toHaveLength(8);
      const scores = b.outputs.map((o) => {
        const c = SEED_EVAL_CASES.find((x) => x.name === o.caseName);
        expect(c, o.caseName).toBeDefined();
        return scoreCase(c!.expectations, o.kept, o.dropped.length);
      });
      return scoreBatch(scores);
    });
    for (const t of totals) {
      expect(t.cases_total).toBe(8);
      expect(t.must_find_total).toBe(6);
    }
    // The newer batch must differ visibly from the older one.
    expect(Math.round(totals[1]!.recall * 100)).not.toBe(Math.round(totals[0]!.recall * 100));
    expect(totals[1]!.cases_passed).toBeGreaterThan(totals[0]!.cases_passed);
  });

  it('the older batch carries a different prompt snapshot than the newer one', () => {
    const [older, newer] = SEED_BATCHES;
    expect(newer!.promptSnapshot(SECURITY_REVIEWER_PROMPT)).toBe(SECURITY_REVIEWER_PROMPT);
    const snap = older!.promptSnapshot(SECURITY_REVIEWER_PROMPT);
    expect(snap).not.toBe(SECURITY_REVIEWER_PROMPT);
    expect(SECURITY_REVIEWER_PROMPT.startsWith(snap)).toBe(true);
  });
});
