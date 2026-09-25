import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { filterByIntent } from '../src/index.js';
import { scoreFromFindings } from '../src/review/reduce.js';

/**
 * filterByIntent — the second mechanical gate, run after citation grounding.
 * `out_of_scope` is a HINT the reviewer sets from the derived PR intent, never
 * a waiver: a CRITICAL always leaves one signal even when tagged out of scope.
 */

let seq = 0;
function finding(
  severity: Finding['severity'],
  opts: { outOfScope?: boolean; confidence?: number } = {},
): Finding {
  seq += 1;
  return {
    id: `f-${seq}`,
    severity,
    category: 'security',
    title: `${severity} finding #${seq}`,
    file: 'src/x.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'because',
    confidence: opts.confidence ?? 0.5,
    out_of_scope: opts.outOfScope,
  } as Finding;
}

describe('filterByIntent', () => {
  it('keeps in-scope findings (out_of_scope absent)', () => {
    const f = finding('WARNING');
    const { kept, dropped } = filterByIntent([f]);
    expect(kept).toEqual([f]);
    expect(dropped).toHaveLength(0);
  });

  it('keeps findings explicitly tagged in-scope (out_of_scope: false)', () => {
    const f = finding('WARNING', { outOfScope: false });
    const { kept, dropped } = filterByIntent([f]);
    expect(kept).toEqual([f]);
    expect(dropped).toHaveLength(0);
  });

  it('drops an out-of-scope SUGGESTION with reason "out of scope: <title>"', () => {
    const f = finding('SUGGESTION', { outOfScope: true });
    const { kept, dropped } = filterByIntent([f]);
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.finding).toBe(f);
    expect(dropped[0]!.reason).toBe(`out of scope: ${f.title}`);
  });

  it('drops an out-of-scope WARNING the same way (< CRITICAL)', () => {
    const f = finding('WARNING', { outOfScope: true });
    const { kept, dropped } = filterByIntent([f]);
    expect(kept).toHaveLength(0);
    expect(dropped[0]!.reason).toContain('out of scope');
  });

  it('two out-of-scope CRITICALs collapse to exactly one kept — the highest confidence', () => {
    const low = finding('CRITICAL', { outOfScope: true, confidence: 0.4 });
    const high = finding('CRITICAL', { outOfScope: true, confidence: 0.9 });
    const { kept, dropped } = filterByIntent([low, high]);
    expect(kept).toEqual([high]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.finding).toBe(low);
    expect(dropped[0]!.reason).toBe('out of scope (collapsed)');
  });

  it('an out-of-scope CRITICAL survives alone (no collapse needed)', () => {
    const f = finding('CRITICAL', { outOfScope: true, confidence: 0.7 });
    const { kept, dropped } = filterByIntent([f]);
    expect(kept).toEqual([f]);
    expect(dropped).toHaveLength(0);
  });

  it('score is recomputed from the survivors, not the pre-filter set', () => {
    const keptWarning = finding('WARNING');
    const droppedSuggestion = finding('SUGGESTION', { outOfScope: true });
    const { kept } = filterByIntent([keptWarning, droppedSuggestion]);
    // WARNING penalty 12 -> 88; the dropped SUGGESTION must not count.
    expect(scoreFromFindings(kept)).toBe(88);
  });

  it('is a no-op when no finding is tagged out of scope (the "no intent" case)', () => {
    // Without a derived intent, the reviewer never sets `out_of_scope`, so
    // every finding takes this same absent-tag path — filterByIntent behaves
    // identically whether or not the caller decided to invoke it.
    const findings = [finding('CRITICAL'), finding('WARNING'), finding('SUGGESTION')];
    const { kept, dropped } = filterByIntent(findings);
    expect(kept).toEqual(findings);
    expect(dropped).toHaveLength(0);
  });
});
