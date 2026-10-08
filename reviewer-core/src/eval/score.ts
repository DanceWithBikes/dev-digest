import type { Finding, EvalExpectation } from '@devdigest/shared';

/**
 * Eval scorers — pure functions over already-produced findings. No model call,
 * no I/O (AC-22). A case is scored from its expectations plus the findings the
 * grounding gate kept; a dropped finding only contributes to the dropped count.
 */

/** Raw counts + derived metrics for one case. */
export interface CaseScore {
  must_find_total: number;
  must_find_matched: number;
  kept_total: number;
  noise_total: number;
  dropped_total: number;
  /** Indices into `expectations` of the `must_find` items a kept finding matched. */
  matched_expectations: number[];
  /** Ids of kept findings that match a `must_not_flag` expectation. */
  noise_finding_ids: string[];
  pass: boolean;
  recall: number;
  precision: number;
  citation_accuracy: number;
}

/** Micro-averaged result over a batch of cases. */
export interface BatchScore {
  cases_total: number;
  cases_passed: number;
  must_find_total: number;
  must_find_matched: number;
  kept_total: number;
  noise_total: number;
  dropped_total: number;
  recall: number;
  precision: number;
  citation_accuracy: number;
}

/** Inclusive line-range intersection. */
export function rangesIntersect(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** AC-11: exact file equality and intersecting inclusive line ranges. */
export function matchesExpectation(
  finding: Pick<Finding, 'file' | 'start_line' | 'end_line'>,
  expectation: Pick<EvalExpectation, 'file' | 'start_line' | 'end_line'>,
): boolean {
  return (
    finding.file === expectation.file &&
    rangesIntersect(
      finding.start_line,
      finding.end_line,
      expectation.start_line,
      expectation.end_line,
    )
  );
}

/** `num / den`, or 1 when the denominator is 0 (nothing to get wrong). */
function ratio(num: number, den: number): number {
  return den === 0 ? 1 : num / den;
}

function metrics(c: {
  must_find_total: number;
  must_find_matched: number;
  kept_total: number;
  noise_total: number;
  dropped_total: number;
}) {
  return {
    recall: ratio(c.must_find_matched, c.must_find_total),
    precision: ratio(c.kept_total - c.noise_total, c.kept_total),
    citation_accuracy: ratio(c.kept_total, c.kept_total + c.dropped_total),
  };
}

/**
 * Score one case. `kept` are the findings that survived the grounding gate;
 * `droppedCount` is how many it dropped.
 */
export function scoreCase(
  expectations: readonly EvalExpectation[],
  kept: readonly Finding[],
  droppedCount: number,
): CaseScore {
  const matched: number[] = [];
  let mustFindTotal = 0;
  expectations.forEach((exp, i) => {
    if (exp.kind !== 'must_find') return;
    mustFindTotal++;
    if (kept.some((f) => matchesExpectation(f, exp))) matched.push(i);
  });

  const forbidden = expectations.filter((e) => e.kind === 'must_not_flag');
  const noiseIds = kept
    .filter((f) => forbidden.some((e) => matchesExpectation(f, e)))
    .map((f) => f.id);

  const counts = {
    must_find_total: mustFindTotal,
    must_find_matched: matched.length,
    kept_total: kept.length,
    noise_total: noiseIds.length,
    dropped_total: droppedCount,
  };
  return {
    ...counts,
    matched_expectations: matched,
    noise_finding_ids: noiseIds,
    pass: matched.length === mustFindTotal && noiseIds.length === 0,
    ...metrics(counts),
  };
}

/**
 * Micro-average over cases: raw counts are summed before dividing. A `null`
 * entry is a case that errored; it counts only toward `cases_total`.
 */
export function scoreBatch(cases: readonly (CaseScore | null)[]): BatchScore {
  const sum = {
    must_find_total: 0,
    must_find_matched: 0,
    kept_total: 0,
    noise_total: 0,
    dropped_total: 0,
  };
  let passed = 0;
  for (const c of cases) {
    if (!c) continue;
    sum.must_find_total += c.must_find_total;
    sum.must_find_matched += c.must_find_matched;
    sum.kept_total += c.kept_total;
    sum.noise_total += c.noise_total;
    sum.dropped_total += c.dropped_total;
    if (c.pass) passed++;
  }
  return { cases_total: cases.length, cases_passed: passed, ...sum, ...metrics(sum) };
}
