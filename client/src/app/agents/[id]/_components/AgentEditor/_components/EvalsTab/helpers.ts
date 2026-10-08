/* Pure helpers for the Evals tab — no React. */
import type { EvalBatch, EvalCaseRecord } from "@devdigest/shared";

export type CaseStatus = "passed" | "failed" | "neverRun";

export function hasRunningBatch(batches: EvalBatch[]): boolean {
  return batches.some((b) => b.status === "running");
}

/** Delta of one metric between two batches; undefined when it cannot be computed. */
export function metricDelta(
  newest: EvalBatch,
  previous: EvalBatch | undefined,
  key: "recall" | "precision" | "citation_accuracy",
): number | undefined {
  const a = newest[key];
  const b = previous?.[key];
  return a == null || b == null ? undefined : a - b;
}

export function caseStatus(c: EvalCaseRecord): CaseStatus {
  if (!c.last_run) return "neverRun";
  // A last run with no verdict is an errored run, not a missing one (AC-79).
  return c.last_run.pass === true ? "passed" : "failed";
}
